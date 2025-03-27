function initTournamentButtons() {
    initTournamentList();

    const modal = document.getElementById('tournamentModal');
    const nameInput = document.getElementById('tournamentNameInput');
    const inputSection = document.getElementById('inputSection');
    const resultSection = document.getElementById('resultSection');
    const modalTitle = document.getElementById('modalTitle');
    const chips = document.querySelectorAll('.game_chip');
    let selectedPlayers = 2;

    //montrer la valeur par defaut
    document.querySelector('[data-players="2"]').classList.add('selected');
    
    // update l'affichage de la chip selection
    chips.forEach(chip => {
        chip.addEventListener('click', function() {
            chips.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            selectedPlayers = parseInt(this.getAttribute('data-players')); // Get the selected player count from the data attribute
        });
    });
    
    document.getElementById('game_createTournamentBtn').addEventListener('click', function() {
        modalTitle.textContent = getTranslation("game_tournament_create"); // retablit le content si on veut recreer un tournoi
        inputSection.style.display = 'block'; // retablit le display si on veut recreer un tournoi
        resultSection.style.display = 'none'; // cache le resultat
        nameInput.value = ''; // vide le buffer
        document.getElementById('displayName').value = ''; // clear nickname
        
        modal.style.display = 'flex'; // change la fenetre de none a flex
        nameInput.focus(); // pas besoin de clicker sur l'input pour ecrire dedans
    });
    
    // cree le tournoi que si il y a une valeur
    document.getElementById('confirmTournament').addEventListener('click', function() {
        const tournamentName = nameInput.value.trim();
        const displayName = document.getElementById('displayName').value.trim();
        if (tournamentName && displayName && selectedPlayers) {
            createTournament(tournamentName, selectedPlayers);
        }
    });
    
    document.getElementById('closeResult').addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    document.getElementById('cancelTournament').addEventListener('click', function() {
        modal.style.display = 'none';
    });

    //focus sur nickname
    nameInput.addEventListener('keypress', function(e) {
        if(getPage() != "tournament")
            return;
        if (e.key === 'Enter') {
            document.getElementById('displayName').focus();
        }
    });
    
    // cache la fenetre si on click sur le background
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Enter clique sur ok
    document.getElementById('displayName').addEventListener('keypress', function(e) {
        if(getPage() != "tournament")
            return;
        if (e.key === 'Enter') {
            document.getElementById('confirmTournament').click();
        }
    });
    
    // idem mais pour le join
    const joinModal = document.getElementById('joinTournamentModal');
    const idInput = document.getElementById('tournamentIdInput');
    const joinInputSection = document.getElementById('joinInputSection');
    const joinResultSection = document.getElementById('joinResultSection');
    const joinModalTitle = document.getElementById('joinModalTitle');
    
    document.getElementById('game_joinTournamentBtn').addEventListener('click', function() {
        joinModalTitle.textContent = getTranslation("game_tournament_join");
        joinInputSection.style.display = 'block';
        joinResultSection.style.display = 'none';
        idInput.value = '';
        document.getElementById('joinDisplayName').value = '';
        
        joinModal.style.display = 'flex';
        idInput.focus();
    });
    
    document.getElementById('confirmJoinTournament').addEventListener('click', function() {
        const tournamentId = idInput.value.trim();
        const displayName = document.getElementById('joinDisplayName').value.trim();
        if (tournamentId && displayName) {
            joinTournament(tournamentId, displayName);
        }
    });
    
    document.getElementById('closeJoinResult').addEventListener('click', function() {
        joinModal.style.display = 'none';
    });
    
    document.getElementById('cancelJoinTournament').addEventListener('click', function() {
        joinModal.style.display = 'none';
    });

    joinModal.addEventListener('click', function(e) {
        if (e.target === joinModal) {
            joinModal.style.display = 'none';
        }
    });

    idInput.addEventListener('keypress', function(e) {
        if(getPage() != "tournament")
            return;
        if (e.key === 'Enter') {
            document.getElementById('joinDisplayName').focus();
        }
    });
    
    document.getElementById('joinDisplayName').addEventListener('keypress', function(e) {
        if(getPage() != "tournament")
            return;
        if (e.key === 'Enter') {
            document.getElementById('confirmJoinTournament').click();
        }
    });
}

