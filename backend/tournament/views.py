from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Tournament, TournamentMatch, TournamentPlayer
from .serializers import TournamentSerializer, TournamentMatchSerializer
from django.utils import timezone
from game.models import Game
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import math
from game.game_state_manager import GameStateManager  # Import from the correct module
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()

class TournamentViewSet(viewsets.ModelViewSet):
    queryset = Tournament.objects.all()
    serializer_class = TournamentSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        tournament = serializer.save(creator=self.request.user)
        display_name = self.request.data.get('display_name', self.request.user.username)
        
        # Créer l'entrée TournamentPlayer pour le créateur
        TournamentPlayer.objects.create(
            tournament=tournament,
            player=self.request.user,
            display_name=display_name
        )

    @action(detail=True, methods=['post'])
    def join(self, request, pk=None):
        tournament = self.get_object()
        display_name = request.data.get('display_name', request.user.username)

        # Vérifier si le tournoi peut accepter plus de joueurs
        if tournament.players.count() >= tournament.max_players:
            return Response(
                {'error': 'Tournament is full'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Vérifier si le joueur est déjà dans le tournoi
        if tournament.players.filter(id=request.user.id).exists():
            return Response(
                {'error': 'You are already in this tournament'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Vérifier si le display_name est unique dans ce tournoi
        if tournament.tournament_players.filter(display_name=display_name).exists():
            return Response(
                {'error': 'This display name is already taken in this tournament'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Ajouter le joueur avec son display_name
        TournamentPlayer.objects.create(
            tournament=tournament,
            player=request.user,
            display_name=display_name
        )

        # Notifier via WebSocket
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'tournament_{tournament.id}',
            {
                'type': 'player_joined',
                'player': {
                    'id': request.user.id,
                    'username': request.user.username,
                    'display_name': display_name
                }
            }
        )

        serializer = self.get_serializer(tournament)
        return Response(serializer.data)

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

    @action(detail=True, methods=['post'])
    def player_ready(self, request, pk=None):
        tournament = self.get_object()
        match_id = request.data.get('match_id')
        
        match = get_object_or_404(TournamentMatch, id=match_id, tournament=tournament)
        
        # Vérifier que le joueur fait partie du match
        if request.user != match.player1 and request.user != match.player2:
            return Response(
                {'error': 'You are not a player in this match'},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Mettre à jour le statut ready du joueur
        if request.user == match.player1:
            match.player1_ready = True
        else:
            match.player2_ready = True
        match.save()
        
        # Si les deux joueurs sont prêts, démarrer le match
        if match.player1_ready and match.player2_ready:
            self.create_tournament_game(match)
            
        # Notifier via WebSocket
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'tournament_{tournament.id}',
            {
                'type': 'match_update',
                'match_id': match.id,
                'player1_ready': match.player1_ready,
                'player2_ready': match.player2_ready,
                'status': match.status
            }
        )
        
        return Response({'status': 'ready status updated'})

    @action(detail=True, methods=['post'])
    def forfeit(self, request, pk=None):
        """
        Gère le forfait d'un joueur, avec un cas spécial pour le créateur du tournoi.
        Si le créateur quitte :
        - S'il est seul, le tournoi est simplement annulé
        - S'il y a d'autres joueurs, un nouveau créateur est désigné
        """
        tournament = self.get_object()
        
        # Vérifier si le joueur est le créateur
        is_creator = request.user == tournament.creator
        
        # Si le joueur est le créateur, gérer ce cas spécial
        if is_creator:
            other_players = tournament.players.exclude(id=request.user.id)
            player_count = other_players.count()
            
            if player_count == 0:
                # Le créateur est seul, annuler le tournoi
                tournament.status = 'cancelled'
                tournament.ended_at = timezone.now()
                tournament.save()
                
                # Notifier via WebSocket
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'tournament_{tournament.id}',
                    {
                        'type': 'tournament_update',
                        'status': 'cancelled',
                        'message': f"Tournament cancelled: creator left"
                    }
                )
                return Response({'status': 'tournament cancelled'})
            else:
                # Désigner un nouveau créateur (le premier joueur restant)
                new_creator = other_players.first()
                tournament.creator = new_creator
                tournament.save()
                
                # Notifier du changement de créateur
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'tournament_{tournament.id}',
                    {
                        'type': 'tournament_update',
                        'status': tournament.status,
                        'new_creator_id': new_creator.id,
                        'message': f"New tournament creator: {new_creator.username}"
                    }
                )
        
        # Gérer le forfait du match en cours
        match = tournament.matches.filter(
            (Q(player1=request.user) | Q(player2=request.user)) &
            Q(status='in_progress')
        ).first()
        
        if match:
            # Vérifier que le joueur fait partie du match
            if request.user != match.player1 and request.user != match.player2:
                return Response(
                    {'error': 'You are not a player in this match'},
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            # Déclarer l'autre joueur comme vainqueur
            winner = match.player2 if request.user == match.player1 else match.player1
            
            # Mettre à jour le match
            match.winner = winner
            match.status = 'completed'
            match.ended_at = timezone.now()
            match.save()
            
            # Mettre à jour le jeu si existant
            if match.game:
                match.game.status = 'finished'
                match.game.winner = winner
                match.game.save()
                
            # Notifier via WebSocket
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'tournament_{tournament.id}',
                {
                    'type': 'match_update',
                    'match_id': match.id,
                    'status': 'completed',
                    'winner_id': winner.id,
                    'forfeit': True,
                    'forfeited_by': request.user.id
                }
            )
            
            # Si c'était le dernier match, terminer le tournoi
            if match.round_number == math.ceil(math.log2(tournament.players.count())):
                tournament.status = 'completed'
                tournament.winner = winner
                tournament.ended_at = timezone.now()
                tournament.save()
                return Response({
                    'status': 'tournament completed', 
                    'winner': winner.username,
                    'creator_changed': is_creator and tournament.status != 'cancelled'
                })
                
            return Response({
                'status': 'match forfeited',
                'creator_changed': is_creator and tournament.status != 'cancelled'
            })
            
        # Si le joueur n'a pas de match en cours
        if is_creator:
            return Response({
                'status': 'creator changed' if tournament.status != 'cancelled' else 'tournament cancelled'
            })
            
        return Response({'status': 'no active match'})

    @action(detail=False, methods=['get'], url_path='player-tournaments/(?P<player_id>[^/.]+)')
    def get_player_tournaments(self, request, player_id=None):
        """
        Récupère tous les tournois en cours dans lesquels le joueur est inscrit.
        Inclut les détails des matchs en cours et à venir.
        """
        try:
            player = User.objects.get(id=player_id)
        except User.DoesNotExist:
            return Response({'error': 'Player not found'}, status=404)

        # Récupérer tous les tournois où le joueur est inscrit
        tournaments = Tournament.objects.filter(
            players=player,
            status__in=['pending', 'in_progress']  # On ne récupère que les tournois en attente ou en cours
        ).prefetch_related(
            'players',
            'matches',
            'matches__player1',
            'matches__player2',
            'matches__winner'
        ).order_by('-created_at')

        # Utiliser notre serializer pour formater les données
        serializer = self.get_serializer(tournaments, many=True)
        
        # Pour chaque tournoi, ajouter des informations supplémentaires utiles
        data = serializer.data
        for tournament_data in data:
            # Trouver le prochain match du joueur dans ce tournoi
            next_match = None
            for match in tournament_data['matches']:
                if (match['status'] in ['pending', 'in_progress'] and 
                    (match['player1']['id'] == player.id or 
                     (match['player2'] and match['player2']['id'] == player.id))):
                    next_match = match
                    break
            
            tournament_data['next_match'] = next_match
            
            # Ajouter le statut du joueur dans le tournoi
            if tournament_data['status'] == 'completed':
                if tournament_data['winner'] and tournament_data['winner']['id'] == player.id:
                    tournament_data['player_status'] = 'winner'
                else:
                    tournament_data['player_status'] = 'eliminated'
            elif next_match:
                if next_match['status'] == 'pending':
                    tournament_data['player_status'] = 'waiting'
                else:
                    tournament_data['player_status'] = 'playing'
            else:
                tournament_data['player_status'] = 'eliminated'

        return Response(data)
