# Generated by Django 4.2.18 on 2025-01-25 20:55

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('game', '0002_initial'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='game',
            options={'ordering': ['-created_at']},
        ),
        migrations.RenameField(
            model_name='game',
            old_name='player1_score',
            new_name='score_player1',
        ),
        migrations.RenameField(
            model_name='game',
            old_name='player2_score',
            new_name='score_player2',
        ),
        migrations.RemoveField(
            model_name='game',
            name='finished_at',
        ),
        migrations.RemoveField(
            model_name='game',
            name='winner',
        ),
        migrations.AddField(
            model_name='game',
            name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name='game',
            name='player2',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='games_as_player2', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='game',
            name='status',
            field=models.CharField(choices=[('waiting', 'Waiting for Player'), ('playing', 'Game in Progress'), ('finished', 'Game Finished')], default='waiting', max_length=20),
        ),
    ]
