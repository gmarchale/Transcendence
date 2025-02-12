from rest_framework import serializers
from .models import Tournament, TournamentMatch
from users.serializers import UserSerializer

class TournamentMatchSerializer(serializers.ModelSerializer):
    player1 = UserSerializer(read_only=True)
    player2 = UserSerializer(read_only=True)
    winner = UserSerializer(read_only=True)

    class Meta:
        model = TournamentMatch
        fields = ['id', 'tournament', 'game', 'player1', 'player2', 'winner', 
                 'round_number', 'match_number', 'next_match', 'status', 
                 'created_at', 'started_at', 'ended_at']
        read_only_fields = ['tournament', 'game', 'next_match']

class TournamentSerializer(serializers.ModelSerializer):
    creator = UserSerializer(read_only=True)
    players = UserSerializer(many=True, read_only=True)
    winner = UserSerializer(read_only=True)
    matches = TournamentMatchSerializer(many=True, read_only=True)

    class Meta:
        model = Tournament
        fields = ['id', 'name', 'creator', 'players', 'status', 'created_at', 
                 'started_at', 'ended_at', 'winner', 'max_players', 'matches']
        read_only_fields = ['creator', 'status', 'started_at', 'ended_at', 'winner']
