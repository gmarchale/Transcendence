import time
import random
from dataclasses import dataclass
from typing import Dict, Optional

@dataclass
class PlayerState:
    id: str
    username: str
    score: int = 0
    paddle_y: float = 250
    is_ready: bool = False

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'score': self.score,
            'paddle_y': self.paddle_y,
            'is_ready': self.is_ready
        }

class GameStateManager:
    _instances = {}  # Dictionary to store game states by game_id

    @classmethod
    def _serialize_game_state(cls, game_state):
        """Convert game state to JSON serializable format"""
        serialized = game_state.copy()
        if 'players' in serialized:
            players = serialized['players']
            serialized['players'] = {
                'player1': players['player1'].to_dict() if players['player1'] else None,
                'player2': players['player2'].to_dict() if players['player2'] else None
            }
        return serialized

    @classmethod
    def create_game(cls, game_id: str, player1_id: str, player1_username: str):
        """Initialize a new game state"""
        cls._instances[game_id] = {
            'ball': {'x': 400, 'y': 300, 'dx': 40, 'dy': 40, 'radius': 10},
            'paddles': {
                'player1': {'x': 50, 'y': 250, 'width': 20, 'height': 100},
                'player2': {'x': 730, 'y': 250, 'width': 20, 'height': 100}
            },
            'canvas': {'width': 800, 'height': 600},
            'score': {'player1': 0, 'player2': 0},
            'paddle_speed': 25,
            'status': 'waiting',
            'players': {
                'player1': PlayerState(id=player1_id, username=player1_username, is_ready=False),
                'player2': None
            },
            'start_time': None,
            'last_update': time.time()
        }
        return cls._serialize_game_state(cls._instances[game_id])

    @classmethod
    def join_game(cls, game_id: str, player2_id: str, player2_username: str) -> Optional[Dict]:
        """Add second player to the game"""
        if game_id in cls._instances:
            game_state = cls._instances[game_id]
            if game_state['status'] == 'waiting':
                game_state['players']['player2'] = PlayerState(
                    id=player2_id, 
                    username=player2_username,
                    is_ready=False
                )
                # Return the serialized game state
                return cls._serialize_game_state(game_state)
        return None

    @classmethod
    def set_player_ready(cls, game_id: str, player_id: str) -> Optional[Dict]:
        """Set a player's ready status"""
        print(f"[DEBUG] Setting ready status for player {player_id} in game {game_id}")
        if game_id not in cls._instances:
            print(f"[DEBUG] Game {game_id} not found in instances")
            return None

        game_state = cls._instances[game_id]
        player1 = game_state['players']['player1']
        player2 = game_state['players']['player2']

        print(f"[DEBUG] Current game state before update:")
        print(f"[DEBUG] - Player 1: {player1.username} (ID: {player1.id}) Ready: {player1.is_ready}")
        print(f"[DEBUG] - Player 2: {player2.username} (ID: {player2.id}) Ready: {player2.is_ready}" if player2 else "[DEBUG] - Player 2: Not joined yet")

        # Update ready status for the correct player
        if player1 and player1.id == player_id:
            print(f"[DEBUG] Setting Player 1 {player1.username} ready state to True")
            player1.is_ready = True
        elif player2 and player2.id == player_id:
            print(f"[DEBUG] Setting Player 2 {player2.username} ready state to True")
            player2.is_ready = True

        # Check if both players are ready
        if (player1 and player2 and 
            player1.is_ready and player2.is_ready and 
            game_state['status'] == 'waiting'):
            print(f"[DEBUG] Both players ready in game {game_id}, starting game")
            game_state['status'] = 'playing'
            game_state['start_time'] = time.time()
            
            # Initialize ball with random direction
            game_state['ball'].update({
                'x': game_state['canvas']['width'] / 2,
                'y': game_state['canvas']['height'] / 2,
                'dx': 40 * (1 if random.random() > 0.5 else -1),
                'dy': 40 * (1 if random.random() > 0.5 else -1)
            })

        print(f"[DEBUG] Game state after update:")
        print(f"[DEBUG] - Player 1: {player1.username} (ID: {player1.id}) Ready: {player1.is_ready}")
        print(f"[DEBUG] - Player 2: {player2.username} (ID: {player2.id}) Ready: {player2.is_ready}" if player2 else "[DEBUG] - Player 2: Not joined yet")

        return cls._serialize_game_state(game_state)

    @classmethod
    def move_paddle(cls, game_id: str, player_id: str, direction: str) -> Optional[Dict]:
        """Handle paddle movement"""
        if game_id not in cls._instances:
            return None

        game_state = cls._instances[game_id]
        if game_state['status'] != 'playing':
            return None

        # Determine which paddle to move
        player_key = None
        if player_id == game_state['players']['player1'].id:
            player_key = 'player1'
        elif game_state['players']['player2'] and player_id == game_state['players']['player2'].id:
            player_key = 'player2'

        if not player_key:
            return None

        # Update paddle position
        paddle = game_state['paddles'][player_key]
        move_amount = game_state['paddle_speed']
        
        if direction == 'up':
            paddle['y'] = max(0, paddle['y'] - move_amount)
        elif direction == 'down':
            paddle['y'] = min(
                game_state['canvas']['height'] - paddle['height'],
                paddle['y'] + move_amount
            )

        return cls._serialize_game_state(game_state)

    @classmethod
    def update_ball_position(cls, game_id: str) -> Optional[Dict]:
        """Update ball position and handle collisions"""
        if game_id not in cls._instances:
            return None

        game_state = cls._instances[game_id]
        if game_state['status'] != 'playing':
            return None

        ball = game_state['ball']
        current_time = time.time()
        
        # Only log ball position every 5 seconds
        if not hasattr(cls, '_last_ball_log') or current_time - cls._last_ball_log >= 5:
            # Debug message disabled
            # print(f"[DEBUG] Ball position - x: {ball['x']:.1f}, y: {ball['y']:.1f}, dx: {ball['dx']}, dy: {ball['dy']}")
            cls._last_ball_log = current_time

        # Update ball position
        ball['x'] += ball['dx']
        ball['y'] += ball['dy']

        # Wall collisions (top/bottom)
        if ball['y'] - ball['radius'] <= 0 or ball['y'] + ball['radius'] >= game_state['canvas']['height']:
            ball['dy'] *= -1

        # Paddle collisions
        for player_key in ['player1', 'player2']:
            paddle = game_state['paddles'][player_key]
            if (ball['x'] - ball['radius'] <= paddle['x'] + paddle['width'] and
                ball['x'] + ball['radius'] >= paddle['x'] and
                ball['y'] >= paddle['y'] and
                ball['y'] <= paddle['y'] + paddle['height']):
                ball['dx'] *= -1.1  # Reduced speed increase on paddle hits from 1.1 to 1.05
                break

        # Score points
        if ball['x'] - ball['radius'] <= 0:
            # Player 2 scores
            game_state['score']['player2'] += 1
            cls._reset_ball(game_state)
        elif ball['x'] + ball['radius'] >= game_state['canvas']['width']:
            # Player 1 scores
            game_state['score']['player1'] += 1
            cls._reset_ball(game_state)

        # Check for game end
        if game_state['score']['player1'] >= 5 or game_state['score']['player2'] >= 5:
            game_state['status'] = 'finished'
            game_state['winner'] = 'player1' if game_state['score']['player1'] > game_state['score']['player2'] else 'player2'
            
            # Calculate duration
            if 'start_time' in game_state:
                duration = int(time.time() - game_state['start_time'])
                minutes = duration // 60
                seconds = duration % 60
                game_state['duration'] = duration
                game_state['duration_formatted'] = f"{minutes:02d}:{seconds:02d}"
            else:
                game_state['duration'] = 0
                game_state['duration_formatted'] = "00:00"
            
            # Save the game state to the database at the end of the game
            cls.save_game_state_to_db(game_id, game_state)
            
            # Mark game for sending end notification
            game_state['_send_end_notification'] = True
            
            # Store end game data for notification
            winner_key = game_state['winner']
            winner_id = None
            
            if 'players' in game_state and winner_key in game_state['players']:
                if hasattr(game_state['players'][winner_key], 'id'):
                    winner_id = game_state['players'][winner_key].id
                elif isinstance(game_state['players'][winner_key], dict) and 'id' in game_state['players'][winner_key]:
                    winner_id = game_state['players'][winner_key]['id']
            
            # Store notification data
            game_state['_end_notification_data'] = {
                'type': 'game_end_message',
                'winner': winner_key,
                'winner_id': winner_id,
                'duration': game_state.get('duration', 0),
                'duration_formatted': game_state.get('duration_formatted', '00:00'),
                'final_score': {
                    'player1': game_state['score']['player1'],
                    'player2': game_state['score']['player2']
                }
            }
            
        return cls._serialize_game_state(game_state)

    @classmethod
    def end_game(cls, game_id: str, reason: str = 'finished') -> Optional[Dict]:
        """End the game and determine winner"""
        if game_id in cls._instances:
            game_state = cls._instances[game_id]
            game_state['status'] = 'finished'
            game_state['end_reason'] = reason
            
            # Calculate duration
            if game_state['start_time']:
                duration = int(time.time() - game_state['start_time'])
                minutes = duration // 60
                seconds = duration % 60
                game_state['duration'] = duration
                game_state['duration_formatted'] = f"{minutes:02d}:{seconds:02d}"
            else:
                game_state['duration'] = 0
                game_state['duration_formatted'] = "00:00"
            
            # Determine winner if not already set
            if 'winner' not in game_state:
                if game_state['score']['player1'] > game_state['score']['player2']:
                    game_state['winner'] = 'player1'
                    game_state['winner_id'] = game_state['players']['player1'].id
                    game_state['score_player1'] = game_state['score']['player1']
                    game_state['score_player2'] = game_state['score']['player2']
                elif game_state['score']['player2'] > game_state['score']['player1']:
                    game_state['winner'] = 'player2'
                    game_state['winner_id'] = game_state['players']['player2'].id
                    game_state['score_player1'] = game_state['score']['player1']
                    game_state['score_player2'] = game_state['score']['player2']
                else:
                    game_state['winner'] = None
                    game_state['winner_id'] = None
                    game_state['score_player1'] = game_state['score']['player1']
                    game_state['score_player2'] = game_state['score']['player2']
            
            # Save the complete game state to the database
            cls.save_game_state_to_db(game_id, game_state)
                    
            return cls._serialize_game_state(game_state)
        return None

    @classmethod
    def _reset_ball(cls, game_state: Dict):
        """Reset ball to center after point scored"""
        game_state['ball'].update({
            'x': game_state['canvas']['width'] / 2,
            'y': game_state['canvas']['height'] / 2,
            'dx': 40 * (1 if random.random() > 0.5 else -1),
            'dy': 40 * (1 if random.random() > 0.5 else -1)
        })

    @classmethod
    def get_game_state(cls, game_id: str) -> Optional[Dict]:
        """Get the current game state"""
        state = cls._instances.get(game_id)
        if state:
            return cls._serialize_game_state(state)
        return None

    @classmethod
    def game_exists(cls, game_id: str) -> bool:
        """Check if a game exists in memory"""
        return game_id in cls._instances

    @classmethod
    def save_game_state_to_db(cls, game_id: str, game_state: Dict):
        """Save the complete game state to the database"""
        # Print debug message showing the game_state data
        # Debug message disabled
        # print(f"[DEBUG] Game state data received: {game_state}")
        
        # Use sync_to_async to handle database operations from async context
        import asyncio
        from asgiref.sync import sync_to_async
        
        # Check if we're in an async context
        try:
            asyncio.get_running_loop()
            is_async = True
        except RuntimeError:
            is_async = False
            
        if is_async:
            # We're in an async context, use the async version
            asyncio.create_task(cls._save_game_state_to_db_async(game_id, game_state))
        else:
            # We're in a sync context, use the sync version directly
            cls._save_game_state_to_db_sync(game_id, game_state)
    
    @classmethod
    async def _save_game_state_to_db_async(cls, game_id: str, game_state: Dict):
        """Async version of save_game_state_to_db"""
        from asgiref.sync import sync_to_async
        try:
            await sync_to_async(cls._save_game_state_to_db_sync)(game_id, game_state)
        except Exception as e:
            print(f"[ERROR] Failed to save game state to database (async): {str(e)}")
    
    @classmethod
    def _save_game_state_to_db_sync(cls, game_id: str, game_state: Dict):
        """Synchronous implementation of saving game state to database"""
        try:
            from django.apps import apps
            Game = apps.get_model('game', 'Game')
            from django.contrib.auth import get_user_model
            User = get_user_model()
            
            # Get the game from the database
            game = Game.objects.get(id=game_id)
            
            # Update the game state field with the complete state
            game.game_state = cls._serialize_game_state(game_state)
            
            # Update other relevant fields
            if 'score_player1' in game_state:
                game.score_player1 = game_state['score_player1']
                print(f"[DEBUG] Setting score_player1 from direct field: {game.score_player1}")
            elif 'score' in game_state and 'player1' in game_state['score']:
                game.score_player1 = game_state['score']['player1']
                print(f"[DEBUG] Setting score_player1 from score.player1: {game.score_player1}")
                
            if 'score_player2' in game_state:
                game.score_player2 = game_state['score_player2']
                print(f"[DEBUG] Setting score_player2 from direct field: {game.score_player2}")
            elif 'score' in game_state and 'player2' in game_state['score']:
                game.score_player2 = game_state['score']['player2']
                print(f"[DEBUG] Setting score_player2 from score.player2: {game.score_player2}")
                
            # Calculate and set duration if the game is finished
            if 'status' in game_state and game_state['status'] == 'finished' and 'start_time' in game_state:
                import time
                from datetime import timedelta
                
                # Calculate duration in seconds
                end_time = time.time()
                start_time = game_state['start_time']
                duration_seconds = end_time - start_time
                
                # Set duration in seconds
                game.duration = duration_seconds
                print(f"[DEBUG] Setting game duration: {duration_seconds} seconds")
                
                # Format duration as mm:ss
                duration_td = timedelta(seconds=duration_seconds)
                minutes, seconds = divmod(duration_td.seconds, 60)
                duration_formatted = f"{minutes:02d}:{seconds:02d}"
                
                # Set formatted duration
                game.duration_formatted = duration_formatted
                print(f"[DEBUG] Setting formatted duration: {duration_formatted}")
            elif 'duration' in game_state:
                game.duration = game_state['duration']
                print(f"[DEBUG] Setting duration from game_state: {game_state['duration']}")
                
            if 'duration_formatted' in game_state and not (game.duration_formatted):
                game.duration_formatted = game_state['duration_formatted']
                print(f"[DEBUG] Setting duration_formatted from game_state: {game_state['duration_formatted']}")
            
            # Set status to finished
            if 'status' in game_state and game_state['status'] == 'finished':
                game.status = 'finished'
                print(f"[DEBUG] Setting game status to finished")
            
            # Set winner if available
            if 'winner' in game_state:
                print(f"[DEBUG] Winner found in game_state: {game_state['winner']}")
                winner_id = None
                
                if game_state['winner'] == 'player1' and 'players' in game_state and 'player1' in game_state['players']:
                    if hasattr(game_state['players']['player1'], 'id'):
                        winner_id = game_state['players']['player1'].id
                    elif isinstance(game_state['players']['player1'], dict) and 'id' in game_state['players']['player1']:
                        winner_id = game_state['players']['player1']['id']
                        
                elif game_state['winner'] == 'player2' and 'players' in game_state and 'player2' in game_state['players']:
                    if hasattr(game_state['players']['player2'], 'id'):
                        winner_id = game_state['players']['player2'].id
                    elif isinstance(game_state['players']['player2'], dict) and 'id' in game_state['players']['player2']:
                        winner_id = game_state['players']['player2']['id']
                
                if winner_id:
                    try:
                        print(f"[DEBUG] Setting winner with ID: {winner_id}")
                        game.winner = User.objects.get(id=winner_id)
                    except Exception as e:
                        print(f"[ERROR] Failed to set winner: {str(e)}")
                        
            # Save the game
            game.save()
            print(f"[DEBUG] Game state saved to database for game {game_id} with scores: player1={game.score_player1}, player2={game.score_player2}, status={game.status}, winner={game.winner_id if hasattr(game, 'winner_id') else None}")
            
            # Si le jeu est terminé, nettoyer les parties inactives
            if game.status == 'finished':
                try:
                    print("[DEBUG] DÉBUT DU NETTOYAGE DES PARTIES INACTIVES")
                    from .utils import cleanup_inactive_games
                    result = cleanup_inactive_games()
                    print(f"[DEBUG] FIN DU NETTOYAGE DES PARTIES INACTIVES: {result}")
                except Exception as e:
                    print(f"[ERROR] Erreur lors du nettoyage des parties inactives: {str(e)}")
            
        except Exception as e:
            print(f"[ERROR] Failed to save game state to database (sync): {str(e)}")
    
    @classmethod
    def remove_game(cls, game_id: str):
        """Remove a game from memory"""
        if game_id in cls._instances:
            # Save the final state to the database before removing
            cls.save_game_state_to_db(game_id, cls._instances[game_id])
            del cls._instances[game_id]
