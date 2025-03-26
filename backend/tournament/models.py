from django.db import models
from django.utils import timezone
from users.models import User
from game.models import Game

class Tournament(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    name = models.CharField(max_length=100)
    creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name='created_tournaments')
    players = models.ManyToManyField(User, related_name='tournaments')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    winner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='tournament_wins')
    max_players = models.IntegerField(default=8)  # Power of 2 for bracket system

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"

class TournamentPlayer(models.Model):
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='display_names')
    player = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tournament_display_names')
    display_name = models.CharField(max_length=50)
    joined_at = models.DateTimeField(default=timezone.now)
    alive = models.BooleanField(default=True)  # True if player is still in tournament, False if eliminated

    class Meta:
        unique_together = [
            ('tournament', 'player'),  # Un joueur ne peut être qu'une fois dans un tournoi
            ('tournament', 'display_name'),  # Le display_name doit être unique dans le tournoi
        ]

    def __str__(self):
        return f"{self.display_name} in {self.tournament.name}"

class TournamentMatch(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='matches')
    game = models.OneToOneField(Game, on_delete=models.SET_NULL, null=True, blank=True)
    player1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tournament_matches_1')
    player2 = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tournament_matches_2')
    winner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='tournament_match_wins')
    round_number = models.IntegerField()  # 1 = first round, 2 = quarter-finals, 3 = semi-finals, 4 = finals
    match_number = models.IntegerField()  # Position in the round
    next_match = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='previous_matches')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    player1_ready = models.BooleanField(default=False)
    player2_ready = models.BooleanField(default=False)

    class Meta:
        ordering = ['round_number', 'match_number']

    def __str__(self):
        return f"Match {self.match_number} (Round {self.round_number}): {self.player1.username} vs {self.player2.username}"
