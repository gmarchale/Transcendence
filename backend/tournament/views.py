from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Tournament, TournamentMatch
from .serializers import TournamentSerializer, TournamentMatchSerializer
from django.utils import timezone
from game.models import Game
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import math
from game.state_manager import GameStateManager  # Assuming GameStateManager is in game.state_manager

class TournamentViewSet(viewsets.ModelViewSet):
    queryset = Tournament.objects.all()
    serializer_class = TournamentSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(creator=self.request.user)

    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        tournament = self.get_object()
        
        if tournament.status != 'pending':
            return Response(
                {'error': 'Tournament has already started or is completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if tournament.players.count() >= tournament.max_players:
            return Response(
                {'error': 'Tournament is full'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        tournament.players.add(request.user)
        return Response({'status': 'joined tournament'})

    def create_tournament_game(self, match):
        """Create a game for a tournament match and notify players"""
        # Create the game
        game = Game.objects.create(
            player1=match.player1,
            player2=match.player2,
            status='playing'  # Set to playing immediately since both players are known
        )
        
        # Link the game to the match
        match.game = game
        match.status = 'in_progress'
        match.started_at = timezone.now()
        match.save()

        # Initialize game state in memory
        GameStateManager.create_game(str(game.id), str(match.player1.id), match.player1.username)
        if match.player2:
            GameStateManager.join_game(str(game.id), str(match.player2.id), match.player2.username)

        # Notify players through WebSocket that their tournament match is ready
        channel_layer = get_channel_layer()
        tournament_group = f'tournament_{match.tournament.id}'
        game_group = f'game_{game.id}'
        
        # Send tournament match ready notification
        async_to_sync(channel_layer.group_send)(
            tournament_group,
            {
                'type': 'match_ready',
                'match_id': match.id,
                'game_id': game.id,
                'player1_id': match.player1.id,
                'player2_id': match.player2.id if match.player2 else None
            }
        )
        
        # Send game start notification through game WebSocket
        async_to_sync(channel_layer.group_send)(
            game_group,
            {
                'type': 'game_start',
                'game_id': game.id,
                'player1_id': match.player1.id,
                'player2_id': match.player2.id if match.player2 else None,
                'tournament_match_id': match.id
            }
        )
        
        return game

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        tournament = self.get_object()
        
        if tournament.status != 'pending':
            return Response(
                {'error': 'Tournament has already started or is completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        if tournament.players.count() < 2:
            return Response(
                {'error': 'Not enough players to start tournament'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create tournament bracket
        players = list(tournament.players.all())
        num_players = len(players)
        num_rounds = math.ceil(math.log2(num_players))
        
        # Create first round matches and their games
        matches_in_round = num_players // 2
        for i in range(matches_in_round):
            match = TournamentMatch.objects.create(
                tournament=tournament,
                player1=players[i*2],
                player2=players[i*2 + 1] if i*2 + 1 < num_players else None,
                round_number=1,
                match_number=i + 1
            )
            # Create a game for this match
            self.create_tournament_game(match)
            
        tournament.status = 'in_progress'
        tournament.started_at = timezone.now()
        tournament.save()
        
        return Response({'status': 'tournament started'})

    @action(detail=True, methods=['post'])
    def complete_match(self, request, pk=None):
        tournament = self.get_object()
        match_id = request.data.get('match_id')
        winner_id = request.data.get('winner_id')
        
        match = get_object_or_404(TournamentMatch, id=match_id, tournament=tournament)
        winner = get_object_or_404(User, id=winner_id)
        
        if match.status != 'in_progress':
            return Response(
                {'error': 'Match is not in progress'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        match.winner = winner
        match.status = 'completed'
        match.ended_at = timezone.now()
        match.save()

        # Update the game status
        if match.game:
            match.game.status = 'finished'
            match.game.winner = winner
            match.game.save()
        
        # If this was the final match, complete the tournament
        if match.round_number == math.ceil(math.log2(tournament.players.count())):
            tournament.status = 'completed'
            tournament.winner = winner
            tournament.ended_at = timezone.now()
            tournament.save()
            return Response({'status': 'tournament completed', 'winner': winner.username})
        
        # If not final match, create the next round match if both matches are complete
        next_match_number = (match.match_number + 1) // 2
        current_round_matches = TournamentMatch.objects.filter(
            tournament=tournament,
            round_number=match.round_number,
            match_number__in=[match.match_number - (1 if match.match_number % 2 == 0 else 0), 
                            match.match_number + (1 if match.match_number % 2 == 1 else 0)]
        )
        
        if all(m.status == 'completed' for m in current_round_matches):
            # Both matches are complete, create next round match
            winners = [m.winner for m in current_round_matches]
            next_match = TournamentMatch.objects.create(
                tournament=tournament,
                player1=winners[0],
                player2=winners[1] if len(winners) > 1 else None,
                round_number=match.round_number + 1,
                match_number=next_match_number
            )
            # Create a game for the next match
            self.create_tournament_game(next_match)
        
        return Response({'status': 'match completed'})
