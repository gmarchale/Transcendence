function loadGame(){
	console.log("Loading game.")
}

function initGame(){
	console.log("Initializing game.")
    initTournamentButtons()
    setTimeout(initializeGame, 300);
}

let game = null;
let gameInitialized = false;

async function initializeGame() {
    // if (!gameInitialized) {
    //     if (document.readyState === 'complete') {
    //         console.log('DOM is ready, initializing game after auth');
    //         setTimeout(initializeGame, 0);
    //     } else {
    //         console.log('Waiting for DOM to be ready...');
    //         window.addEventListener('load', () => {
    //             console.log('Window loaded, initializing game...');
    //             setTimeout(initializeGame, 0);
    //         });
    //     }
    // } else if (gameInitialized) {
    //     console.log('Game already initialized, skipping...');
    //     return;
    // }
    
    console.log('Loading game script...');
    try {
        // await loadGameScript();
        console.log('[GAME] Creating game instance...');
        game = new PongGame();
        gameInitialized = true;
        console.log('[GAME] Game instance created successfully');
    } catch (error) {
        console.error('[GAME] Failed to initialize game:', error);
        gameInitialized = false;
    }
}
