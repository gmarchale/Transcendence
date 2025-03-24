from django.utils import timezone
from datetime import timedelta
from django.db.models import Q


def cleanup_inactive_games():
    """
    Parcourt toutes les parties en cours, en attente ou actives (status='playing', 'waiting' ou 'active') 
    qui ont commencé il y a plus de 5 minutes.
    - Si la partie a un score de 0-0, elle est supprimée de la base de données.
    - Sinon, son statut est mis à 'finished' et la date de fin (end_time) enregistrée.
    
    Cette fonction peut être utilisée dans une tâche Celery ou une commande Django.
    """
    from game.models import Game  # Import local pour éviter les imports circulaires
    
    # Heure actuelle
    now = timezone.now()
    
    # Calcul de l'heure limite (5 minutes dans le passé)
    time_threshold = now - timedelta(minutes=5)
    
    # Récupération des parties en cours, en attente ou actives qui ont commencé il y a plus de 5 minutes
    inactive_games = Game.objects.filter(
        status__in=['playing', 'waiting', 'active'],
        created_at__lt=time_threshold
    )
    
    # Compteurs pour les statistiques
    deleted_count = 0
    finished_count = 0
    
    # Traitement de chaque partie inactive
    for game in inactive_games:
        if game.score_player1 == 0 and game.score_player2 == 0:
            # Si le score est 0-0, suppression de la partie
            game_id = game.id
            game.delete()
            deleted_count += 1
            print(f"Partie #{game_id} supprimée (score 0-0, inactive depuis plus de 5 minutes)")
        else:
            # Sinon, mise à jour du statut et enregistrement de la date de fin
            game.status = 'finished'
            
            # Calcul de la durée en secondes
            duration_seconds = (now - game.created_at).total_seconds()
            game.duration = duration_seconds
            
            # Formatage de la durée en MM:SS
            minutes, seconds = divmod(int(duration_seconds), 60)
            game.duration_formatted = f"{minutes:02d}:{seconds:02d}"
            
            # Détermination du gagnant
            if game.score_player1 > game.score_player2:
                game.winner = game.player1
            elif game.score_player2 > game.score_player1:
                game.winner = game.player2
            
            # Sauvegarde des modifications
            game.save()
            finished_count += 1
            print(f"Partie #{game.id} terminée (score {game.score_player1}-{game.score_player2}, inactive depuis plus de 5 minutes)")
    
    return {
        'deleted': deleted_count,
        'finished': finished_count,
        'total_processed': deleted_count + finished_count
    }
