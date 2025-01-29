import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from asgiref.sync import sync_to_async
from .models import Game
from django.contrib.auth import get_user_model
import asyncio
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        logger.info("WebSocket connection attempt...")
        if self.scope["user"].is_anonymous:
            logger.warning("Anonymous user - rejecting connection")
            await self.close()
        else:
            logger.info(f"Authenticated user {self.scope['user'].username} connected")
            await self.accept()
            await self.send(text_data=json.dumps({
                'type': 'connection_established',
                'message': 'Connected to game server'
            }))

    async def disconnect(self, close_code):
        logger.info(f"WebSocket disconnected with code: {close_code}")
        if hasattr(self, 'game_group_name'):
            await self.channel_layer.group_discard(
                self.game_group_name,
                self.channel_name
            )
            # Notify other player about disconnection
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    'type': 'game_message',
                    'message': 'Opponent disconnected'
                }
            )
        await self.leave_game()

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            logger.info(f"Received WebSocket message: {data}")
            
            if data['type'] == 'create_game':
                await self.create_game_handler()
            elif data['type'] == 'join_game':
                await self.join_game_handler()
            elif data['type'] == 'paddle_move':
                await self.handle_paddle_move(data['direction'])
            else:
                logger.warning(f"Unknown message type: {data['type']}")
                
        except json.JSONDecodeError:
            logger.error("Invalid JSON received")
        except KeyError as e:
            logger.error(f"Missing key in message: {e}")
        except Exception as e:
            logger.error(f"Error handling message: {e}")

    async def create_game_handler(self):
        game_id = await self.create_game()
        if game_id:
            self.game_group_name = f'game_{game_id}'
            await self.channel_layer.group_add(
                self.game_group_name,
                self.channel_name
            )
            await self.send(text_data=json.dumps({
                'type': 'game_created',
                'game_id': game_id,
                'player_id': str(self.scope["user"].id)
            }))
            logger.info(f"Game created with ID: {game_id}")
        else:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'Could not create game'
            }))

    async def join_game_handler(self):
        game_id = await self.join_game()
        if game_id:
            self.game_group_name = f'game_{game_id}'
            await self.channel_layer.group_add(
                self.game_group_name,
                self.channel_name
            )
            # Notify both players
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    'type': 'game_joined',
                    'game_id': game_id,
                    'player_id': str(self.scope["user"].id)
                }
            )
            # Start game after a short delay
            await asyncio.sleep(2)
            await self.start_game()
            logger.info(f"Game joined with ID: {game_id}")
        else:
            await self.send(text_data=json.dumps({
                'type': 'error',
                'message': 'No available games to join'
            }))

    async def game_joined(self, event):
        await self.send(text_data=json.dumps(event))

    async def game_message(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game_message',
            'message': event['message']
        }))

    async def start_game(self):
        if not hasattr(self, 'game_group_name'):
            return
        
        initial_state = {
            'ball': {'x': 400, 'y': 200, 'dx': 5, 'dy': 5, 'radius': 8},
            'paddles': {
                'left': {'x': 50, 'y': 150, 'width': 10, 'height': 100},
                'right': {'x': 740, 'y': 150, 'width': 10, 'height': 100}
            },
            'score': {'left': 0, 'right': 0}
        }
        
        await self.channel_layer.group_send(
            self.game_group_name,
            {
                'type': 'game_state',
                'state': initial_state
            }
        )

    @database_sync_to_async
    def create_game(self):
        try:
            # Clean up any existing games for this player
            Game.objects.filter(
                player1=self.scope["user"],
                status='waiting'
            ).delete()
            
            # Clean up old waiting games (older than 1 hour)
            from django.utils import timezone
            from datetime import timedelta
            Game.objects.filter(
                status='waiting',
                created_at__lt=timezone.now() - timedelta(hours=1)
            ).delete()
            
            game = Game.objects.create(
                player1=self.scope["user"],
                status='waiting'
            )
            self.game_id = str(game.id)
            return self.game_id
        except Exception as e:
            logger.error(f"Error creating game: {e}")
            return None

    @database_sync_to_async
    def join_game(self):
        try:
            # Clean up any existing games for this player
            Game.objects.filter(
                player1=self.scope["user"],
                status='waiting'
            ).delete()
            
            # Find an available game
            game = Game.objects.filter(
                status='waiting'
            ).exclude(
                player1=self.scope["user"]
            ).select_for_update().first()
            
            if game and not game.player2:
                game.player2 = self.scope["user"]
                game.status = 'playing'
                game.save()
                self.game_id = str(game.id)
                return self.game_id
            return None
        except Exception as e:
            logger.error(f"Error joining game: {e}")
            return None

    @database_sync_to_async
    def leave_game(self):
        if hasattr(self, 'game_id'):
            try:
                game = Game.objects.select_for_update().get(id=self.game_id)
                if game.status == 'waiting':
                    game.delete()
                else:
                    game.status = 'finished'
                    game.save()
                logger.info(f"Game {self.game_id} handled on leave")
            except Game.DoesNotExist:
                pass
            except Exception as e:
                logger.error(f"Error leaving game: {e}")

    async def handle_paddle_move(self, direction):
        if not hasattr(self, 'game_id'):
            return
        
        try:
            movement = 10 if direction == 'down' else -10
            await self.channel_layer.group_send(
                self.game_group_name,
                {
                    'type': 'paddle_update',
                    'player_id': str(self.scope["user"].id),
                    'direction': direction,
                    'movement': movement
                }
            )
        except Exception as e:
            logger.error(f"Error handling paddle move: {e}")

    async def paddle_update(self, event):
        await self.send(text_data=json.dumps(event))

    async def game_state(self, event):
        await self.send(text_data=json.dumps(event))
