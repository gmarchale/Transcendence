function initTournament() {
    console.log("Tournament page loaded");
    initTournamentPageList();
    loadTournament(getHashParam('id'));
}

async function loadTournament(tournamentId) {
    try {
        const response = await fetch(`api/tournaments/${tournamentId}/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            }
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const tournament = await response.json();
        console.log('Tournament:', tournament);
        displayTournamentName(tournament.name);
        displayPlayers(tournament);

        return tournament;
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

function displayTournamentName(name) {
    const titleElement = document.querySelector('#tournamentName');

    if (titleElement) {
        titleElement.textContent = name;
    } else {
        console.error('Tournament title element not found');
    }
}

function initTournamentPageList() {
    const modal = document.getElementById('tournamentPageListModal');
    const tournamentList = document.getElementById('tournamentPageList');
    const titleElement = document.getElementById('tournamentTitle');

    if (!titleElement) {
        console.error("Element #tournamentTitle not found");
        return;
    }

    titleElement.addEventListener('click', async function() {
        modal.style.display = 'flex';
        const tournaments = await getPlayerTournaments();
        displayTournamentsPage(tournaments);
    });

    document.getElementById('closeTournamentPageList').addEventListener('click', function() {
        modal.style.display = 'none';
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

function displayTournamentsPage(tournaments) {
    const tournamentList = document.getElementById('tournamentPageList');
    tournamentList.innerHTML = '';

    if (!tournaments || tournaments.length === 0) {
        tournamentList.innerHTML = '<p class="game_error-message">No tournaments found</p>';
        return;
    }

    tournaments.forEach(tournament => {
        const button = document.createElement('button');
        button.className = 'game_tournament-btn';
        button.innerHTML = `
            <span>${tournament.name}</span>
            <span class="game_tournament-status">${tournament.status}</span>
        `;
        button.addEventListener('click', () => {
            window.location.hash = `#tournament/${tournament.id}`;
            document.getElementById('tournamentPageListModal').style.display = 'none';
        });
        tournamentList.appendChild(button);
    });
}

function displayPlayers(tournament) {
    const playersListElement = document.getElementById('playersList');

    playersListElement.innerHTML = '';

    if (!tournament.players || tournament.players.length === 0) {
        playersListElement.innerHTML = '<div class="tournament_no-players">No players have joined this tournament yet</div>';
        return;
    }
    
    // Ajoute les joueurs
    tournament.players.forEach(player => {
        const playerItem = document.createElement('div');

        const isCreator = player.player.id === tournament.creator.id;
        // const isEliminated = player.eliminated === true;
        const isEliminated = false;
        if (isCreator) {
            playerItem.className = 'tournament_player-item tournament_player-creator';
        } else if (isEliminated) {
            playerItem.className = 'tournament_player-item tournament_player-eliminated';
        } else {
            playerItem.className = 'tournament_player-item tournament_player-active';
        }

        let playerContent = `
            <span class="tournament_player-name">${player.display_name || 'Anonymous'}</span>
        `;
 
        if (isCreator) {
            playerContent += `<span class="tournament_player-badge">Creator</span>`;
        }
        
        playerItem.innerHTML = playerContent;
        playersListElement.appendChild(playerItem);
    });
}
