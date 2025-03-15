from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/game/$', consumers.GameUIConsumer.as_asgi()),
    re_path(r'ws/play/(?P<game_id>[^/]+)/$', consumers.GamePlayConsumer.as_asgi()),
]
