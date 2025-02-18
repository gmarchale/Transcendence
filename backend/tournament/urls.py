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
]
