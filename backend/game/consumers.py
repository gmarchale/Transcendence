import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from asgiref.sync import sync_to_async
from .models import Game
from django.contrib.auth import get_user_model
from django.db import models
from django.db import transaction
from django.db.models import Q
import asyncio
import logging
import time
from datetime import timedelta
import random
from django.utils import timezone
from .game_state_manager import GameStateManager

logger = logging.getLogger('game')
User = get_user_model()

class GameUIConsumer(AsyncWebsocketConsumer):
    """Consumer for handling UI interactions and profile updates"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.user_group = None

    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return
            
        self.user_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if self.user_group:
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive_json(self, content):
        message_type = content.get('type')
        if message_type == 'profile_update':
            # Handle profile updates
            await self.handle_profile_update(content)
        elif message_type == 'ui_action':
            # Handle UI actions
            await self.handle_ui_action(content)

    async def handle_profile_update(self, content):
        try:
            # Update user profile and broadcast changes
            await self.send_json({
                'type': 'profile_updated',
                'data': content.get('data')
            })
        except Exception as e:
            logger.error(f"Error handling profile update: {str(e)}", exc_info=True)

    async def handle_ui_action(self, content):
        try:
            # Handle UI actions and send appropriate responses
            await self.send_json({
                'type': 'ui_action_response',
                'action': content.get('action'),
                'status': 'success'
            })
        except Exception as e:
            logger.error(f"Error handling UI action: {str(e)}", exc_info=True)

class GamePlayConsumer(AsyncWebsocketConsumer):
    """Consumer for handling specific game sessions"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.game = None
        self.channel_group_name = None
        self.user_group = None
        self.is_connected = False
        self.game_loop_task = None

    @database_sync_to_async
    def get_game_and_validate(self, game_id):
        """Get game and validate user participation"""
        try:
            game = Game.objects.select_related('player1', 'player2').get(id=game_id)
            if game.player1 != self.user and (game.player2 is None or game.player2 != self.user):
                return None
            return game
        except Game.DoesNotExist:
            return None

    async def connect(self):
        """Handle WebSocket connection"""
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        self.game_id = self.scope['url_route']['kwargs']['game_id']
        self.channel_group_name = f'game_{self.game_id}'
        
        # Get and validate game asynchronously
        game = await self.get_game_and_validate(self.game_id)
        if not game:
            await self.close()
            return

        self.game = game
        await self.channel_layer.group_add(self.channel_group_name, self.channel_name)
        await self.accept()

        # Send initial game state
        game_state = GameStateManager.get_game_state(str(self.game.id))
        if game_state:
            await self.send_json({
                'type': 'game_state_update',
                'game_state': game_state
            })

        # Start game loop if this is player2 connecting
        if game.player2 == self.user and game.status == 'playing':
            self.game_loop_task = asyncio.create_task(self.game_loop())

    @database_sync_to_async
    def get_game_by_id(self, game_id):
        """Get game from database"""
        try:
            return Game.objects.select_related('player1', 'player2').get(id=game_id)
        except Game.DoesNotExist:
            return None
        except Exception as e:
            logger.error(f"Error getting game: {str(e)}")
            return None

    @database_sync_to_async
    def create_game_sync(self):
        """Create a new game in the database"""
        try:
            game = Game.objects.create(player1=self.user)
            # Initialize the game state in memory
            GameStateManager.create_game(str(game.id), str(self.user.id), self.user.username)
            logger.info(f"Game {game.id} created by {self.user.username}")
            return game
        except Exception as e:
            logger.error(f"Error creating game: {str(e)}", exc_info=True)
            return None

    async def create_game(self):
        """Create a new game"""
        try:
            game = await self.create_game_sync()
            if game:
                # Initialize game state
                initial_state = GameStateManager.create_game(
                    str(game.id),
                    str(game.player1.id),
                    game.player1.username
                )
                
                # Join the game's channel group
                self.game = game
                self.channel_group_name = f"game_{game.id}"
                await self.channel_layer.group_add(
                    self.channel_group_name,
                    self.channel_name
                )

                # Send game_created message with proper JSON structure
                await self.send_json({
                    'type': 'game_created',
                    'id': str(game.id),
                    'player_id': str(self.user.id),
                    'game_state': initial_state
                })
                
        except Exception as e:
            logger.error(f"Error creating game: {str(e)}")
            await self.send_json({
                'type': 'error',
                'message': 'Failed to create game'
            })

    async def join_game(self):
        """Join an existing game"""
        try:
            game = await self.find_available_game()
            if not game:
                logger.info("No available games found")
                return None

            if game.status == 'waiting' and game.player1 != self.user:
                # Join as player 2
                game.player2 = self.user
                game.status = 'playing'
                await sync_to_async(game.save)()

                # Join the game in memory
                GameStateManager.join_game(str(game.id), str(self.user.id), self.user.username)

                self.game = game
                self.channel_group_name = f"game_{game.id}"
                await self.channel_layer.group_add(
                    self.channel_group_name,
                    self.channel_name
                )

                # Start the game loop when second player joins
                self.game_loop_task = asyncio.create_task(self.game_loop())

                # Get current game state
                game_state = GameStateManager.get_game_state(str(game.id))

                # Broadcast join message
                await self.channel_layer.group_send(
                    self.channel_group_name,
                    {
                        'type': 'game_joined',
                        'game_id': str(game.id),
                        'player1_id': game.player1.id,
                        'player2_id': self.user.id,
                        'game_state': game_state
                    }
                )
                return game

            else:
                await self.send_json({
                    'type': 'error',
                    'message': 'Game is not available for joining'
                })
                return None

        except Exception as e:
            logger.error(f"Error joining game: {str(e)}", exc_info=True)
            return None

    async def paddle_move(self, direction, game_id):
        """Handle paddle movement"""
        try:
            new_state = GameStateManager.move_paddle(str(game_id), str(self.user.id), direction)
            if new_state:
                await self.channel_layer.group_send(
                    self.channel_group_name,
                    {
                        'type': 'game_state_update',
                        'game_state': new_state
                    }
                )
        except Exception as e:
            logger.error(f"Error in paddle_move: {str(e)}", exc_info=True)

    async def game_loop(self):
        """Game loop to update ball position"""
        try:
            while self.game and self.is_connected:
                new_state = GameStateManager.update_ball_position(str(self.game.id))
                if new_state:
                    if new_state['status'] == 'finished':
                        await self.end_game(new_state['winner'])
                        break

                    await self.channel_layer.group_send(
                        self.channel_group_name,
                        {
                            'type': 'game_state_update',
                            'game_state': new_state
                        }
                    )
                await asyncio.sleep(1/60)  # 60 FPS
        except Exception as e:
            logger.error(f"Error in game loop: {str(e)}", exc_info=True)

    async def disconnect(self, close_code):
        """Handle disconnection"""
        try:
            if self.game:
                # End the game and clean up
                final_state = GameStateManager.end_game(str(self.game.id), reason='disconnected')
                if final_state:
                    await self.channel_layer.group_send(
                        self.channel_group_name,
                        {
                            'type': 'game_state_update',
                            'game_state': final_state
                        }
                    )
                
                # Save final state to database
                await self.update_game_state_sync(self.game.id, final_state)
                
                # Clean up
                GameStateManager.remove_game(str(self.game.id))
                
                if self.game_loop_task:
                    self.game_loop_task.cancel()
                    
            await self.channel_layer.group_discard(
                self.channel_group_name,
                self.channel_name
            )
            self.is_connected = False
        except Exception as e:
            logger.error(f"Error in disconnect: {str(e)}", exc_info=True)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            if not text_data:
                return
                
            data = json.loads(text_data)
            message_type = data.get('type')
            
            # Handle heartbeat messages
            if message_type == 'heartbeat':
                await self.send_json({
                    'type': 'heartbeat_response'
                })
                return
            
            # Validate user session
            if not self.user.is_authenticated:
                await self.send_json({
                    'type': 'error',
                    'message': 'Invalid session'
                })
                await self.close()
                return

            if message_type == 'create_game':
                await self.create_game()
            
            elif message_type == 'join_game':
                game_id = data.get('game_id')
                await self.join_game()
            
            elif message_type == 'paddle_move':
                game_id = data.get('game_id')
                direction = data.get('direction')
                if not game_id or not direction:
                    await self.send_json({
                        'type': 'error',
                        'message': 'Missing required parameters'
                    })
                    return
                await self.paddle_move(direction, game_id)
            
            elif message_type == 'player_ready':
                if not self.game:
                    await self.send_json({
                        'type': 'error',
                        'message': 'No active game'
                    })
                    return

                # Update player ready state
                new_state = GameStateManager.set_player_ready(str(self.game.id), str(self.user.id))
                if new_state:
                    # If both players are ready and game starts, start the game loop
                    if new_state['status'] == 'playing':
                        self.game_loop_task = asyncio.create_task(self.game_loop())
                    
                    # Broadcast the updated state
                    await self.channel_layer.group_send(
                        self.channel_group_name,
                        {
                            'type': 'game_state_update',
                            'game_state': new_state
                        }
                    )

            else:
                await self.send_json({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                })
                
        except json.JSONDecodeError:
            await self.send_json({
                'type': 'error',
                'message': 'Invalid JSON message'
            })
        except Exception as e:
            logger.error(f"Error in receive: {str(e)}", exc_info=True)
            await self.send_json({
                'type': 'error',
                'message': 'Internal server error'
            })

    @database_sync_to_async
    def get_game_with_players(self, game_id):
        """Get game with player info from database"""
        try:
            game = Game.objects.select_related('player1', 'player2').get(id=game_id)
            return game
        except Game.DoesNotExist:
            logger.error(f"Game {game_id} not found")
            return None
        except Exception as e:
            logger.error(f"Error getting game: {str(e)}", exc_info=True)
            return None

    @database_sync_to_async
    def update_game_player2(self, game, player2):
        """Update game's player2 and status"""
        try:
            game.player2 = player2
            game.status = 'active'
            game.save(update_fields=['player2', 'status', 'updated_at'])
            return game
        except Exception as e:
            logger.error(f"Error updating game: {str(e)}", exc_info=True)
            return None

    @database_sync_to_async
    def get_game(self, game_id):
        """Get game by id with player information"""
        try:
            return Game.objects.select_related('player1', 'player2').get(id=game_id)
        except Game.DoesNotExist:
            return None
        except Exception as e:
            logger.error(f"Error getting game: {str(e)}", exc_info=True)
            return None

    @database_sync_to_async
    def find_available_game(self):
        """Find an available game to join"""
        try:
            # Look for a game waiting for players
            game = Game.objects.select_related('player1', 'player2').filter(
                status='waiting'
            ).first()
            
            if game:
                logger.info(f"Found available game {game.id}")
            return game
            
        except Exception as e:
            logger.error(f"Error finding available game: {str(e)}", exc_info=True)
            return None

    async def game_joined(self, event):
        try:
            # Initialize game state
            if not hasattr(self, '_game_state'):
                self._game_state = event['game_state']
            
            await self.send_json({
                'type': 'game_joined',
                'game_id': event['game_id'],
                'player1_id': event['player1_id'],
                'player2_id': event['player2_id'],
                'game_state': self._game_state
            })
            
            # Start game loop when both players have joined
            if self.game and self.game.status == 'active' and self.game.player1 and self.game.player2:
                asyncio.create_task(self.game_loop())
        except Exception as e:
            logger.error(f'Error in game_joined: {str(e)}', exc_info=True)

    async def game_state_update(self, event):
        """Handle game state update"""
        try:
            if event.get('type') == 'game_end':
                logger.warning("Received game_end event in game_state_update")
                await self.send_json(event)
            else:
                await self.send_json({
                    'type': 'game_state_update',
                    'game_state': event.get('game_state', {}),
                    'update_type': event.get('update_type', 'all')
                })
        except Exception as e:
            logger.error(f"Error in game_state_update: {str(e)}", exc_info=True)

    @database_sync_to_async
    def update_game_scores(self, score_player1, score_player2):
        """Update game scores in database"""
        try:
            Game.objects.filter(id=self.game.id).update(
                score_player1=score_player1,
                score_player2=score_player2,
                updated_at=timezone.now()
            )
        except Exception as e:
            logger.error(f"Error updating game scores: {str(e)}", exc_info=True)

    async def end_game(self, winner=None):
        """End the game and clean up"""
        try:
            logger.info("[GAME] === ENDING GAME ===")
            logger.info(f"[GAME] Winner: {winner}")
            
            if not self.game:
                return

            # Get final state from GameStateManager
            final_state = GameStateManager.end_game(str(self.game.id))
            if final_state:
                logger.info(f"[GAME] Final Score: {final_state['score']}")
                
                # Get winner ID based on who won
                winner_id = None
                if winner == 'player1':
                    winner_id = self.game.player1.id
                elif winner == 'player2':
                    winner_id = self.game.player2.id
                
                # Update game status and stats in database
                await self.update_game_status(
                    status='finished',
                    winner=winner_id,
                    duration=final_state.get('duration'),
                    duration_formatted=final_state.get('duration_formatted'),
                    score_player1=final_state['score']['player1'],
                    score_player2=final_state['score']['player2']
                )

                # Broadcast final state to all players
                await self.channel_layer.group_send(
                    self.channel_group_name,
                    {
                        'type': 'game_state_update',
                        'game_state': final_state
                    }
                )

                # Clean up
                GameStateManager.remove_game(str(self.game.id))
                if self.game_loop_task:
                    self.game_loop_task.cancel()

        except Exception as e:
            logger.error(f"[GAME] Error ending game: {str(e)}")

    async def game_end_message(self, event):
        """Handle game end message"""
        try:
            await self.send_json({
                'type': 'game_end',
                'winner': event['winner'],
                'duration': event['duration'],
                'final_score': event['final_score']
            })
        except Exception as e:
            logger.error(f"Error in game_end_message handler: {str(e)}", exc_info=True)

    async def send_json(self, content):
        """Send JSON message to WebSocket"""
        try:
            await self.send(text_data=json.dumps(content))
        except Exception as e:
            logger.error(f"Error sending message: {str(e)}", exc_info=True)

    @database_sync_to_async
    def update_game_status(self, status=None, winner=None, duration=None, duration_formatted=None, score_player1=None, score_player2=None):
        """Update game status in database"""
        try:
            if not self.game:
                return
                
            if status:
                self.game.status = status
            if winner:
                self.game.winner = winner
            if duration is not None:
                self.game.duration = duration
            if duration_formatted:
                self.game.duration_formatted = duration_formatted
            if score_player1 is not None:
                self.game.score_player1 = score_player1
            if score_player2 is not None:
                self.game.score_player2 = score_player2
            
            self.game.save()
            return True
        except Exception as e:
            logger.error(f"Error updating game status: {str(e)}")
            return False

    async def game_start(self, event):
        """Handle game start event, particularly for tournament matches"""
        try:
            # Get the game
            game = await sync_to_async(Game.objects.get)(id=event['game_id'])
            self.game = game
            
            # Join the game's WebSocket group
            self.channel_group_name = f"game_{game.id}"
            await self.channel_layer.group_add(
                self.channel_group_name,
                self.channel_name
            )

            # Initialize game state if not already done
            if not GameStateManager.game_exists(str(game.id)):
                # Initialize the game state in memory
                GameStateManager.create_game(str(game.id), str(game.player1.id), game.player1.username)
                if game.player2:
                    GameStateManager.join_game(str(game.id), str(game.player2.id), game.player2.username)

            # Get game state
            game_state = GameStateManager.get_game_state(str(game.id))

            # Send game joined message to both players
            await self.send_json({
                'type': 'game_joined',
                'game_id': str(game.id),
                'player1_id': str(game.player1.id),
                'player2_id': str(game.player2.id) if game.player2 else None,
                'game_state': game_state,
                'tournament_match_id': event.get('tournament_match_id')
            })

            # Start game immediately for tournament matches
            if game.player1 and game.player2 and game.status == 'playing':
                if not self.game_loop_task:
                    self.game_loop_task = asyncio.create_task(self.game_loop())
                    logger.info(f"Started game loop for game {game.id}")

        except Game.DoesNotExist:
            logger.error(f"Game {event['game_id']} not found")
        except Exception as e:
            logger.error(f"Error in game_start: {str(e)}", exc_info=True)
