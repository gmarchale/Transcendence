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

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'score': self.score,
            'paddle_y': self.paddle_y
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
            'ball': {'x': 400, 'y': 300, 'dx': 5, 'dy': 5, 'radius': 10},
            'paddles': {
                'player1': {'x': 50, 'y': 250, 'width': 20, 'height': 100},
                'player2': {'x': 730, 'y': 250, 'width': 20, 'height': 100}
            },
            'canvas': {'width': 800, 'height': 600},
            'score': {'player1': 0, 'player2': 0},
            'paddle_speed': 25,
            'status': 'waiting',
            'players': {
                'player1': PlayerState(id=player1_id, username=player1_username),
                'player2': None
            },
            'start_time': None,
            'last_update': time.time()
        }
        return cls._serialize_game_state(cls._instances[game_id])

    @classmethod
    def join_game(cls, game_id: str, player2_id: str, player2_username: str) -> bool:
        """Add second player to the game"""
        if game_id in cls._instances:
            game_state = cls._instances[game_id]
            if game_state['status'] == 'waiting':
                game_state['players']['player2'] = PlayerState(
                    id=player2_id, 
                    username=player2_username
                )
                game_state['status'] = 'playing'
                game_state['start_time'] = time.time()  # Set start time when game begins
                return True
        return False

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
        
        # Update position
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
                ball['dx'] *= -1.1  # Increase speed slightly on paddle hits
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
                    
            return cls._serialize_game_state(game_state)
        return None

    @classmethod
    def _reset_ball(cls, game_state: Dict):
        """Reset ball to center after point scored"""
        game_state['ball'].update({
            'x': game_state['canvas']['width'] / 2,
            'y': game_state['canvas']['height'] / 2,
            'dx': 5 * (1 if random.random() > 0.5 else -1),
            'dy': 5 * (1 if random.random() > 0.5 else -1)
        })

    @classmethod
    def get_game_state(cls, game_id: str) -> Optional[Dict]:
        """Get the current game state"""
        state = cls._instances.get(game_id)
        if state:
            return cls._serialize_game_state(state)
        return None

    @classmethod
    def remove_game(cls, game_id: str):
        """Remove a game from memory"""
        if game_id in cls._instances:
            del cls._instances[game_id]
