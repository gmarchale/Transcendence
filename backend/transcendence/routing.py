from django.urls import re_path
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack
from channels.security.websocket import AllowedHostsOriginValidator
from game.consumers import GameConsumer
from tournament.consumers import TournamentConsumer
from livechat.consumers import ChatConsumer

websocket_urlpatterns = [
    re_path(r'ws/game/(?P<game_id>\d+)/$', GameConsumer.as_asgi()),
    re_path(r'ws/tournament/(?P<tournament_id>\d+)/$', TournamentConsumer.as_asgi()),
    re_path(r'ws/chat/$', ChatConsumer.as_asgi()),
]

application = ProtocolTypeRouter({
    'websocket': AllowedHostsOriginValidator(
        AuthMiddlewareStack(
            URLRouter(websocket_urlpatterns)
        )
    ),
})
