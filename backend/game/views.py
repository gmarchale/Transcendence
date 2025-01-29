from django.shortcuts import render
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Game, Tournament
from .serializers import GameSerializer, GameDetailSerializer, TournamentSerializer
from django.utils import timezone
from django.db.models import Q

# Create your views here.

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

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_tournament(request):
    name = request.data.get('name')
    if not name:
        return Response({'error': 'Tournament name is required'}, status=status.HTTP_400_BAD_REQUEST)
    
    tournament = Tournament.objects.create(name=name)
    tournament.players.add(request.user)
    return Response(TournamentSerializer(tournament).data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_tournament(request, tournament_id):
    try:
        tournament = Tournament.objects.get(id=tournament_id, is_active=True)
        if request.user not in tournament.players.all():
            tournament.players.add(request.user)
            return Response(TournamentSerializer(tournament).data)
        return Response({'error': 'Already in tournament'}, status=status.HTTP_400_BAD_REQUEST)
    except Tournament.DoesNotExist:
        return Response({'error': 'Tournament not found'}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def active_games(request):
    games = Game.objects.filter(status='in_progress')
    return Response(GameSerializer(games, many=True).data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_games(request):
    games = Game.objects.filter(
        Q(player1=request.user) | Q(player2=request.user)
    ).order_by('-created_at')
    return Response(GameSerializer(games, many=True).data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def active_tournaments(request):
    tournaments = Tournament.objects.filter(is_active=True)
    return Response(TournamentSerializer(tournaments, many=True).data)

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
            'status': 'active',
            'game_id': str(active_game.id),
            'player1': active_game.player1.username,
            'player2': active_game.player2.username if active_game.player2 else None,
            'score1': active_game.player1_score,
            'score2': active_game.player2_score
        })
    
    waiting_game = Game.objects.filter(status='waiting').first()
    if waiting_game:
        return Response({
            'status': 'waiting',
            'game_id': str(waiting_game.id)
        })
    
    return Response({'status': 'no_game'})
