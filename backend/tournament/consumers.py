import json
from channels.generic.websocket import AsyncWebsocketConsumer

class TournamentConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        # Join tournament group
        self.tournament_id = self.scope['url_route']['kwargs']['tournament_id']
        self.tournament_group_name = f'tournament_{self.tournament_id}'

        await self.channel_layer.group_add(
            self.tournament_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
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

    async def match_update(self, event):
        # Send match update to client
        await self.send(text_data=json.dumps({
            'type': 'match_update',
            'match_id': event['match_id'],
            'status': event.get('status'),
            'winner_id': event.get('winner_id')
        }))