async function createTournament(name, playersNum) {
    const modal = document.getElementById('tournamentModal');
    const inputSection = document.getElementById('inputSection');
    const resultSection = document.getElementById('resultSection');
    const resultMessage = document.getElementById('resultMessage');
    const modalTitle = document.getElementById('modalTitle');
    const displayName = document.getElementById('displayName').value.trim();

    // envoie tout a l'API
    try {
        const response = await fetch('/api/tournaments/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                name: name,
                max_players: playersNum,
                display_name: displayName
            })
        });

        // appelle les fonctions d'affichage en fonction du resultat
        const data = await response.json();
        if (response.ok) {
            modalTitle.textContent = 'Success!';
            resultMessage.className = 'game_success-message';
            resultMessage.textContent = getTranslation("game_tournament_created")+data.id+getTranslation("game_tournament_created2");
        } else {
            modalTitle.textContent = 'Error';
            resultMessage.className = 'game_error-message';
            resultMessage.textContent = getTranslation("game_tournament_creation_error") + data.error;
        }
    } catch (error) {
        modalTitle.textContent = 'Error';
        resultMessage.className = 'game_error-message';
        resultMessage.textContent = getTranslation("game_tournament_creation_error")+getTranslation("global_try_again");
        console.error('Error:', error);
    }

    inputSection.style.display = 'none'; // cache l'input
    resultSection.style.display = 'block'; // montre le resultat
}

async function joinTournament(tournamentId, displayName) {
    const modal = document.getElementById('joinTournamentModal');
    const inputSection = document.getElementById('joinInputSection');
    const resultSection = document.getElementById('joinResultSection');
    const resultMessage = document.getElementById('joinResultMessage');
    const modalTitle = document.getElementById('joinModalTitle');

    try {
        const response = await fetch(`/api/tournaments/${tournamentId}/join/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify({
                display_name: displayName
            })
        });

        const data = await response.json();
        if (response.ok) {
            modalTitle.textContent = 'Success!';
            resultMessage.className = 'game_success-message';
            resultMessage.textContent = getTranslation("game_tournament_joined");
        } else {
            modalTitle.textContent = 'Error';
            resultMessage.className = 'game_error-message';
            let errorMessage = getTranslation("game_tournament_joining_error");
            
            // erreurs specifiques
            if (data.error === 'Tournament is full') {
                errorMessage = getTranslation("game_tournament_full");
            } else if (data.error === 'This display name is already taken in this tournament') {
                errorMessage = getTranslation("game_tournament_nickname_already_taken");
            } else if (data.error === 'You are already in this tournament') {
                errorMessage = getTranslation("game_tournament_already_in");
            }
            
            resultMessage.textContent = errorMessage;
        }
    } catch (error) {
        modalTitle.textContent = 'Error';
        resultMessage.className = 'game_error-message';
        resultMessage.textContent = getTranslation("game_tournament_joining_error")+getTranslation("global_try_again");
        console.error('Error:', error);
    }

    inputSection.style.display = 'none';
    resultSection.style.display = 'block';
}

//TEST voir si ca marche
async function getPlayerTournaments() {
    try {
        const playerId = await getid(); // pas forcement opti mais ca fonctionne
        const response = await fetch(`/api/tournaments/player-tournaments/${playerId}/`);

        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        return [];
    }
}

function initTournamentList() {
    const modal = document.getElementById('tournamentListModal');
    const tournamentList = document.getElementById('tournamentList');
    
    document.getElementById('game_showTournament').addEventListener('click', async function() {
        modal.style.display = 'flex';
        const tournaments = await getPlayerTournaments();
        displayTournaments(tournaments);
    });
    
    document.getElementById('closeTournamentList').addEventListener('click', function() {
        modal.style.display = 'none';
    });
    
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
}

function displayTournaments(tournaments) {
    const tournamentList = document.getElementById('tournamentList');
    tournamentList.innerHTML = ''; // refresh l'interieur 
    
    if (tournaments.length === 0) {
        tournamentList.innerHTML = '<p class="game_error-message">'+getTranslation("game_no_tournaments_found")+'</p>';
        return;
    }

    tournaments.forEach(tournament => { // cree un bouton pour chaque tournoi
        const button = document.createElement('button');
        button.className = 'game_tournament-btn';
        button.innerHTML = `
            <span>${tournament.name}</span>
            <span class="game_tournament-status">${tournament.status}</span>
        `;
        button.addEventListener('click', () => {
            window.location.hash = `#tournament/${tournament.id}`;
            document.getElementById('tournamentListModal').style.display = 'none';
        });
        tournamentList.appendChild(button);
    });
}
