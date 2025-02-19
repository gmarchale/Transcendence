from rest_framework import serializers
from .models import Tournament, TournamentMatch, TournamentPlayer
from users.serializers import UserSerializer

class TournamentPlayerSerializer(serializers.ModelSerializer):
    player = UserSerializer()
    
    class Meta:
        model = TournamentPlayer
        fields = ['id', 'player', 'display_name', 'joined_at']

class TournamentMatchSerializer(serializers.ModelSerializer):
    player1 = UserSerializer()
    player2 = UserSerializer()
    winner = UserSerializer()
    player1_display_name = serializers.SerializerMethodField()
    player2_display_name = serializers.SerializerMethodField()
    winner_display_name = serializers.SerializerMethodField()

    class Meta:
        model = TournamentMatch
        fields = ['id', 'tournament', 'game', 'player1', 'player2', 'winner', 
                 'round_number', 'match_number', 'next_match', 'status', 
                 'created_at', 'started_at', 'ended_at', 'player1_ready', 
                 'player2_ready', 'player1_display_name', 'player2_display_name', 
                 'winner_display_name']
        read_only_fields = ['tournament', 'game', 'next_match']

    def get_player1_display_name(self, obj):
        try:
            tp = TournamentPlayer.objects.get(tournament=obj.tournament, player=obj.player1)
            return tp.display_name
        except TournamentPlayer.DoesNotExist:
            return obj.player1.username

    def get_player2_display_name(self, obj):
        if not obj.player2:
            return None
        try:
            tp = TournamentPlayer.objects.get(tournament=obj.tournament, player=obj.player2)
            return tp.display_name
        except TournamentPlayer.DoesNotExist:
            return obj.player2.username

    def get_winner_display_name(self, obj):
        if not obj.winner:
            return None
        try:
            tp = TournamentPlayer.objects.get(tournament=obj.tournament, player=obj.winner)
            return tp.display_name
        except TournamentPlayer.DoesNotExist:
            return obj.winner.username

class TournamentSerializer(serializers.ModelSerializer):
    players = TournamentPlayerSerializer(source='display_names', many=True, read_only=True)
    matches = TournamentMatchSerializer(many=True, read_only=True)
    creator = UserSerializer(read_only=True)
    winner = UserSerializer(read_only=True)
    creator_display_name = serializers.SerializerMethodField()
    winner_display_name = serializers.SerializerMethodField()

    class Meta:
        model = Tournament
        fields = ['id', 'name', 'creator', 'players', 'status', 'created_at', 
                 'started_at', 'ended_at', 'winner', 'max_players', 'matches',
                 'creator_display_name', 'winner_display_name']
        read_only_fields = ['creator', 'status', 'started_at', 'ended_at', 'winner']

    def get_creator_display_name(self, obj):
        try:
            tp = TournamentPlayer.objects.get(tournament=obj, player=obj.creator)
            return tp.display_name
        except TournamentPlayer.DoesNotExist:
            return obj.creator.username

    def get_winner_display_name(self, obj):
        if not obj.winner:
            return None
        try:
            tp = TournamentPlayer.objects.get(tournament=obj, player=obj.winner)
            return tp.display_name
        except TournamentPlayer.DoesNotExist:
            return obj.winner.username
