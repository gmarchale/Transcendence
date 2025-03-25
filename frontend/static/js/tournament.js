let currentSocket = null;

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

    // Initialize WebSocket connection once when tournament page loads
    initSocket(tournamentId);
    
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

function initSocket(tournamentId) {
    if (currentSocket) {
        currentSocket.close();
    }

    const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${wsScheme}://${window.location.host}/ws/tournament/${tournamentId}/`);
    currentSocket = ws;
    
    ws.onmessage = async function(event) {
        const data = JSON.parse(event.data);
        
        if (data.type === 'player_joined' || data.type === 'player_ready' || data.type === 'tournament_started' || data.type === 'remove_player') {
            loadTournament(tournamentId).then(tournament => {
                if (tournament) {
                    displayTournamentName(tournament.name);
                    displayPlayers(tournament);
                    initTournamentActions(tournament);
                }
            });
        } else if (data.type === 'match_ready_notification') {
            const userId = await getid();
            const opponent = data.players[0].id === userId ? 
                data.players[1]?.display_name : // si c'est le joueur 1, on stock son display name
                data.players[0].display_name;
            
            const roundName = getRoundName(data.round_size);
            loadTournament(tournamentId).then(tournament => {
                if (tournament) {
                    const message = `Tournament: ${tournament.name}\n${roundName} vs ${opponent}\n5 minutes to join or 1 minute once opponent is ready`;
                    showNotification(message, 'success', 5000);
                }
            });
        }
    };

    ws.onclose = function(e) {
        console.log('Tournament WebSocket connection closed');
        currentSocket = null;
    };

    ws.onerror = function(e) {
        console.error('Tournament WebSocket error:', e);
    };
}

function displayMatches(tournament) {
    const gamesListElement = document.getElementById('gamesList');
    gamesListElement.innerHTML = '';

    if (!tournament.matches || tournament.matches.length === 0) {
        gamesListElement.innerHTML = '<div class="tournament_no-games">No games in this tournament yet</div>';
        return;
    }
    
    const matchesByRound = {};
    tournament.matches.forEach(match => {
        if (!matchesByRound[match.round_number]) {
            matchesByRound[match.round_number] = [];
        }
        matchesByRound[match.round_number].push(match);
    });

    Object.keys(matchesByRound).sort((a, b) => a - b).forEach(roundNumber => {
        const roundDiv = document.createElement('div');
        roundDiv.className = 'tournament_round';
        
        const roundTitle = document.createElement('h4');
        roundTitle.className = 'tournament_round-title';
        roundTitle.textContent = `Round ${roundNumber}`;
        roundDiv.appendChild(roundTitle);

        matchesByRound[roundNumber].forEach(match => {
            const matchDiv = document.createElement('div');
            matchDiv.className = `tournament_match`;
            matchDiv.dataset.matchId = match.id;
            matchDiv.dataset.gameId = match.game ? match.game.id : '';
            
            // Marquer le match comme actif si le joueur actuel est impliqué et que le match est en cours
            if (match.status === 'in_progress' && 
                (match.player1_id === tournament.current_user_id || match.player2_id === tournament.current_user_id)) {
                matchDiv.classList.add('tournament_match-active');
            }
            
            const playersDiv = document.createElement('div');
            playersDiv.className = 'tournament_match-players';
            
            const player1Span = document.createElement('span');
            player1Span.className = 'tournament_match-player';
            if (match.winner_display_name === match.player1_display_name) {
                player1Span.classList.add('tournament_match-winner');
            }
            player1Span.textContent = match.player1_display_name;
            if (match.player1_ready) player1Span.classList.add('tournament_player-ready');
            
            const vsSpan = document.createElement('span');
            vsSpan.className = 'tournament_match-vs';
            vsSpan.textContent = 'VS';
            
            const player2Span = document.createElement('span');
            player2Span.className = 'tournament_match-player';
            if (match.winner_display_name === match.player2_display_name) {
                player2Span.classList.add('tournament_match-winner');
            }
            player2Span.textContent = match.player2_display_name;
            if (match.player2_ready) player2Span.classList.add('tournament_player-ready');
            
            playersDiv.appendChild(player1Span);
            playersDiv.appendChild(vsSpan);
            playersDiv.appendChild(player2Span);
            
            const statusDiv = document.createElement('div');
            statusDiv.className = 'tournament_match-status';
            
            if (match.winner_display_name) {
                statusDiv.textContent = `Winner: ${match.winner_display_name}`;
            } else {
                statusDiv.textContent = match.status.replace(/_/g, ' ');
            }
            
            matchDiv.appendChild(playersDiv);
            matchDiv.appendChild(statusDiv);
            
            roundDiv.appendChild(matchDiv);
        });

        gamesListElement.appendChild(roundDiv);
    });
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
        displayMatches(tournament);
        
        // WebSocket is now initialized only once in initTournament()
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
            
            // reset les boutons pour pas afficher immediatement des mauvais boutons
            const startButton = document.getElementById('tournamentStart');
            const GoToGameButton = document.getElementById('GoToGame');
            startButton.style.display = 'none';
            startButton.disabled = false;
            startButton.classList.remove('tournament_btn-disabled');
            startButton.title = '';
            GoToGameButton.classList.remove('tournament_btn-active');
            GoToGameButton.textContent = 'Ready';
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
        'GoToGame', 
        'tournamentforfeit',
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
    const GoToGameButton = document.getElementById('GoToGame');
    const forfeitButton = document.getElementById('tournamentforfeit');
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

    GoToGameButton.addEventListener('click', async function() {
        
        const match = getCurrentMatch();
    
        if (!match.game_id) {
            // Aucun game_id n'existe encore, ce joueur doit créer la partie
            await window.gameManager.startGame();
            
            // Récupérer le game_id généré
            const gameId = window.gameManager.gameId;
            
            // Après création, mettre à jour le match avec le game_id
            updateMatchGameId(match.id, gameId);
            
            // Rediriger vers la page du jeu
            window.location.hash = 'play/' + gameId;
        } else {
            // Un game_id existe déjà, ce joueur doit rejoindre la partie
            window.gameManager.joinGame(match.game_id);
            
            // Rediriger vers la page du jeu
            window.location.hash = 'play/' + match.game_id;
        }
    });

    forfeitButton.addEventListener('click', async function() {
        const tournamentId = getTournamentId();
        
        const response = await fetch(`api/tournaments/${tournamentId}/forfeit/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            }
        });

        if (response.ok) {
            window.location.hash = '#game';
        } else {
            const errorData = await response.json();
            alert('Failed to forfeit tournament: ' + (errorData.error || 'Unknown error'));
        }
    });
}

// Fonction pour récupérer le match actif pour le joueur actuel
function getCurrentMatch() {
    // Récupérer le match actif dans le DOM
    const activeMatch = document.querySelector('.tournament_match-active');
    if (!activeMatch) {
        alert('No active match found');
        return null;
    }
    
    // Récupérer les données du match depuis les attributs data-*
    return {
        id: activeMatch.dataset.matchId,
        game_id: activeMatch.dataset.gameId || null
    };
}

// Fonction pour mettre à jour le game_id dans le match
function updateMatchGameId(matchId, gameId) {
    fetch(`/api/tournaments/match/${matchId}/update-game-id/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCookie('csrftoken')
        },
        body: JSON.stringify({ game_id: gameId })
    });
}

function getRoundName(roundSize) {
    switch (roundSize) {
        case 2: return 'Finals';
        case 4: return 'Semi-finals';
        case 8: return 'Quarter-finals';
        default: return `Round of ${roundSize}`;
    }
}