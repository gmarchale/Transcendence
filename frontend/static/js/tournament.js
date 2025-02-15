function initTournament(){
    document.getElementById('game_createTournamentBtn').addEventListener('click', function() {
        const tournamentName = prompt('Enter tournament name:');
        if (tournamentName) {
            createTournament(tournamentName);
        }
    });
    
    document.getElementById('game_joinTournamentBtn').addEventListener('click', function() {
        const tournamentId = prompt('Enter tournament ID:');
        if (tournamentId) {
            joinTournament(tournamentId);
        }
    });
}

async function createTournament(name) {
    try {
        const response = await fetch('/api/tournaments/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                name: name,
                max_players: 8
            })
        });

        const data = await response.json();
        if (response.ok) {
            alert(`Tournament created! Tournament ID: ${data.id}\nShare this ID with other players to join.`);
        } else {
            alert('Error creating tournament: ' + data.error);
        }
    } catch (error) {
        alert('Error creating tournament');
        console.error('Error:', error);
    }
}

async function joinTournament(tournamentId) {
    try {
        const response = await fetch(`/api/tournaments/${tournamentId}/join/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            }
        });

        const data = await response.json();
        if (response.ok) {
            alert('Successfully joined tournament!');
        } else {
            alert('Error joining tournament: ' + data.error);
        }
    } catch (error) {
        alert('Error joining tournament');
        console.error('Error:', error);
    }
}
