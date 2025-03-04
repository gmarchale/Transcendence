from django.urls import path, include
from . import views


urlpatterns = [
    path('create/', views.create_game, name='create_game'),
    path('join/<int:game_id>/', views.join_game, name='join_game'),
    path('get_games/', views.get_games, name='get_games'),
]
