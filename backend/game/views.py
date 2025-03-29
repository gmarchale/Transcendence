from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from django.contrib.auth import get_user_model
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from .models import Game
from .serializers import GameSerializer, GameDetailSerializer
from django.utils import timezone
from django.db.models import Q

# Create your views here.

User = get_user_model()

class GameViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Game.objects.all()
    serializer_class = GameSerializer

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return GameDetailSerializer
        return GameSerializer

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_game(request):
    game = Game.objects.create(player1=request.user)
    
    # Initialize game state in GameStateManager
    from .game_state_manager import GameStateManager
    initial_state = GameStateManager.create_game(str(game.id), str(request.user.id), request.user.username)
    
    # Get the channel layer and send game_created message
    from channels.layers import get_channel_layer
    from asgiref.sync import async_to_sync
    
    channel_layer = get_channel_layer()
    user_group = f"user_{request.user.id}"
    
    async_to_sync(channel_layer.group_send)(
        user_group,
        {
            "type": "game_created",
            "game_id": str(game.id),  
            "player1_id": request.user.id,  
            "game_state": initial_state
        }
    )
    
    return Response(GameSerializer(game).data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_game(request, game_id):
    try:
        game = Game.objects.get(id=game_id, status='waiting')
        if game.player1 != request.user and not game.player2:
            game.player2 = request.user
            game.status = 'in_progress'
            game.save()
            return Response(GameSerializer(game).data)
        return Response({'error': 'Cannot join this game'}, status=status.HTTP_400_BAD_REQUEST)
    except Game.DoesNotExist:
        return Response({'error': 'Game not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_games(request):
    games = Game.objects.filter(
        Q(player1=request.user) | Q(player2=request.user)
    ).order_by('-created_at')
    return Response(GameSerializer(games, many=True).data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def game_status(request):
    """Get the status of active games for the current user"""
    active_game = Game.objects.filter(
        status='playing',
        player1=request.user
    ).first() or Game.objects.filter(
        status='playing',
        player2=request.user
    ).first()

    if active_game:
        return Response({
            'status': 'playing',
            'game_id': str(active_game.id),
            'player1': active_game.player1.username,
            'player2': active_game.player2.username if active_game.player2 else None,
            'score1': active_game.player1_score,
            'score2': active_game.player2_score,
        })

    waiting_game = Game.objects.filter(status='waiting').first()
    if waiting_game:
        return Response({
            'status': 'waiting',
            'game_id': str(waiting_game.id)
        })

    return Response({'status': 'no_game'})

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_games(request):
    id_user = request.query_params.get('id_user')
    if not id_user:
        return Response({'error': 'id_user is required'}, status=status.HTTP_400_BAD_REQUEST)

    games = Game.objects.filter(
        Q(player1_id=id_user) | Q(player2_id=id_user)
    ).order_by('created_at')

    formatted_games = [
        {
            "id": game.id,
            "score_player1": game.score_player1,
            "score_player2": game.score_player2,
            "player1": {
                "id": game.player1.id,
                "username": game.player1.username,
            },
            "player2": {
                "id": game.player2.id if game.player2 else None,
                "username": game.player2.username if game.player2 else None,
            },
            "winner": {
                "id": game.winner.id if game.winner else None,
                "username": game.winner.username if game.winner else None,
            },
            "timestamp": game.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "duration_formatted": game.duration_formatted,
        }
        for game in games
    ]
    return Response({"games": formatted_games}, status=status.HTTP_200_OK)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_stats(request):
    id_user = request.query_params.get('id_user')
    if not id_user:
        return Response({'error': 'id_user is required'}, status=status.HTTP_400_BAD_REQUEST)

    games_played = Game.objects.filter(
        Q(player1_id=id_user) | Q(player2_id=id_user)
    ).count()

    games_won = Game.objects.filter(winner_id=id_user).count()

    defeats = Game.objects.filter(
        Q(player1_id=id_user) | Q(player2_id=id_user),
        winner__isnull=False
    ).exclude(winner_id=id_user).count()

    stats = {
        "games_played": games_played,
        "games_won": games_won,
        "defeats": defeats,
    }

    return Response({"stats": stats}, status=status.HTTP_200_OK)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_status(request, game_id):
    """Get the current status of a specific game"""
    try:
        game = Game.objects.get(id=game_id)
        
        # Format the game data
        game_data = {
            "id": game.id,
            "status": game.status,
            "score": {
                "player1": game.score_player1,
                "player2": game.score_player2
            },
            "player1": {
                "id": game.player1.id,
                "username": game.player1.username,
            },
            "player2": {
                "id": game.player2.id if game.player2 else None,
                "username": game.player2.username if game.player2 else None,
            },
            "winner": {
                "id": game.winner.id if game.winner else None,
                "username": game.winner.username if game.winner else None,
            },
            "created_at": game.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": game.updated_at.strftime("%Y-%m-%d %H:%M:%S") if game.updated_at else None,
            "duration": game.duration,
            "duration_formatted": game.duration_formatted,
        }
        
        return Response({"game": game_data}, status=status.HTTP_200_OK)
    except Game.DoesNotExist:
        return Response({"error": "Game not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def end_game(request, game_id):
    """End a game by setting its status to finished"""
    try:
        game = Game.objects.get(id=game_id)
        
        # Check if the user is a player in this game
        user = request.user
        if game.player1 != user and (game.player2 is None or game.player2 != user):
            return Response({"error": "You are not a player in this game"}, status=status.HTTP_403_FORBIDDEN)
        
        # Only allow ending games that are not already finished
        if game.status == 'finished':
            return Response({"message": "Game is already finished"}, status=status.HTTP_200_OK)
        
        # Set game status to finished
        game.status = 'finished'
        
        # Determine winner based on scores if not already set
        if not game.winner and game.player1 and game.player2:
            if game.score_player1 > game.score_player2:
                game.winner = game.player1
            elif game.score_player2 > game.score_player1:
                game.winner = game.player2
        
        # Calculate duration if not already set
        if not game.duration:
            from django.utils import timezone
            duration_seconds = (timezone.now() - game.created_at).total_seconds()
            game.duration = duration_seconds
            
            # Format duration as mm:ss
            from datetime import timedelta
            duration_td = timedelta(seconds=duration_seconds)
            minutes, seconds = divmod(duration_td.seconds, 60)
            game.duration_formatted = f"{minutes:02d}:{seconds:02d}"
        
        game.save()
        
        # Format the game data for response
        game_data = {
            "id": game.id,
            "status": game.status,
            "score": {
                "player1": game.score_player1,
                "player2": game.score_player2
            },
            "winner": {
                "id": game.winner.id if game.winner else None,
                "username": game.winner.username if game.winner else None,
            },
            "duration": game.duration,
            "duration_formatted": game.duration_formatted,
        }
        
        return Response({"message": "Game ended successfully", "game": game_data}, status=status.HTTP_200_OK)
    except Game.DoesNotExist:
        return Response({"error": "Game not found"}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
