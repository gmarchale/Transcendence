from django.db import migrations, models
from django.conf import settings

class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('tournament', '0005_remove_tournament_players'),
    ]

    operations = [
        migrations.AddField(
            model_name='tournament',
            name='players',
            field=models.ManyToManyField(related_name='tournaments', to=settings.AUTH_USER_MODEL),
        ),
    ]
