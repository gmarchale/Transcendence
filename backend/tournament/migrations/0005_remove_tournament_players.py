from django.db import migrations

class Migration(migrations.Migration):
    dependencies = [
        ('tournament', '0004_tournamentplayer_alive'),
    ]

    operations = [
        migrations.RunSQL(
            "DROP TABLE IF EXISTS tournament_tournament_players;",
            reverse_sql=""
        ),
    ]
