import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Tournament, TournamentMatch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q
import math
import logging
from game.models import Game

logger = logging.getLogger('tournament')

class TournamentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        # Accept the connection first
        await self.accept()
        logger.info(f"[WS] Tournament WebSocket connection accepted for user {self.user.username}")

        # Join tournament group
        self.tournament_id = self.scope['url_route']['kwargs']['tournament_id']
        self.tournament_group_name = f'tournament_{self.tournament_id}'
        self.active_match = None

        await self.channel_layer.group_add(
            self.tournament_group_name,
            self.channel_name
        )

        # Chercher si le joueur a un match actif
        self.active_match = await self.get_active_match()
        if self.active_match:
            logger.info(f"Player {self.user.username} reconnected to match {self.active_match.id}")

    @database_sync_to_async
    def get_active_match(self):
        """Récupère le match actif du joueur dans ce tournoi"""
        try:
            return TournamentMatch.objects.filter(
                tournament_id=self.tournament_id,
                status='in_progress'
            ).filter(
                Q(player1=self.user) | Q(player2=self.user)
            ).first()
        except Exception as e:
            logger.error(f"Error getting active match: {str(e)}")
            return None

    @database_sync_to_async
    def handle_player_disconnect(self):
        """Gère la déconnexion d'un joueur pendant un match"""
        if not self.active_match:
            return

        try:
            # Si le match est en cours et qu'un joueur se déconnecte
            if self.active_match.status == 'in_progress':
                # Détermine le gagnant (l'autre joueur)
                winner = self.active_match.player2 if self.user == self.active_match.player1 else self.active_match.player1
                
                # Met à jour le match
                self.active_match.winner = winner
                self.active_match.status = 'completed'
                self.active_match.ended_at = timezone.now()
                self.active_match.save()

                # Met à jour le jeu associé
                if self.active_match.game:
                    game = self.active_match.game
                    game.status = 'finished'
                    game.winner = winner
                    game.save()

                # Crée le prochain match si nécessaire
                tournament = self.active_match.tournament
                if self.active_match.round_number == math.ceil(math.log2(tournament.players.count())):
                    # C'était la finale
                    tournament.status = 'completed'
                    tournament.winner = winner
                    tournament.ended_at = timezone.now()
                    tournament.save()
                else:
                    # Vérifie si l'autre match de la paire est terminé
                    next_match_number = (self.active_match.match_number + 1) // 2
                    current_round_matches = TournamentMatch.objects.filter(
                        tournament=tournament,
                        round_number=self.active_match.round_number,
                        match_number__in=[
                            self.active_match.match_number - (1 if self.active_match.match_number % 2 == 0 else 0),
                            self.active_match.match_number + (1 if self.active_match.match_number % 2 == 1 else 0)
                        ]
                    )

                    if all(m.status == 'completed' for m in current_round_matches):
                        winners = [m.winner for m in current_round_matches]
                        next_match = TournamentMatch.objects.create(
                            tournament=tournament,
                            player1=winners[0],
                            player2=winners[1] if len(winners) > 1 else None,
                            round_number=self.active_match.round_number + 1,
                            match_number=next_match_number
                        )

                return {
                    'match_id': self.active_match.id,
                    'winner_id': winner.id,
                    'tournament_id': tournament.id,
                    'status': tournament.status
                }
        except Exception as e:
            logger.error(f"Error handling player disconnect: {str(e)}")
            return None

    async def disconnect(self, close_code):
        try:
            if self.active_match:
                # Gère la déconnexion du joueur
                result = await self.handle_player_disconnect()
                if result:
                    # Notifie les autres joueurs
                    await self.channel_layer.group_send(
                        self.tournament_group_name,
                        {
                            'type': 'match_update',
                            'match_id': result['match_id'],
                            'status': 'completed',
                            'winner_id': result['winner_id'],
                            'forfeit': True,
                            'forfeited_by': self.user.id,
                            'reason': 'disconnected'
                        }
                    )

                    if result['status'] == 'completed':
                        await self.channel_layer.group_send(
                            self.tournament_group_name,
                            {
                                'type': 'tournament_update',
                                'status': 'completed',
                                'winner_id': result['winner_id'],
                                'message': f"Tournament completed! Winner: {self.active_match.winner.username}"
                            }
                        )

        except Exception as e:
            logger.error(f"Error in disconnect: {str(e)}")
        finally:
            # Leave tournament group
            await self.channel_layer.group_discard(
                self.tournament_group_name,
                self.channel_name
            )

    async def match_ready(self, event):
        # Send match ready notification to client with all necessary info
        await self.send(text_data=json.dumps({
            'type': 'match_ready',
            'match_id': event['match_id'],
            'game_id': event['game_id'],
            'player1_id': event['player1_id'],
            'player2_id': event['player2_id']
        }))

    async def match_ready_notification(self, event):
        await self.send(text_data=json.dumps({
            'type': 'match_ready_notification',
            'match_id': event['match_id'],
            'match_number': event['match_number'],
            'round_size': event['round_size'],
            'players': event['players']
        }))
        

    async def match_update(self, event):
        # Send match update to client
        await self.send(text_data=json.dumps({
            'type': 'match_update',
            'match_id': event['match_id'],
            'game_id': event.get('game_id'),
            'status': event.get('status'),
            'winner_id': event.get('winner_id'),
            'player1_ready': event.get('player1_ready'),
            'player2_ready': event.get('player2_ready'),
            'forfeit': event.get('forfeit'),
            'forfeited_by': event.get('forfeited_by'),
            'reason': event.get('reason')
        }))

    async def tournament_update(self, event):
        # Send tournament update to client
        await self.send(text_data=json.dumps({
            'type': 'tournament_update',
            'status': event.get('status'),
            'winner_id': event.get('winner_id'),
            'message': event.get('message')
        }))

    async def player_joined(self, event):
        """
        Handler for when a new player joins the tournament.
        Sends the player info to all connected clients in the tournament group.
        """
        logger.info(f"[WS] Player joined event received: {event}")
        # Forward the player_joined event to WebSocket
        await self.send(text_data=json.dumps({
            'type': 'player_joined',
            'player': event['player']
        }))
        logger.info(f"[WS] Player joined event sent to client")

    async def tournament_matches(self, event):
        await self.send(text_data=json.dumps({
            'type': 'tournament_matches',
            'matches': event['matches']
        }))

    async def receive_json(self, content):
        """Handle JSON messages received from WebSocket"""
        try:
            message_type = content.get('type')
            
            if message_type == 'game_end_message':
                # Handle game end notification
                await self.handle_game_end(content)
        except Exception as e:
            logger.error(f"Error in receive_json: {str(e)}", exc_info=True)
    
    @database_sync_to_async
    def get_match_by_game_id(self, game_id):
        """Get tournament match by game ID"""
        try:
            return TournamentMatch.objects.filter(
                tournament_id=self.tournament_id,
                game_id=game_id,
                status='in_progress'
            ).first()
        except Exception as e:
            logger.error(f"Error getting match by game ID: {str(e)}")
            return None
            
    @database_sync_to_async
    def get_user_by_id(self, user_id):
        """Get user by ID"""
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.get(id=user_id)
        except Exception as e:
            logger.error(f"Error getting user by ID: {str(e)}")
            return None
            
    @database_sync_to_async
    def update_match_with_winner(self, match, winner):
        """Update match with winner"""
        from django.utils import timezone
        
        try:
            # Set match winner
            match.winner = winner
            match.status = 'completed'
            match.ended_at = timezone.now()
            match.save()
            
            # Update tournament player status
            tournament = match.tournament
            loser = match.player2 if winner == match.player1 else match.player1
            
            # Update the loser's alive status to False
            from tournament.models import TournamentPlayer
            TournamentPlayer.objects.filter(
                tournament=tournament,
                player=loser
            ).update(alive=False)
            
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
            import math
            if alive_players == 1 or match.round_number == math.ceil(math.log2(tournament.players.count())):
                tournament.status = 'completed'
                tournament.winner = winner
                tournament.ended_at = timezone.now()
                tournament.save()
                return True
            
            # Create next round match if needed
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
                    match_number=next_match_number,
                    status='pending'
                )
                
                # Send match creation event to tournament group
                # await self.channel_layer.group_send(
                #     f'tournament_{tournament.id}',
                #     {
                #         'type': 'match_created',
                #         'match': next_match
                #     }
                # )
            
            return False
            
        except Exception as e:
            logger.error(f"Error updating match with winner: {str(e)}", exc_info=True)
            return False
            
    async def handle_game_end(self, content):
        """Handle game end notification"""
        try:
            game_id = content.get('game_id')
            winner_id = content.get('winner_id')
            
            if not game_id or not winner_id:
                logger.error(f"Missing game_id or winner_id in game_end message")
                return
                
            # Find match associated with this game
            match = await self.get_match_by_game_id(game_id)
            if not match:
                logger.error(f"No match found for game {game_id}")
                return
                
            # Get winner user
            winner = await self.get_user_by_id(winner_id)
            if not winner:
                logger.error(f"No user found with ID {winner_id}")
                return
                
            # Update match with winner
            tournament_completed = await self.update_match_with_winner(match, winner)
            
            # Get winner's display name
            from tournament.models import TournamentPlayer
            winner_display_name = await database_sync_to_async(
                lambda: TournamentPlayer.objects.get(tournament=match.tournament, player=winner).display_name
            )()
            
            # Send update to all clients in tournament group
            await self.channel_layer.group_send(
                self.tournament_group_name,
                {
                    'type': 'match_update',
                    'match_id': match.id,
                    'match_number': match.match_number,
                    'round_size': 2 ** (match.round_number - 1),
                    'winner': {
                        'id': winner.id,
                        'display_name': winner_display_name
                    },
                    'status': 'completed'
                }
            )
            
            # If tournament completed, send additional message
            if tournament_completed:
                await self.channel_layer.group_send(
                    self.tournament_group_name,
                    {
                        'type': 'tournament_update',
                        'status': 'completed',
                        'winner_id': winner.id,
                        'message': f"Tournament completed! Winner: {winner.username}"
                    }
                )
                
        except Exception as e:
            logger.error(f"Error handling game end: {str(e)}", exc_info=True)
    