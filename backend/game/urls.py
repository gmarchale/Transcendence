from django.urls import path, include
from . import views


urlpatterns = [
    path('create/', views.create_game, name='create_game'),
    path('join/<int:game_id>/', views.join_game, name='join_game'),
    path('get_games/', views.get_games, name='get_games'),
    path('get_stats/', views.get_stats, name='get_stats'),
    path('play/<int:game_id>/', views.get_status, name='get_status'),
    path('end/<int:game_id>/', views.end_game, name='end_game'),
]
