function getTournamentId() {
    const hash = window.location.hash;
    const matches = hash.match(/^#tournament\/(\d+)/);
    return matches ? matches[1] : null;
}

function initTournament() {
    const tournamentId = getTournamentId();
    const notFoundElement = document.getElementById('tournamentNotFound');
    const contentElement = document.getElementById('tournamentContent');
    
    if (!tournamentId) {
        notFoundElement.style.display = 'block';
        contentElement.style.display = 'none';
        return;
    }
    
    notFoundElement.style.display = 'none';
    contentElement.style.display = 'flex';
    
    resetButtonListeners();
    
    loadTournament(tournamentId).then(tournament => {
        if (tournament) {
            initTournamentPageList();
            initTournamentActions(tournament);
        } else {
            notFoundElement.style.display = 'block';
            contentElement.style.display = 'none';
        }
    });
}

window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#tournament')) {
        initTournament();
    }
});

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
        displayTournamentName(tournament.name);
        displayPlayers(tournament);

        // Setup WebSocket connection
        const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const ws = new WebSocket(`${wsScheme}://${window.location.host}/ws/tournament/${tournamentId}/`);
        
        ws.onmessage = function(event) {
            const data = JSON.parse(event.data);
            console.log('WebSocket message received:', data);
            
            if (data.type === 'player_joined') {
                // Reload tournament data to update players list
                loadTournament(tournamentId);
            }
        };

        ws.onclose = function(e) {
            console.log('Tournament WebSocket connection closed');
        };

        ws.onerror = function(e) {
            console.error('Tournament WebSocket error:', e);
        };

        return tournament;
    } catch (error) {
        return null;
    }
}

function displayTournamentName(name) {
    const titleElement = document.querySelector('#tournamentName');
    if (titleElement) {
        titleElement.textContent = name;
    }
}

function initTournamentPageList() {
    const modal = document.getElementById('tournamentPageListModal');
    const tournamentList = document.getElementById('tournamentPageList');
    const titleElement = document.getElementById('tournamentTitle');

    if (!titleElement) {
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
        button.addEventListener('click', async () => {
            window.location.hash = `#tournament/${tournament.id}`;
            document.getElementById('tournamentPageListModal').style.display = 'none';
            
            const startButton = document.getElementById('tournamentStart');
            const readyButton = document.getElementById('tournamentReady');
            startButton.style.display = 'none';
            startButton.disabled = false;
            startButton.classList.remove('tournament_btn-disabled');
            startButton.title = '';
            readyButton.classList.remove('tournament_btn-active');
            readyButton.textContent = 'Ready';
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
    
    tournament.players.forEach(player => {
        const playerItem = document.createElement('div');
        const isCreator = player.player.id === tournament.creator.id;
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

    const playerCountElement = document.createElement('div');
    playerCountElement.className = 'tournament_player-count';
    playerCountElement.textContent = `Players: ${tournament.players.length}/${tournament.max_players}`;
    playersListElement.appendChild(playerCountElement);
}

function resetButtonListeners() {
    const elements = [
        'tournamentStart', 
        'tournamentReady', 
        'tournamentLeave',
        'tournamentTitle',
        'closeTournamentPageList'
    ];
    
    elements.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) { // clone and replace pattern: cree une copie de l'element et remplace l'element original par la copie ce qui enleve les event listeners
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
        }
    });
    
    const modal = document.getElementById('tournamentPageListModal');
    if (modal) {
        const newModal = modal.cloneNode(true);
        modal.parentNode.replaceChild(newModal, modal);
    }
}

async function initTournamentActions(tournament) {
    const startButton = document.getElementById('tournamentStart');
    const readyButton = document.getElementById('tournamentReady');
    const leaveButton = document.getElementById('tournamentLeave');
    const userId = await getid();
    
    const isCreator = userId === tournament.creator.id;
    
    if (isCreator) {
        startButton.style.display = 'block';
        
        const isTournamentFull = tournament.players.length >= tournament.max_players;
        
        if (!isTournamentFull) {
            startButton.disabled = true;
            startButton.classList.add('tournament_btn-disabled');
            startButton.title = `Waiting for more players (${tournament.players.length}/${tournament.max_players})`;
        } else {
            startButton.disabled = false;
            startButton.classList.remove('tournament_btn-disabled');
            startButton.title = 'Start the tournament';
        }
        
        startButton.addEventListener('click', async function() {
            if (isTournamentFull) {
                const tournamentId = getTournamentId();
                const response = await fetch(`api/tournaments/${tournamentId}/start/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCookie('csrftoken')
                    }
                });

                if (response.ok) {
                    loadTournament(tournamentId);
                } else {
                    const errorData = await response.json();
                    alert('Failed to start tournament: ' + (errorData.error || 'Unknown error'));
                }
            }
        });
    } else {
        startButton.style.display = 'none';
    }

    readyButton.addEventListener('click', async function() {
        const tournamentId = getTournamentId();
        
        const response = await fetch(`api/tournaments/${tournamentId}/player-ready/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            }
        });

        if (response.ok) {
            readyButton.classList.add('tournament_btn-active');
            readyButton.textContent = 'Ready ✓';
            loadTournament(tournamentId);
        } else {
            const errorData = await response.json();
            alert('Failed to set player ready: ' + (errorData.error || 'Unknown error'));
        }
    });

    leaveButton.addEventListener('click', async function() {
        const tournamentId = getTournamentId();
        
        const response = await fetch(`api/tournaments/${tournamentId}/player-leave/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            }
        });

        if (response.ok) {
            window.location.hash = '#tournament';
        } else {
            const errorData = await response.json();
            alert('Failed to leave tournament: ' + (errorData.error || 'Unknown error'));
        }
    });
}