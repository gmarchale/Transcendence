from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from .models import Tournament, TournamentMatch, TournamentPlayer
from .serializers import TournamentSerializer, TournamentMatchSerializer
import math
from game.models import Game
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
        
        # Add creator to tournament's players
        tournament.players.add(self.request.user)
        
        # Create TournamentPlayer entry for the creator
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
        if TournamentPlayer.objects.filter(tournament=tournament, display_name=display_name).exists():
            return Response(
                {'error': 'This display name is already taken in this tournament'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Add player to the tournament's players
            tournament.players.add(self.request.user)
            
            # Create TournamentPlayer entry
            TournamentPlayer.objects.create(
                tournament=tournament,
                player=self.request.user,
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
            
        except Exception as e:
            # If anything fails, return a 500 error with the error message
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def create_tournament_game(self, match):
        """Create a game for a tournament match and notify players"""
        # Create the game
        game = Game.objects.create(
            player1=match.player1,
            player2=match.player2,
            status='waiting'  # Set to waiting
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
        matches_data = []
        
        # Create all tournament matches upfront (without games)
        # First, create all first round matches
        first_round_matches = []
        matches_in_round = num_players // 2
        for i in range(matches_in_round):
            match = TournamentMatch.objects.create(
                tournament=tournament,
                player1=players[i*2],
                player2=players[i*2 + 1] if i*2 + 1 < num_players else None,
                round_number=1,
                match_number=i + 1,
                status='pending'  # All matches start as pending
            )
            first_round_matches.append(match)
            
            # Add match data for WebSocket
            player1_data = TournamentPlayer.objects.get(tournament=tournament, player=players[i*2])
            player2_data = TournamentPlayer.objects.get(tournament=tournament, player=players[i*2 + 1]) if i*2 + 1 < num_players else None
            matches_data.append({
                'match_number': i + 1,
                'round_size': 2 ** (num_rounds - 1),  # Will be 8 for eighth-finals, 4 for quarters, etc.
                'player1': {'id': players[i*2].id, 'display_name': player1_data.display_name},
                'player2': {'id': players[i*2 + 1].id, 'display_name': player2_data.display_name} if player2_data else None
            })
        
        # Create future round matches with placeholder user ID 0
        # Get or create a placeholder user with ID 0
        placeholder_user, created = User.objects.get_or_create(
            id=0,
            defaults={
                'username': 'placeholder',
                'email': 'placeholder@example.com'
            }
        )
        
        # Create future round matches with placeholder user
        for round_num in range(2, num_rounds + 1):
            matches_in_round = 2 ** (num_rounds - round_num)
            for i in range(matches_in_round):
                TournamentMatch.objects.create(
                    tournament=tournament,
                    player1=placeholder_user,  # Placeholder user
                    player2=placeholder_user,  # Placeholder user
                    round_number=round_num,
                    match_number=i + 1,
                    status='pending'
                )
        
        # Only create a game for the first match of the first round
        if first_round_matches:
            first_match = first_round_matches[0]
            self.create_tournament_game(first_match)
            
            # Send match ready notification for the first match
            player1_data = TournamentPlayer.objects.get(tournament=tournament, player=first_match.player1)
            player2_data = TournamentPlayer.objects.get(tournament=tournament, player=first_match.player2) if first_match.player2 else None
            
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'tournament_{tournament.id}',
                {
                    'type': 'match_ready_notification',
                    'match_id': first_match.id,
                    'match_number': 1,
                    'round_size': 2 ** (num_rounds - 1),
                    'players': [
                        {'id': first_match.player1.id, 'display_name': player1_data.display_name},
                        {'id': first_match.player2.id, 'display_name': player2_data.display_name} if player2_data else None
                    ]
                }
            )
            
        tournament.status = 'in_progress'
        tournament.started_at = timezone.now()
        tournament.save()

        # Send WebSocket message with matches info
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'tournament_{tournament.id}',
            {
                'type': 'tournament_matches',
                'matches': matches_data
            }
        )
        
        return Response({'status': 'tournament started'})

    def update_player_alive_status(self, tournament, match, winner):
        """Update the alive status of players after a match"""
        # Get the loser of the match
        loser = match.player2 if winner == match.player1 else match.player1
        
        # Update the loser's alive status to False
        TournamentPlayer.objects.filter(
            tournament=tournament,
            player=loser
        ).update(alive=False)

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
        
        self.update_player_alive_status(tournament, match, winner)
        
        match.winner = winner
        match.status = 'completed'
        match.ended_at = timezone.now()
        match.save()

        # Get winner's display name
        winner_display_name = TournamentPlayer.objects.get(tournament=tournament, player=winner).display_name

        # Calculate round size (8 for eighth-finals, 4 for quarters, etc.)
        num_rounds = math.ceil(math.log2(tournament.players.count()))
        round_size = 2 ** (num_rounds - match.round_number)

        # Send WebSocket message about match completion
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f'tournament_{tournament.id}',
            {
                'type': 'match_update',
                'match_number': match.match_number,
                'round_size': round_size,
                'winner': {
                    'id': winner.id,
                    'display_name': winner_display_name
                }
            }
        )

        # Update the game status
        if match.game:
            match.game.status = 'finished'
            match.game.winner = winner
            match.game.save()
        
        # Check if there's only one player alive
        alive_players = TournamentPlayer.objects.filter(
            tournament=tournament,
            alive=True
        ).count()

        # If only one player is alive or this was the final match, complete the tournament
        if alive_players == 1 or match.round_number == math.ceil(math.log2(tournament.players.count())):
            tournament.status = 'completed'
            tournament.winner = winner
            tournament.ended_at = timezone.now()
            tournament.save()
            return Response({
                'status': 'tournament completed',
                'winner': winner.username,
                'alive_players': alive_players
            })
        
        # If not final match, create the next round match if both matches are complete
        next_match_number = (match.match_number + 1) // 2
        
        # Find the paired match in the current round
        # For match 1, the pair is match 2; for match 3, the pair is match 4, etc.
        pair_match_number = match.match_number + 1 if match.match_number % 2 == 1 else match.match_number - 1
        
        current_round_matches = TournamentMatch.objects.filter(
            tournament=tournament,
            round_number=match.round_number,
            match_number__in=[match.match_number, pair_match_number]
        )
        
        # First, check if there are any pending matches in the current round that need a game created for them
        next_pending_match = TournamentMatch.objects.filter(
            tournament=tournament,
            round_number=match.round_number,
            status='pending',
            game__isnull=True
        ).order_by('match_number').first()
        
        if next_pending_match:
            # Create a game for the next pending match in the current round
            self.create_tournament_game(next_pending_match)
            
            # Get display names for the players
            player1_data = TournamentPlayer.objects.get(tournament=tournament, player=next_pending_match.player1)
            player2_data = TournamentPlayer.objects.get(tournament=tournament, player=next_pending_match.player2) if next_pending_match.player2 else None
            
            # Send match ready notification for the next match
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'tournament_{tournament.id}',
                {
                    'type': 'match_ready_notification',
                    'match_id': next_pending_match.id,
                    'match_number': next_pending_match.match_number,
                    'round_size': 2 ** (num_rounds - next_pending_match.round_number),
                    'players': [
                        {'id': next_pending_match.player1.id, 'display_name': player1_data.display_name},
                        {'id': next_pending_match.player2.id, 'display_name': player2_data.display_name} if player2_data else None
                    ]
                }
            )
        elif all(m.status == 'completed' for m in current_round_matches):
            # All matches in the current round are completed, update the next round match
            winners = [m.winner for m in current_round_matches]
            
            # Find the existing match in the next round
            next_match = TournamentMatch.objects.get(
                tournament=tournament,
                round_number=match.round_number + 1,
                match_number=next_match_number
            )
            
            # Update the match with the winners
            next_match.player1 = winners[0]
            next_match.player2 = winners[1] if len(winners) > 1 else None
            next_match.save()
            
            # Check if this is the first match of the next round
            is_first_match_of_round = next_match.match_number == 1
            
            # If this is the first match of the next round, create a game for it
            if is_first_match_of_round:
                self.create_tournament_game(next_match)
                
                # Get display names for the players
                player1_data = TournamentPlayer.objects.get(tournament=tournament, player=winners[0])
                player2_data = TournamentPlayer.objects.get(tournament=tournament, player=winners[1]) if len(winners) > 1 else None
                
                # Send match ready notification for the next match
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'tournament_{tournament.id}',
                    {
                        'type': 'match_ready_notification',
                        'match_id': next_match.id,
                        'match_number': next_match.match_number,
                        'round_size': 2 ** (num_rounds - next_match.round_number),
                        'players': [
                            {'id': winners[0].id, 'display_name': player1_data.display_name},
                            {'id': winners[1].id, 'display_name': player2_data.display_name} if player2_data else None
                        ]
                    }
                )
        
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
        
        # Get the TournamentPlayer instance for this player
        tournament_player = TournamentPlayer.objects.filter(tournament=tournament, player=request.user).first()
        
        if tournament.status == 'pending':
            # Si le tournoi est en attente, supprimer le TournamentPlayer
            if tournament_player:
                tournament_player.delete()
            tournament.players.remove(request.user)
            
            # Notifier via WebSocket du retrait du joueur
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f'tournament_{tournament.id}',
                {
                    'type': 'remove_player',
                    'player_id': request.user.id,
                    'player_username': request.user.username,
                    'tournament_id': tournament.id
                }
            )
            
            if is_creator:
                if tournament.players.count() == 0:
                    # Le créateur est seul, annuler le tournoi
                    tournament.status = 'cancelled'
                    tournament.ended_at = timezone.now()
                    tournament.save()
                    
                    # Notifier via WebSocket
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
                    # Désigner un nouveau créateur
                    new_creator = tournament.players.first()
                    tournament.creator = new_creator
                    tournament.save()
                    
                    # Notifier du changement de créateur
                    async_to_sync(channel_layer.group_send)(
                        f'tournament_{tournament.id}',
                        {
                            'type': 'tournament_update',
                            'status': tournament.status,
                            'new_creator_id': new_creator.id,
                            'message': f"New tournament creator: {new_creator.username}"
                        }
                    )
                    return Response({'status': 'creator changed'})
            return Response({'status': 'player removed'})
            
        elif tournament.status == 'in_progress':
            # Si le tournoi est en cours, marquer le joueur comme éliminé
            if tournament_player:
                tournament_player.alive = False
                tournament_player.save()
                
                # Notifier via WebSocket
                channel_layer = get_channel_layer()
                async_to_sync(channel_layer.group_send)(
                    f'tournament_{tournament.id}',
                    {
                        'type': 'remove_player',
                        'player_id': request.user.id,
                        'player_username': request.user.username,
                        'tournament_id': tournament.id
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
                
            return Response({'status': 'no active match'})
            
        return Response({'status': 'tournament not started'})


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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_match_details(request, match_id):
    try:
        match = TournamentMatch.objects.get(id=match_id)
        
        # Create a response with the match details
        data = {
            'id': match.id,
            'tournament_id': match.tournament.id,
            'round_number': match.round_number,
            'match_number': match.match_number,
            'status': match.status,
        }
        
        # Add player information safely
        try:
            data['player1_id'] = match.player1.id if match.player1 else None
        except Exception as e:
            print(f"Error getting player1: {e}")
            data['player1_id'] = None
            
        try:
            data['player2_id'] = match.player2.id if match.player2 else None
        except Exception as e:
            print(f"Error getting player2: {e}")
            data['player2_id'] = None
            
        try:
            data['winner_id'] = match.winner.id if match.winner else None
        except Exception as e:
            print(f"Error getting winner: {e}")
            data['winner_id'] = None
            
        try:
            data['game_id'] = match.game.id if match.game else None
        except Exception as e:
            print(f"Error getting game: {e}")
            data['game_id'] = None
            
        # Add timestamp information safely
        try:
            data['started_at'] = match.started_at
        except Exception as e:
            print(f"Error getting started_at: {e}")
            data['started_at'] = None
        
        return Response(data)
    except TournamentMatch.DoesNotExist:
        return Response({'error': 'Match not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"Unexpected error in get_match_details: {e}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def update_match_game_id(request, match_id):
    match = TournamentMatch.objects.get(id=match_id)
    game_id = request.data.get('game_id')
    
    # Récupérer l'objet Game correspondant au game_id
    game = None
    if game_id:
        game = get_object_or_404(Game, id=game_id)
    
    # Mettre à jour la relation avec l'objet Game
    match.game = game
    match.save()
    
    # Notifier tous les clients connectés au tournoi
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f'tournament_{match.tournament.id}',
        {
            'type': 'match_update',
            'match_id': match_id,
            'game_id': game_id
        }
    )
    
    return Response({'success': True})
