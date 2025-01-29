from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'games', views.GameViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('create/', views.create_game, name='create_game'),
    path('join/<int:game_id>/', views.join_game, name='join_game'),
    path('tournament/create/', views.create_tournament, name='create_tournament'),
    path('tournament/join/<int:tournament_id>/', views.join_tournament, name='join_tournament'),
    path('active/', views.active_games, name='active_games'),
    path('history/', views.user_games, name='user_games'),
    path('tournaments/active/', views.active_tournaments, name='active_tournaments'),
    path('status/', views.game_status, name='game_status'),
]
