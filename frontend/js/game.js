
let game = null;
let gameInitialized = false;

function loadGame(){
	console.log("Loading game.")
    if (gameInitialized == false)
        initializeGame();
}

function initGame(){
	console.log("Initializing game.")
}

async function initializeGame() {
    console.log('Loading game script...');
    try {
        // await loadGameScript();
        console.log('[GAME] Creating game instance...');
        gameInitialized = true;
        game = new PongGame();
        console.log('[GAME] Game instance created successfully');
    } catch (error) {
        console.error('[GAME] Failed to initialize game:', error);
        gameInitialized = false;
    }
}
