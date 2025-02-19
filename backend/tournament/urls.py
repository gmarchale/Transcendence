from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'', views.TournamentViewSet, basename='tournament')

urlpatterns = [
    # Routes de base pour le CRUD des tournois
    path('', include(router.urls)),
    
    # Routes spécifiques pour les actions du tournoi
    path('<int:pk>/join/', views.TournamentViewSet.as_view({'post': 'join'}), name='tournament-join'),
    path('<int:pk>/start/', views.TournamentViewSet.as_view({'post': 'start'}), name='tournament-start'),
    path('<int:pk>/complete-match/', views.TournamentViewSet.as_view({'post': 'complete_match'}), name='tournament-complete-match'),
    path('<int:pk>/player-ready/', views.TournamentViewSet.as_view({'post': 'player_ready'}), name='tournament-player-ready'),
    path('<int:pk>/forfeit/', views.TournamentViewSet.as_view({'post': 'forfeit'}), name='tournament-forfeit'),
    path('player-tournaments/<int:player_id>/', views.TournamentViewSet.as_view({'get': 'get_player_tournaments'}), name='player-tournaments'),
]
