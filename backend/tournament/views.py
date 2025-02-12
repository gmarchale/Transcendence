from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Tournament, TournamentMatch
from .serializers import TournamentSerializer, TournamentMatchSerializer
from django.utils import timezone
import math

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
        
        # Create first round matches
        matches_in_round = num_players // 2
        for i in range(matches_in_round):
            TournamentMatch.objects.create(
                tournament=tournament,
                player1=players[i*2],
                player2=players[i*2 + 1] if i*2 + 1 < num_players else None,
                round_number=1,
                match_number=i + 1
            )
            
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
        
        # If this was the final match, complete the tournament
        if match.round_number == math.ceil(math.log2(tournament.players.count())):
            tournament.status = 'completed'
            tournament.winner = winner
            tournament.ended_at = timezone.now()
            tournament.save()
        else:
            # Create or update next round match
            next_round = match.round_number + 1
            next_match_number = (match.match_number + 1) // 2
            
            next_match, created = TournamentMatch.objects.get_or_create(
                tournament=tournament,
                round_number=next_round,
                match_number=next_match_number,
                defaults={
                    'player1': winner,
                    'status': 'pending'
                }
            )
            
            if not created:
                if not next_match.player1:
                    next_match.player1 = winner
                else:
                    next_match.player2 = winner
                next_match.save()
                
            match.next_match = next_match
            match.save()
        
        return Response({'status': 'match completed'})
