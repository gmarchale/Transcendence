function loadGame(){
	console.log("Loading game.")
}

function initGame(){
	console.log("Initializing game.")
    initTournament()
}

let game = null;
let gameInitialized = false;

function loadGameScript() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/static/js/game.js';
        script.onload = () => {
            console.log('Game script loaded successfully');
            resolve();
        };
        script.onerror = () => {
            console.error('Failed to load game script');
            reject(new Error('Failed to load game script'));
        };
        document.body.appendChild(script);
    });
}

async function initializeGame() {
    if (!gameInitialized) {
        if (document.readyState === 'complete') {
            console.log('DOM is ready, initializing game after auth');
            setTimeout(initializeGame, 0);
        } else {
            console.log('Waiting for DOM to be ready...');
            window.addEventListener('load', () => {
                console.log('Window loaded, initializing game...');
                setTimeout(initializeGame, 0);
            });
        }
    } else if (gameInitialized) {
        console.log('Game already initialized, skipping...');
        return;
    }
    
    console.log('Loading game script...');
    try {
        await loadGameScript();
        console.log('Creating game instance...');
        game = new PongGame();
        gameInitialized = true;
        console.log('Game instance created successfully');
    } catch (error) {
        console.error('Failed to initialize game:', error);
        gameInitialized = false;
    }
}
