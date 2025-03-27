import json
import logging
import asyncio
from channels.generic.websocket import AsyncJsonWebsocketConsumer
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

class GameUIConsumer(AsyncJsonWebsocketConsumer):
    """Consumer for handling UI interactions and profile updates"""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.user_group = None
        self.game = None
        self.channel_group_name = None
        self.is_connected = False
        self.game_loop_task = None

    async def connect(self):
        """Handle WebSocket connection"""
        print(f"[DEBUG] GameUIConsumer: Starting connection")
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        # Add user to their personal group for direct messages
        self.user_group = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.user_group, self.channel_name)
        await self.accept()
        self.is_connected = True

        # Send connection established message with user info
        await self.send_json({
            'type': 'connection_established',
            'user': {
                'id': self.user.id,
                'username': self.user.username
            }
        })

    async def disconnect(self, close_code):
        """Handle WebSocket disconnect"""
        print(f"[DEBUG] WebSocket disconnecting with code {close_code}")
        try:
            # Cancel game loop if it's running
            if hasattr(self, 'game_loop_task') and self.game_loop_task:
                print(f"[DEBUG] Cancelling game loop task")
                self.game_loop_task.cancel()
                self.game_loop_task = None

            # Leave all game groups
            for group in self.groups:
                await self.channel_layer.group_discard(group, self.channel_name)
                print(f"[DEBUG] Left group {group}")

            # Remove user from their personal group
            if self.user_group:
                await self.channel_layer.group_discard(self.user_group, self.channel_name)

            # End game if we have one
            if self.game:
                await self.end_game(str(self.game.id), reason='disconnected')

        except Exception as e:
            print(f"[ERROR] Error in disconnect: {str(e)}")
            logger.error(f"Error in disconnect: {str(e)}", exc_info=True)

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
    def update_game_player2(self, game, player):
        """Update game's player2 or player1 based on player ID"""
        try:
            # Check if the player is player1
            if game.player1 and str(game.player1.id) == str(player.id):
                logger.info(f"Player {player.username} is already player1 in game {game.id}")
                # No need to update anything
                return game
            
            # Otherwise, join as player2
            game.player2 = player
            game.status = 'waiting'
            game.save(update_fields=['player2', 'status', 'updated_at'])
            return game
        except Exception as e:
            logger.error(f"Error updating game: {str(e)}", exc_info=True)
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

    @database_sync_to_async
    def update_game_status(self, game, status=None, winner=None, duration=None, duration_formatted=None, score_player1=None, score_player2=None):
        """Update game status in database"""
        try:
            if status:
                game.status = status
            if winner:
                game.winner = winner
            if duration is not None:
                game.duration = duration
            if duration_formatted:
                game.duration_formatted = duration_formatted
            if score_player1 is not None:
                game.score_player1 = score_player1
            if score_player2 is not None:
                game.score_player2 = score_player2
            
            game.save()
            return True
        except Exception as e:
            logger.error(f"Error updating game status: {str(e)}")
            return False

    async def game_loop(self, game_id):
        """Main game loop that updates ball position and broadcasts game state"""
        print(f"[DEBUG] Starting game loop for game {game_id}")
        try:
            while True:
                # Get current game state
                game_state = GameStateManager.get_game_state(str(game_id))
                if not game_state or game_state['status'] != 'playing':
                    print(f"[DEBUG] Game {game_id} is no longer playing, stopping game loop")
                    break

                # Update ball position
                GameStateManager.update_ball_position(str(game_id))
                game_state = GameStateManager.get_game_state(str(game_id))
                
                # Check if game has ended and needs to send notification
                if game_state and game_state.get('_send_end_notification') and game_state.get('_end_notification_data'):
                    print(f"[DEBUG] Game {game_id} has end notification flag set, sending notification")
                    # Send game end notification
                    notification_data = game_state.get('_end_notification_data')
                    print(f"[DEBUG] Notification data: {notification_data}")
                    await self.channel_layer.group_send(
                        game_group,
                        notification_data
                    )
                    print(f"[DEBUG] Game end notification sent to game group: {game_group}")
                    # Clear notification flag to avoid sending multiple times
                    GameStateManager._instances[str(game_id)]['_send_end_notification'] = False
                    print(f"[DEBUG] Cleared notification flag for game {game_id}")
                
                # Broadcast updated state
                game_group = f"game_{game_id}"
                await self.channel_layer.group_send(
                    game_group,
                    {
                        'type': 'game_state_update',
                        'game_state': game_state
                    }
                )

                # Sleep for a short duration to control game speed
                await asyncio.sleep(0.016)  # Approximately 60 FPS

        except Exception as e:
            print(f"[ERROR] Error in game loop: {str(e)}")
            logger.error(f"Error in game loop: {str(e)}", exc_info=True)
        finally:
            print(f"[DEBUG] Game loop ended for game {game_id}")
            if hasattr(self, 'game_loop_task'):
                self.game_loop_task = None

    async def paddle_move(self, direction, game_id):
        """Handle paddle movement"""
        try:
            new_state = GameStateManager.move_paddle(str(game_id), str(self.user.id), direction)
            if new_state:
                game_group = f"game_{game_id}"
                await self.channel_layer.group_send(
                    game_group,
                    {
                        'type': 'game_state_update',
                        'game_state': new_state
                    }
                )
        except Exception as e:
            logger.error(f"Error in paddle_move: {str(e)}", exc_info=True)

    async def end_game(self, game_id, reason=None):
        """End the game and clean up"""
        try:
            logger.info("[GAME] === ENDING GAME ===")
            logger.info(f"[GAME] Reason: {reason}")

            # Get final state from GameStateManager
            final_state = GameStateManager.end_game(str(game_id))
            if final_state:
                logger.info(f"[GAME] Final Score: {final_state['score']}")
                
                # Get game from database
                game = await database_sync_to_async(Game.objects.get)(id=game_id)
                
                # Get winner ID based on who won
                winner_id = None
                if final_state['winner'] == 'player1':
                    winner_id = game.player1.id
                elif final_state['winner'] == 'player2':
                    winner_id = game.player2.id
                
                # Update game status and stats in database
                await self.update_game_status(
                    game,
                    status='finished',
                    winner=winner_id,
                    duration=final_state.get('duration'),
                    duration_formatted=final_state.get('duration_formatted'),
                    score_player1=final_state['score']['player1'],
                    score_player2=final_state['score']['player2']
                )

                # Broadcast final state to all players
                game_group = f"game_{game_id}"
                await self.channel_layer.group_send(
                    game_group,
                    {
                        'type': 'game_state_update',
                        'game_state': final_state
                    }
                )

                # Clean up
                GameStateManager.remove_game(str(game_id))
                
                if hasattr(self, 'game_loop_task') and self.game_loop_task:
                    self.game_loop_task.cancel()
                    self.game_loop_task = None
                
                # # Nettoyer les parties inactives à chaque fin de partie
                # # Cela garantit que les parties abandonnées seront nettoyées régulièrement
                #     from .utils import cleanup_inactive_games
                # await database_sync_to_async(cleanup_inactive_games)()  # Exécution en mode synchrone via database_sync_to_async
                # logger.info("[GAME] Nettoyage des parties inactives effectué")

        except Exception as e:
            logger.error(f"[GAME] Error ending game: {str(e)}")

    async def receive_json(self, content):
        print('Received WebSocket message:', content)  
        message_type = content.get('type')
        
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
            
        try:
            if message_type == 'create_game':
                game = await self.create_game_sync()
                if game:
                    # Add creator to game group
                    game_group = f'game_{game.id}'
                    await self.channel_layer.group_add(game_group, self.channel_name)
                    
                    # Send game created message
                    await self.channel_layer.group_send(
                        game_group,
                        {
                            'type': 'game_created',
                            'game_id': str(game.id),
                            'player1_id': str(game.player1.id),
                            'player1_username': game.player1.username,
                            'game_state': GameStateManager.get_game_state(str(game.id))
                        }
                    )
                else:
                    await self.send_json({
                        'type': 'error',
                        'message': 'Failed to create game'
                    })
                    
            elif message_type == 'join_game':
                game_id = content.get('game_id')
                if not game_id:
                    await self.send_json({
                        'type': 'error',
                        'message': 'No game ID provided'
                    })
                    return
                
                # Get game from database
                game = await self.get_game_with_players(game_id)
                if not game:
                    await self.send_json({
                        'type': 'error',
                        'message': 'Game not found'
                    })
                    return
                
                # Update game with player2
                game = await self.update_game_player2(game, self.user)
                if not game:
                    await self.send_json({
                        'type': 'error',
                        'message': 'Failed to join game'
                    })
                    return
                
                # Add player2 to game state
                GameStateManager.join_game(str(game.id), str(self.user.id), self.user.username)
                
                # Add player to game group
                game_group = f'game_{game.id}'
                await self.channel_layer.group_add(game_group, self.channel_name)
                
                # Send game joined message
                await self.channel_layer.group_send(
                    game_group,
                    {
                        'type': 'game_joined',
                        'game_id': str(game.id),
                        'player1_id': str(game.player1.id),
                        'player2_id': str(game.player2.id),
                        'game_state': GameStateManager.get_game_state(str(game.id))
                    }
                )
                
            elif message_type == 'rejoin_game_group':
                game_id = content.get('game_id')
                if not game_id:
                    await self.send_json({
                        'type': 'error',
                        'message': 'No game ID provided'
                    })
                    return
                    
                game = await self.get_game_with_players(game_id)
                if not game:
                    await self.send_json({
                        'type': 'error',
                        'message': 'Game not found'
                    })
                    return
                    
                # Add player to game group
                game_group = f'game_{game.id}'
                await self.channel_layer.group_add(game_group, self.channel_name)
                
                # Send current game state
                await self.send_json({
                    'type': 'game_state_update',
                    'game_state': GameStateManager.get_game_state(str(game.id))
                })
                
            elif message_type == 'player_ready':
                await self.handle_player_ready(content.get('game_id'))
                
            elif message_type == 'paddle_move':
                game_id = content.get('game_id')
                direction = content.get('direction')
                if not game_id or not direction:
                    await self.send_json({
                        'type': 'error',
                        'message': 'Missing required parameters'
                    })
                    return
                await self.paddle_move(direction, game_id)
                
            else:
                await self.send_json({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                })
                
        except Exception as e:
            logger.error(f"Error handling message: {str(e)}", exc_info=True)
            await self.send_json({
                'type': 'error',
                'message': 'Internal server error'
            })

    async def game_created(self, event):
        """Handle game created message"""
        await self.send_json(event)

    async def game_joined(self, event):
        """Handle game joined message"""
        await self.send_json(event)

    async def game_state_update(self, event):
        """Handle game state update"""
        try:
            # Debug messages disabled
            # print(f"[DEBUG] GameUIConsumer: Received game state update, status: {event.get('game_state', {}).get('status')}")
            # print(f"[DEBUG] Game state update: {event.get('game_state')}")
            await self.send_json({
                'type': 'game_state_update',
                'game_state': event.get('game_state', {}),
                'update_type': event.get('update_type', 'all')
            })
        except Exception as e:
            logger.error(f"Error in game_state_update: {str(e)}", exc_info=True)

    async def game_end_message(self, event):
        """Handle game end message"""
        try:
            print(f"[DEBUG] game_end_message handler called with event: {event}")
            # Forward to clients
            await self.send_json({
                'type': 'game_end',
                'winner': event['winner'],
                'winner_id': event.get('winner_id'),  # Add winner_id to the message
                'duration': event['duration'],
                'duration_formatted': event.get('duration_formatted', '00:00'),
                'final_score': event['final_score']
            })
            print(f"[DEBUG] Sent game_end message to client")
            
            # Forward to tournament consumer if this game is part of a tournament
            # First try to get game_id from the event
            game_id = event.get('game_id')
            if game_id:
                print(f"[DEBUG] Got game_id from event: {game_id}")
            # If not in event, try to get it from self
            elif hasattr(self, 'game_id'):
                game_id = self.game_id
                print(f"[DEBUG] Got game_id from self: {game_id}")
            else:
                print(f"[DEBUG] Could not find game_id in event or self")
                
            if game_id:
                print(f"[DEBUG] Checking if game {game_id} is part of a tournament match")
                logger.info(f"Checking if game {game_id} is part of a tournament match")
                from tournament.models import TournamentMatch
                print(f"[DEBUG] Looking up tournament match for game {game_id}")
                try:
                    # Import at module level to avoid async issues
                    from channels.db import database_sync_to_async
                    
                    # Define a standalone function for the database query
                    @database_sync_to_async
                    def get_tournament_match(game_id):
                        try:
                            print(f"[DEBUG] Inside sync function: looking for match with game_id={game_id}")
                            match = TournamentMatch.objects.filter(game_id=game_id).first()
                            print(f"[DEBUG] Inside sync function: found match: {match}")
                            return match
                        except Exception as e:
                            print(f"[DEBUG] Inside sync function: error: {str(e)}")
                            return None
                    
                    # Call the function with await
                    match = await get_tournament_match(game_id)
                    print(f"[DEBUG] Tournament match lookup result: {match}")
                except Exception as e:
                    print(f"[DEBUG] Error looking up tournament match: {str(e)}")
                    match = None
                
                if match:
                    logger.info(f"Game {game_id} is part of tournament {match.tournament_id}, match {match.id}")
                    # Create tournament notification
                    tournament_notification = {
                        # Remove 'type' key to avoid conflict with the outer message type
                        'game_id': str(game_id),
                        'winner_id': event.get('winner_id'),
                        'tournament_id': str(match.tournament_id),  # Add tournament_id to the notification
                        'match_id': str(match.id),  # Add match_id to the notification
                        'duration': event.get('duration'),
                        'duration_formatted': event.get('duration_formatted', '00:00'),
                        'final_score': event.get('final_score')
                    }
                    
                    # If winner_id is not in the event, try to get it from the game state
                    if 'winner_id' not in tournament_notification or not tournament_notification['winner_id']:
                        game_state = GameStateManager.get_game_state(str(game_id))
                        if game_state and 'winner' in game_state:
                            winner_key = game_state['winner']
                            if 'players' in game_state and winner_key in game_state['players']:
                                if isinstance(game_state['players'][winner_key], dict) and 'id' in game_state['players'][winner_key]:
                                    tournament_notification['winner_id'] = game_state['players'][winner_key]['id']
                    
                    logger.info(f"Sending tournament notification: {tournament_notification}")
                    # Send to tournament group
                    tournament_group = f'tournament_{match.tournament_id}'
                    print(f"[DEBUG] Sending notification to tournament group: {tournament_group}")
                    try:
                        await self.channel_layer.group_send(
                            tournament_group,
                            {
                                'type': 'handle_game_end',  # Must match the method name in TournamentConsumer
                                **tournament_notification
                            }
                        )
                        print(f"[DEBUG] Successfully sent notification to tournament group: {tournament_group}")
                    except Exception as e:
                        print(f"[DEBUG] Error sending notification to tournament group: {str(e)}")
                else:
                    logger.info(f"Game {game_id} is not part of any tournament match")
        except Exception as e:
            logger.error(f"Error in game_end_message handler: {str(e)}", exc_info=True)

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

    async def handle_create_game(self):
        try:
            print("Creating game...")  
            # Create game in database
            game = await database_sync_to_async(Game.objects.create)(
                player1=self.user,
                status='waiting'
            )
            print(f"Game created with ID: {game.id}")  
            
            # Initialize game state in GameStateManager
            initial_state = GameStateManager.create_game(str(game.id), str(self.user.id), self.user.username)
            
            # Add user to game channel group
            game_group = f"game_{game.id}"
            await self.channel_layer.group_add(game_group, self.channel_name)
            
            # Send game_created through the channel layer to ensure consistent state
            await self.channel_layer.group_send(
                game_group,
                {
                    'type': 'game_created',
                    'game_id': str(game.id),
                    'player_id': str(self.user.id),
                    'game_state': initial_state
                }
            )
            print(f"Sent game_created message for game {game.id}")  
            
        except Exception as e:
            print(f"Error creating game: {str(e)}")  
            await self.send_json({
                'type': 'error',
                'message': str(e)
            })

    async def handle_join_game(self, game_id):
        try:
            @database_sync_to_async
            def get_game():
                game = Game.objects.get(id=game_id)
                return game
                
            game = await get_game()
            
            # Check game status and get player1 info
            @database_sync_to_async
            def check_game():
                if game.status != 'waiting' or game.player1 == self.user:
                    raise ValueError('Game not available')
                return {
                    'game': game,
                    'player1': {
                        'id': game.player1.id,
                        'username': game.player1.username
                    }
                }
                
            game_info = await check_game()
            game = game_info['game']
            player1 = game_info['player1']
            
            # Update game with database_sync_to_async
            @database_sync_to_async
            def update_game():
                game.player2 = self.user
                game.status = 'waiting'
                game.save()
                return game
            
            game = await update_game()

            # Initialize game state in GameStateManager
            print(f"[DEBUG] Player {self.user.id} ({self.user.username}) joining game {game.id}")
            print(f"[DEBUG] Player1 ID: {game.player1.id}, Player2 ID: {self.user.id}")
            
            # Make sure player IDs are different
            if str(game.player1.id) == str(self.user.id):
                await self.send_json({
                    'type': 'error',
                    'message': 'Cannot join your own game'
                })
                return
                
            new_state = GameStateManager.join_game(str(game.id), str(self.user.id), self.user.username)
            if not new_state:
                await self.send_json({
                    'type': 'error',
                    'message': 'Failed to join game'
                })
                return
            
            # Add user to game channel group
            game_group = f"game_{game.id}"
            await self.channel_layer.group_add(game_group, self.channel_name)
            
            # Notify all players with the new state
            await self.channel_layer.group_send(
                game_group,
                {
                    'type': 'game_state_update',
                    'game_state': new_state
                }
            )

            # Send game_joined event specifically to the joining player
            await self.send_json({
                'type': 'game_joined',
                'game_id': game.id,
                'player1': player1,
                'player2': {
                    'id': self.user.id,
                    'username': self.user.username
                }
            })
        except Game.DoesNotExist:
            await self.send_json({
                'type': 'error',
                'message': 'Game not found'
            })
        except Exception as e:
            await self.send_json({
                'type': 'error',
                'message': str(e)
            })

    async def handle_player_ready(self, game_id, player_role=None):
        """Handle player ready message"""
        try:
            print(f"[DEBUG] Handling player ready for game {game_id}, player role: {player_role}")
            if not game_id:
                await self.send_json({
                    'type': 'error',
                    'message': 'No game ID provided'
                })
                return
                
            # Get game from database
            game = await database_sync_to_async(Game.objects.get)(id=game_id)
            if not game:
                await self.send_json({
                    'type': 'error',
                    'message': 'Game not found'
                })
                return
                
            # Update game state
            game_group = f"game_{game_id}"
            print(f"[DEBUG] Setting player ready in game {game_id}")
            
            # Determine if this user is player1 or player2
            is_player1 = await database_sync_to_async(lambda: game.player1 == self.user)()
            is_player2 = await database_sync_to_async(lambda: game.player2 == self.user)()
            
            # Use the role from the message if provided, otherwise determine from the game
            if player_role:
                print(f"[DEBUG] Using provided player role: {player_role}")
            elif is_player1:
                player_role = 'player1'
                print(f"[DEBUG] Determined user is player1")
            elif is_player2:
                player_role = 'player2'
                print(f"[DEBUG] Determined user is player2")
            else:
                print(f"[DEBUG] Could not determine player role")
            
            # Set player ready in game state with role information
            new_state = GameStateManager.set_player_ready(str(game_id), str(self.user.id), player_role)
            if new_state:
                print(f"[DEBUG] New game state: {new_state}")
                
                # If game is now in playing state, update game status in database
                if new_state['status'] == 'playing':
                    print(f"[DEBUG] Game {game.id} is now playing, starting game loop")
                    game.status = 'playing'
                    await database_sync_to_async(game.save)()
                    
                    # Start the game loop
                    if not hasattr(self, 'game_loop_task') or not self.game_loop_task:
                        self.game_loop_task = asyncio.create_task(self.game_loop(game.id))
                        print(f"[DEBUG] Started game loop for game {game.id}")
                
                # Broadcast the updated state to all players in the game
                await self.channel_layer.group_send(
                    game_group,
                    {
                        'type': 'game_state_update',
                        'game_state': new_state
                    }
                )
            else:
                await self.send_json({
                    'type': 'error',
                    'message': 'Failed to set player ready'
                })
                
        except Exception as e:
            logger.error(f"Error handling player ready: {str(e)}", exc_info=True)
            await self.send_json({
                'type': 'error',
                'message': 'Error handling player ready'
            })

    async def receive(self, text_data=None, bytes_data=None):
        try:
            if not text_data:
                return
                
            data = json.loads(text_data)
            print('Received WebSocket message:', data)  
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
            
            # Handle different message types
            if message_type == 'create_game':
                await self.handle_create_game()
            elif message_type == 'join_game':
                game_id = data.get('game_id')
                await self.receive_json({'type': 'join_game', 'game_id': game_id})
            elif message_type == 'rejoin_game_group':
                game_id = data.get('game_id')
                await self.receive_json({'type': 'rejoin_game_group', 'game_id': game_id})
            elif message_type == 'player_ready':
                game_id = data.get('game_id')
                player_role = data.get('player_role')  # Get player role if provided
                await self.handle_player_ready(game_id, player_role)
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
