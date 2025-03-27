console.log('=== GAME.JS LOADED ===');

class PongGame {
    constructor() {
        // Bind methods to this instance first
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.animate = this.animate.bind(this);
        this.draw = this.draw.bind(this);
        this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);

        // Initialize properties
        this.player1ProfileLoaded = false;
        this.player2ProfileLoaded = false;

        this.chatInterface = false;
        this.connected = false;
        this.connectionAttempt = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.heartbeatInterval = null;
        this.gameSocket = null;
        this.uiSocket = null;
        this.currentUser = null;
        this.gameId = null;
        this.gameState = null;
        this.animationFrameId = null;
        this.gameStarted = false;
        this.isCreatingGame = false;
        this.canvas = null;
        this.ctx = null;
        this.keyState = { w: false, s: false };

        this.paddleSpeed = 25; // pixels to move per keypress

        // Add a timestamp to limit logging frequency
        this.lastLogTime = 0;
        this.lastPaddleUpdate = 0;
        this.paddleUpdateInterval = 16; // Update paddle every 16ms (approximately 60fps)

        // Initialize ready button handlers
        this.player1Ready = document.getElementById('player1_ready');
        this.player2Ready = document.getElementById('player2_ready');
        this.player1Name = document.getElementById('player1_name');
        this.player2Name = document.getElementById('player2_name');
        this.player2Name.textContent = getTranslation("play_waiting_player");


        this.player1Avatar = document.getElementById('player1_avatar');
        this.player2Avatar = document.getElementById('player2_avatar');

        if (this.player1Ready) {
            this.player1Ready.addEventListener('click', () => this.handleReadyClick());
        }
        if (this.player2Ready) {
            this.player2Ready.addEventListener('click', () => this.handleReadyClick());
        }

        // Start initialization
        this.init().catch(error => {
            console.error('Failed to initialize game:', error);
        });
    }

    async init() {
        console.log('Initializing game...');
        try {
            const valid = await this.checkSession();
            if (!valid) {
                return;
            }

            // Initialize in correct order
            this.initializeElements();
            this.initializeGameState();
            this.initializeEventListeners();
            this.setupWebSocket();

            console.log('Game initialization complete');
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    }

    async checkSession() {
        try {
            console.log('Checking session...');
            const response = await fetch('/api/users/profile/', {
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': this.getCookie('csrftoken')
                }
            });

            console.log('Session check response:', response.status);
            if (!response.ok) {
                console.warn('Session check failed:', response.status);
                const text = await response.text();
                console.warn('Response text:', text);
                return false;
            }

            const userData = await response.json();
            console.log('Session valid for user:', userData);

            // Store the current user's info
            this.currentUser = userData;

            // Update UI with user info
            const usernameElement = document.getElementById('header_username');
            const userAvatarElement = document.getElementById('header_userAvatar');

            console.log('Username element:', usernameElement);
            console.log('Avatar element:', userAvatarElement);

            if (usernameElement) {
                // usernameElement.textContent = userData.username;
                console.log('Username updated to:', userData.username);
            } else {
                console.error('Username element not found');
            }

            if (userAvatarElement) {
                // userAvatarElement.textContent = userData.username[0].toUpperCase();
                console.log('Avatar updated to:', userData.username[0].toUpperCase());
            } else {
                console.error('Avatar element not found');
            }

            return true;
        } catch (error) {
            console.error('Error checking session:', error);
            console.error('Error stack:', error.stack);
            return false;
        }
    }

    getCookie(name) {
        let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    initializeElements() {
        console.log('Initializing game elements...');

        try {
            // Get DOM elements
            this.canvas = document.getElementById('game_Canvas');
            console.log('Canvas element:', this.canvas);

            this.canvasContainer = document.getElementById('game_CanvasContainer');
            console.log('Canvas container:', this.canvasContainer);
            this.createGameBtn = document.getElementById('createGameBtn');


            this.joinGameBtn = document.getElementById('joinGameBtn');
            console.log('Game buttons:', { create: this.createGameBtn, join: this.joinGameBtn });

            this.gameStatus = document.getElementById('game_Status');
            console.log('Game status:', this.gameStatus);

            this.player1Score = document.getElementById('game_player1Score');
            console.log('Player 1 score:', this.player1Score);

            this.player2Score = document.getElementById('game_player2Score');
            console.log('Player 2 score:', this.player2Score);

            // Initialize canvas if it exists
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                if (!this.ctx) {
                    console.error('Could not get canvas context');
                } else {
                    // Set initial canvas size
                    this.canvas.width = 800;
                    this.canvas.height = 600;
                    // Clear the canvas with black background
                    this.ctx.fillStyle = '#000000';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                    console.log('Canvas initialized successfully');
                }
            } else {
                console.error('Canvas element not found');
            }

            // Add window resize handler
            window.addEventListener('resize', () => {
                if (this.canvas) {
                    // Maintain aspect ratio while fitting the container
                    const container = this.canvas.parentElement;
                    const containerWidth = container.clientWidth;
                    const containerHeight = container.clientHeight;
                    const aspectRatio = 800 / 600;

                    let width = containerWidth;
                    let height = width / aspectRatio;

                    if (height > containerHeight) {
                        height = containerHeight;
                        width = height * aspectRatio;
                    }

                    this.canvas.style.width = `${width}px`;
                    this.canvas.style.height = `${height}px`;
                }
            });

            console.log('Game elements initialization completed');
        } catch (error) {
            console.error('Error initializing game elements:', error);
            console.error('Error stack:', error.stack);
        }
    }

    initializeGameState() {
        // Game state
        this.gameStarted = false;
        this.gameId = null;
        this.playerId = null;
        this.connected = false;
        this.gameSocket = null;
        this.score = { left: 0, right: 0 };

        // Initial game objects
        this.ball = { x: 400, y: 300, dx: 5, dy: 5, radius: 10 };
        this.paddles = {
            left: { x: 50, y: 250, width: 20, height: 100 },
            right: { x: 730, y: 250, width: 20, height: 100 }
        };

        // WebSocket connection settings
        this.maxReconnectAttempts = 10; // Increased from default
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        this.heartbeatInterval = null;

        // Hide canvas initially
        if (this.canvasContainer) {
            this.canvasContainer.style.display = 'none';
        }

        console.log('Game state initialized');
    }

    initializeEventListeners() {
        // Bind event listeners
        this.createGameBtn.addEventListener('click', () => this.startGame());


        document.getElementById('chat_dropdownMenuButton_PlayPong').addEventListener('click', () => {
            if (chat_currentlyWith != null) {
                this.chatInterface = true;
                this.startGame();
            }
        });

        this.joinGameBtn.addEventListener('click', () => this.showJoinGameForm());
        window.addEventListener('keydown', this.handleKeyPress);
        window.addEventListener('keyup', this.handleKeyUp);
    }

    handleKeyUp(event) {
        if(getPage() != "game")
            return;
        // Handle key release events if needed
        // This can be used to stop paddle movement when keys are released
        if (this.gameStarted && this.connected) {
            // Add your key up handling logic here if needed
            console.log('Key released:', event.key);
        }
    }

    showCanvas() {
        try {
            console.log('Attempting to show canvas container...');
            const container = document.getElementById('game_CanvasContainer');

            if (!container) {
                throw new Error('Canvas container element not found');
            }

            // Update the instance variable
            this.canvasContainer = container;
            this.canvasContainer.style.display = 'block';

            console.log('Canvas container shown successfully');

            // Force a redraw
            if (this.ctx) {
                this.draw();
            }
        } catch (error) {
            console.error('Error showing canvas:', error);
            throw error; // Re-throw to handle it in the caller
        }
    }

    hideCanvas() {
        try {
            console.log('Attempting to hide canvas container...');
            const container = document.getElementById('game_CanvasContainer');

            if (!container) {
                throw new Error('Canvas container element not found');
            }

            // Update the instance variable
            this.canvasContainer = container;
            this.canvasContainer.style.display = 'none';

            console.log('Canvas container hidden successfully');
        } catch (error) {
            console.error('Error hiding canvas:', error);
            throw error; // Re-throw to handle it in the caller
        }
    }

    setupWebSocket() {
        if (this.connectionAttempt) {
            console.log('Connection attempt already in progress');
            return;
        }

        this.connectionAttempt = true;
        const wsScheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsBase = wsScheme + window.location.host;

        // Setup UI WebSocket for general interactions
        const wsUrl = `${wsBase}/ws/game/`;
        console.log('Connecting to UI WebSocket:', wsUrl);

        this.uiSocket = new WebSocket(wsUrl);

        this.uiSocket.onopen = () => {
            console.log('UI WebSocket connection established');
            this.connected = true;
            this.connectionAttempt = false;
            this.reconnectAttempts = 0;
        };

        this.uiSocket.onclose = () => {
            console.log('UI WebSocket connection closed');
            this.handleWebSocketClose();
        };

        this.uiSocket.onerror = (error) => {
            console.error('UI WebSocket error:', error);
            this.connectionAttempt = false;
        };

        this.uiSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Received UI WebSocket message:', data);
            this.handleWebSocketMessage(data);
        };
    }

    async startGame() {
        if (this.isCreatingGame) return;
        this.isCreatingGame = true;

        try {
            if (!this.uiSocket || this.uiSocket.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket connection not ready');
            }

            console.log('Creating game via HTTP POST...');
            const response = await fetch('/api/game/create/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCookie('csrftoken'),
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            });

            const text = await response.text();
            console.log('Server response:', text);

            if (!response.ok) {
                throw new Error(`Failed to create game: ${response.status} - ${text}`);
            }

            const data = JSON.parse(text);
            console.log('Game created successfully:', data);
            this.gameId = data.id;
            console.log(this.gameId)
            console.log(this.gameId)

            // No need to send any WebSocket message
            // Backend will automatically:
            // 1. Add us to the game channel
            // 2. Send game_created message through existing WebSocket
            // 3. handleWebSocketMessage will then update URL hash

        } catch (error) {
            console.error('Error creating game:', error);
            if (this.gameStatus) {
                this.gameStatus.textContent = `Error: ${error.message}`;
            }
        } finally {
            this.isCreatingGame = false;
        }
    }

    handleWebSocketMessage(message) {
        try {
            console.log('Received WebSocket message:', message);

            switch (message.type) {
                case 'game_created':
                    console.log('Game created:', message);
                    this.gameId = parseInt(message.game_id, 10);
                    this.playerId = parseInt(message.player1_id, 10);  // Set player ID from player1 info
                    this.gameState = message.game_state;  // Make sure we store the game state
                    this.isCreatingGame = false;

                    // Reset both ready buttons to Not Ready
                    if (this.player1Ready) {
                        this.player1Ready.textContent = getTranslation("global_notready");
                        this.player1Ready.classList.remove('ready');
                        this.player1Ready.disabled = !this.playerId === parseInt(message.player1_id, 10);
                    }
                    if (this.player2Ready) {
                        this.player2Ready.textContent = getTranslation("global_notready");
                        this.player2Ready.classList.remove('ready');
                        this.player2Ready.disabled = true;  // Player 2 hasn't joined yet
                    }

                    // Initialize ready button states with the new game state
                    this.updateReadyState(message.game_state);

                    // Only join game group and set URL if we have a valid game ID
                    if (!isNaN(this.gameId)) {
                        // Join the game's WebSocket group
                        this.uiSocket.send(JSON.stringify({
                            type: 'rejoin_game_group',
                            game_id: this.gameId
                        }));

                        console.log('Setting URL hash to:', `play/${this.gameId}`);
                        if (this.chatInterface)
                        {
                            console.log("CHAAAAAAAT INTERFACE");
                            chat_sendMessageValue(this.gameId);
                            this.chatInterface = false;
                        }
                        window.location.hash = `play/${this.gameId}`;
                    } else {
                        console.error('Invalid game ID received:', message.game_id);
                    }
                    break;

                case 'game_joined':
                    console.log('Game joined:', message);
                    // Parse game_id as integer
                    this.gameId = parseInt(message.game_id, 10);
                    // Check if we're player 1 or player 2
                    if (this.playerId === parseInt(message.player1_id, 10)) {
                        // We're already player 1, keep our ID
                        console.log('We are player 1');
                    } else {
                        // We're player 2 or we don't have an ID yet
                        this.playerId = parseInt(message.player2_id, 10);
                        console.log('We are player 2 with ID:', this.playerId);
                    }

                    // Initialize ready button states with the new game state
                    if (message.game_state) {
                        this.gameState = message.game_state;
                        this.updateReadyState(message.game_state);
                    }

                    // Hide canvas until game starts
                    if (this.canvasContainer) {
                        this.canvasContainer.style.display = 'none';
                    }

                    // Join the game's WebSocket group
                    this.uiSocket.send(JSON.stringify({
                        type: 'rejoin_game_group',
                        game_id: this.gameId
                    }));

                    window.location.hash = `play/${this.gameId}`;
                    break;

                case 'connection_established':
                    console.log('Connection established:', {
                        playerId: message.user.id,
                        username: message.user.username
                    });
                    this.connected = true;
                    this.playerId = parseInt(message.user.id, 10);  // Ensure player ID is integer

                    // If loading from URL hash, rejoin game group
                    if (window.location.hash.startsWith('#play/')) {
                        const gameId = window.location.hash.split('/')[1];
                        this.uiSocket.send(JSON.stringify({
                            type: 'rejoin_game_group',
                            game_id: gameId
                        }));
                    }
                    break;
                case 'game_state_update':
                    this.gameState = message.game_state;

                    // Update ready button states
                    this.updateReadyState(message.game_state);

                    // Start game and show canvas only when both players are ready and game is playing
                    if (message.game_state.status === 'playing') {
                        if (!this.gameStarted) {
                            this.gameStarted = true;
                            if (this.canvasContainer) {
                                this.canvasContainer.style.display = 'block';
                            }
                            if (!this.animationFrameId) {
                                this.animationFrameId = requestAnimationFrame(() => this.animate());
                            }
                        }
                    } else {
                        // Hide canvas if game is not playing
                        if (this.canvasContainer) {
                            this.canvasContainer.style.display = 'none';
                        }
                    }
                    break;

                case 'game_end':
                    console.log('Received game_end event:', message);
                    this.gameStarted = false;
                    if (this.animationFrameId) {
                        cancelAnimationFrame(this.animationFrameId);
                        this.animationFrameId = null;
                    }

                    // Show game over message with winner and duration
                    // if (this.gameStatus) {
                    //     const winner = message.winner === 'player1' ? 'Player 1' : 'Player 2';
                    //     const duration = message.duration_formatted;
                    //     const score = `${message.final_score.player1} - ${message.final_score.player2}`;
                    //     this.gameStatus.textContent = `Game Over! ${winner} wins! (${score}) Duration: ${duration}`;
                    //     console.log('Updated game status with:', this.gameStatus.textContent);
                    // }

                    // Disable game controls
                    if (this.createGameBtn) {
                        this.createGameBtn.disabled = false;
                        console.log('Re-enabled create game button');
                    }
                    if (this.joinGameBtn) {
                        this.joinGameBtn.disabled = false;
                        console.log('Re-enabled join game button');
                    }
                    this.handleGameEnd(message);
                    break;

                case 'game_over':
                    console.log('Received deprecated game_over event');
                    break;

                case 'error':
                    if (this.gameStatus) {
                        this.gameStatus.textContent = `Error: ${message.message}`;
                    }
                    break;

                case 'player_ready':
                    console.log('Player ready:', message);
                    this.updateReadyState(message.game_state);
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    joinGame(gameId) {
        try {
            // Parse gameId as integer
            this.gameId = parseInt(gameId, 10);
            // Send join_game message through UI socket
            this.uiSocket.send(JSON.stringify({
                'type': 'join_game',
                'game_id': this.gameId
            }));
            console.log('Sent join_game message');

        } catch (error) {
            console.error('Error joining game:', error);
        }
    }

    handleWebSocketClose() {
        this.connected = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
                this.reconnectAttempts++;
                this.setupWebSocket();
            }, this.reconnectDelay);
        }
    }

    handleKeyPress(event) {
        console.log('handleKeyPress called');
        const hash = window.location.hash;
        const match = hash.match(/#play\/([^/]+)/);
        if (!match) {
            console.log("Not on play page with game ID");
            return;
        }

        if (!this.uiSocket || this.uiSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot handle key press:', {
                hasSocket: !!this.uiSocket,
                socketState: this.uiSocket?.readyState,
                gameId: this.gameId,
                gameStarted: this.gameStarted
            });
            return;
        }

        const key = event.key.toLowerCase();
        if (key === 'w' || key === 's') {
            event.preventDefault();

            // Get current paddle position
            const paddleKey = this.playerId === this.gameState.player1_id ? 'player1' : 'player2';
            const paddle = this.gameState.paddles[paddleKey];
            const canvasHeight = this.gameState.canvas.height;

            // Move paddle based on key
            let direction = null;
            if (key === 'w' && paddle.y > 0) {
                direction = 'up';
            } else if (key === 's' && paddle.y < canvasHeight - paddle.height) {
                direction = 'down';
            }

            if (direction) {
                console.log('Sending paddle_move:', { direction, gameId: this.gameId });
                this.uiSocket.send(JSON.stringify({
                    type: 'paddle_move',
                    direction: direction,
                    game_id: this.gameId
                }));
            }
        }
    }

    updatePaddlePosition() {
        //console.log('updatePaddlePosition called');
        if (!this.uiSocket || this.uiSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot update paddle: socket:', !!this.uiSocket, 'state:', this.uiSocket?.readyState, 'gameId:', this.gameId, 'started:', this.gameStarted);
            return;
        }

        const now = performance.now();
        if (now - this.lastPaddleUpdate < this.paddleUpdateInterval) {
            return;
        }

        // Get current paddle position
        const paddleKey = this.playerId === this.gameState.player1_id ? 'player1' : 'player2';
        const paddle = this.gameState.paddles[paddleKey];
        const canvasHeight = this.gameState.canvas.height;

        let direction = null;
        if (this.keyState.w && paddle.y > 0) {
            direction = 'up';
        } else if (this.keyState.s && paddle.y < canvasHeight - paddle.height) {
            direction = 'down';
        }

        if (direction) {
            this.uiSocket.send(JSON.stringify({
                type: 'paddle_move',
                direction: direction,
                game_id: this.gameId
            }));
            this.lastPaddleUpdate = now;
        }
    }

    animate() {
        //console.log('animate called');
        if (!this.gameStarted || !this.gameState) {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            return;
        }

        // Update paddle position based on key state
        this.updatePaddlePosition();

        // Draw the current game state
        this.draw();

        // Continue the animation loop
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }


    draw() {
        //console.log('draw called');
        try {
            if (!this.ctx || !this.gameState) {
                console.log('Cannot draw, missing context or game state:', {
                    hasContext: !!this.ctx,
                    hasGameState: !!this.gameState
                });
                return;
            }

            //console.log('Drawing game state:', this.gameState);

            const { canvas, ball, paddles } = this.gameState;

            // Ensure canvas dimensions are set
            if (!this.canvas.width || !this.canvas.height) {
                this.canvas.width = canvas.width;
                this.canvas.height = canvas.height;
            }

            // Clear canvas
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw center line
            this.ctx.setLineDash([5, 15]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.canvas.width / 2, 0);
            this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            // Draw ball
            if (ball) {
                this.ctx.beginPath();
                this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = '#00ff88';
                this.ctx.shadowColor = '#00ff88';
                this.ctx.shadowBlur = 15;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }

            // Draw paddles
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowColor = '#ffffff';
            this.ctx.shadowBlur = 10;

            // Draw player1 paddle
            if (paddles.player1) {
                this.ctx.fillRect(
                    paddles.player1.x,
                    paddles.player1.y,
                    paddles.player1.width,
                    paddles.player1.height
                );
            }

            // Draw player2 paddle
            if (paddles.player2) {
                this.ctx.fillRect(
                    paddles.player2.x,
                    paddles.player2.y,
                    paddles.player2.width,
                    paddles.player2.height
                );
            }

            // Reset shadow blur after drawing paddles
            this.ctx.shadowBlur = 0;

            // Draw scores
            if (this.gameState.score) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = '48px Arial';
                this.ctx.textAlign = 'center';

                // Player 1 score on the left
                this.ctx.fillText(
                    this.gameState.score.player1,
                    this.canvas.width * 0.25,
                    60
                );

                // Player 2 score on the right
                this.ctx.fillText(
                    this.gameState.score.player2,
                    this.canvas.width * 0.75,
                    60
                );
            }
        } catch (error) {
            console.error('Error in draw method:', error);
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }

        // Add a timestamp to limit logging frequency
        const logInterval = 2000; // Log every 500ms
        const currentTime = Date.now();
        if (currentTime - this.lastLogTime > logInterval) {
            // console.log('Paddle positions:', this.gameState.paddles);
            //console.log('Key state:', this.keyState);
            //console.log('Game state:', this.gameState);
            this.lastLogTime = currentTime;
        }
    }


    updateGameState(state) {
        if (!state) return;

        try {
            // Update game status and player IDs
            if (state.status) {
                this.gameStatus = state.status;
            }
            if (state.player1_id) {
                this.player1Id = state.player1_id;
            }
            if (state.player2_id) {
                this.player2Id = state.player2_id;
            }


            // Update ball position
            if (state.ball) {
                this.ball = state.ball;
            }


            // Update paddle positions
            if (state.paddles) {
                // Initialize paddles if they don't exist
                if (!this.paddles) {
                    this.paddles = {
                        left: { x: 50, y: 250, width: 20, height: 100 },
                        right: { x: 730, y: 250, width: 20, height: 100 }
                    };
                }

                // Update left paddle
                if (state.paddles.player1) {
                    this.paddles.left.y = state.paddles.player1.y;
                    console.log('Updated left paddle position:', this.paddles.left.y);
                }

                // Update right paddle
                if (state.paddles.player2) {
                    this.paddles.right.y = state.paddles.player2.y;
                    console.log('Updated right paddle position:', this.paddles.right.y);
                }
            }

            // Update score
            if (state.score) {
                if (this.player1Score) this.player1Score.textContent = state.score.player1;
                if (this.player2Score) this.player2Score.textContent = state.score.player2;
            }
        } catch (error) {
            console.error('Error updating game state:', error);
        }
    }

    handleGameEnd(data) {
        const winner = data.winner;
        const duration = data.duration;

        // Stop the game loop
        this.gameStarted = false;

        // Create game end overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';

        // Create result text
        const resultText = document.createElement('h1');
        resultText.style.color = '#fff';
        resultText.style.marginBottom = '20px';
        resultText.style.fontSize = '2.5em';
        resultText.innerText = `${winner === 'player1' ? 'Player 1' : 'Player 2'} Wins!`;

        // Create score text
        const scoreText = document.createElement('h2');
        scoreText.style.color = '#fff';
        scoreText.style.marginBottom = '20px';
        scoreText.style.fontSize = '1.8em';
        scoreText.innerText = `Final Score: ${data.final_score.player1} - ${data.final_score.player2}`;

        // Create duration text
        const durationText = document.createElement('h3');
        durationText.style.color = '#fff';
        durationText.style.marginBottom = '30px';
        durationText.style.fontSize = '1.5em';
        durationText.innerText = `Game Duration: ${duration}`;

        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '20px';

        // Create button based on where the game was launched from
        const homeButton = document.createElement('button');
        
        // Simple way to check if we came from a tournament - check the referrer
        const referrer = document.referrer;
        const currentHash = window.location.hash;
        const fromTournament = this.fromTournament || localStorage.getItem('fromTournament') === 'true';
        
        if (fromTournament || currentHash.includes('tournament')) {
            // Tournament game button
            homeButton.innerText = 'Go to Tournament';
            homeButton.style.backgroundColor = '#2196F3'; // Blue for tournament
            homeButton.onclick = () => {
                document.body.removeChild(overlay);
                // Get tournament ID from localStorage if available
                const tournamentId = localStorage.getItem('currentTournamentId');
                
                // Clear localStorage values
                localStorage.removeItem('fromTournament');
                localStorage.removeItem('currentTournamentId');
                if (this.playerId == data.winner_id) { // Si le joueur a gagne
                    if (tournamentId) {
                        window.location.href = `#tournament/${tournamentId}`;
                    } else {
                        // Fallback to tournaments list
                        window.location.href = '#tournaments';
                    }
                    
                }
                else // si le joueur a perdu
                {
                    window.location.href = `#game`;
                    // need to fix boutons when getting redirected (just reload page?)
                }
            };
        } else {
            // Regular game button
            homeButton.innerText = 'Go to Lobby';
            homeButton.style.backgroundColor = '#4CAF50'; // Green for regular games
            homeButton.onclick = () => {
                document.body.removeChild(overlay);
                
                // Clear localStorage values (just to be safe)
                localStorage.removeItem('fromTournament');
                localStorage.removeItem('currentTournamentId');
                
                window.location.href = '#game';
            };
        }
        
        homeButton.style.padding = '15px 30px';
        homeButton.style.fontSize = '1.2em';
        homeButton.style.cursor = 'pointer';
        homeButton.style.color = 'white';
        homeButton.style.border = 'none';
        homeButton.style.borderRadius = '5px';

        // Add buttons to container
        buttonsContainer.appendChild(homeButton);

        // Add elements to overlay
        overlay.appendChild(resultText);
        overlay.appendChild(scoreText);
        overlay.appendChild(durationText);
        overlay.appendChild(buttonsContainer);

        // Add overlay to body
        document.body.appendChild(overlay);

        // Clean up WebSocket connection
        // if (this.uiSocket) {
        //     this.uiSocket.onclose = null; // Remove onclose handler to prevent reconnection
        //     this.uiSocket.close();
        //     this.uiSocket = null;
        // }
    }

    handleReadyClick() {
        console.log('Player clicked ready button');
        if (!this.gameId) {
            console.error('No game ID available');
            return;
        }

        if (!this.playerId) {
            console.error('No player ID available');
            return;
        }

        console.log('Sending player_ready message for game:', this.gameId, 'player:', this.playerId);
        this.uiSocket.send(JSON.stringify({
            'type': 'player_ready',
            'game_id': parseInt(this.gameId, 10)
        }));
    }

    updateReadyState(gameState) {
        console.log('updateReadyState called with playerId:', this.playerId);
        if (!gameState || !gameState.players) return;
        console.log('Game state:', gameState);

        const players = gameState.players;
        const isPlayer1 = this.playerId === parseInt(players.player1?.id, 10);
        const isPlayer2 = this.playerId === parseInt(players.player2?.id, 10);


        // Update player 1 ready button and name
        console.log(players.player1.id)
        console.log(players.player1.username[0])

        if (players.player1 && this.player1ProfileLoaded == false)
        {
            this.player1ProfileLoaded = true;
            fetch("/api/users/get_avatar/" + players.player1.id + "/", {
                method: "GET",headers: { 'X-CSRFToken': getCookie('csrftoken') }
            })
            .then(response => response.json())
            .then(data2 => {
                if (data2.avatar != null)
                {
                    let imgElement = document.getElementById("player1_avatar");
                    let placeholder = document.createElement("div");
                    placeholder.className = "profile_avatar";
                    placeholder.style.backgroundImage = `url('${data2.avatar}')`;
                    placeholder.id = "profile_avatar";
                    imgElement.parentNode.replaceChild(placeholder, imgElement);
                }
                else {
                    let imgElement = document.getElementById("player1_avatar");
                    let placeholder = document.createElement("div");
                    placeholder.className = "profile_placeholder";
                    placeholder.textContent = players.player1.username[0];
                    placeholder.id = "player1_avatar";
                    imgElement.parentNode.replaceChild(placeholder, imgElement);
                }

            })
            .catch(error => console.error("Error while getting avatar:", error));
        }
        else if (this.player1ProfileLoaded == false)
        {
            let imgElement = document.getElementById("player2_avatar");
            let placeholder = document.createElement("div");
            placeholder.className = "profile_placeholder";
            placeholder.textContent = "?";
            placeholder.id = "player2_avatar";
            imgElement.parentNode.replaceChild(placeholder, imgElement);
        }

        if (players.player2 && this.player2ProfileLoaded == false)
        {
            this.player2ProfileLoaded = true;
                fetch("/api/users/get_avatar/" + players.player2.id + "/", {
                    method: "GET",headers: { 'X-CSRFToken': getCookie('csrftoken') }
                })
                .then(response => response.json())
                .then(data2 => {
                    if (data2.avatar != null)
                    {
                        let imgElement = document.getElementById("player2_avatar");
                        let placeholder = document.createElement("div");
                        placeholder.className = "profile_avatar";
                        placeholder.style.backgroundImage = `url('${data2.avatar}')`;
                        placeholder.id = "profile_avatar";
                        imgElement.parentNode.replaceChild(placeholder, imgElement);
                    }
                    else {
                        let imgElement = document.getElementById("player2_avatar");
                        let placeholder = document.createElement("div");
                        placeholder.className = "profile_placeholder";
                        placeholder.textContent = players.player2.username[0];
                        placeholder.id = "player2_avatar";
                        imgElement.parentNode.replaceChild(placeholder, imgElement);
                    }

                })
                .catch(error => console.error("Error while getting avatar:", error));
        }
        else if (this.player2ProfileLoaded == false)
        {
            let imgElement = document.getElementById("player2_avatar");
            let placeholder = document.createElement("div");
            placeholder.className = "profile_placeholder";
            placeholder.textContent = "?";
            placeholder.id = "player2_avatar";
            imgElement.parentNode.replaceChild(placeholder, imgElement);
        }

        if (players.player1 && this.player1Ready) {
            // Update name
            if (this.player1Name) {
                this.player1Name.textContent = players.player1.username;
            }

            console.log('Updating player 1 ready state:', players.player1.is_ready);
            this.player1Ready.textContent = getTranslation("global_notready");  // Always start as Not Ready
            this.player1Ready.classList.remove('ready');  // Remove ready class by default
            if (players.player1.is_ready) {  // Only update if explicitly ready
                this.player1Ready.textContent = getTranslation("global_ready");;
                this.player1Ready.classList.add('ready');
            }
            this.player1Ready.disabled = !isPlayer1 || players.player1.is_ready;
        }

        // Update player 2 ready button and name
        if (players.player2 && this.player2Ready) {
            // Update name
            if (this.player2Name) {
                this.player2Name.textContent = players.player2.username;
            }

            console.log('Updating player 2 ready state:', players.player2.is_ready);
            this.player2Ready.textContent = getTranslation("global_notready");  // Always start as Not Ready
            this.player2Ready.classList.remove('ready');  // Remove ready class by default
            if (players.player2.is_ready) {  // Only update if explicitly ready
                this.player2Ready.textContent = getTranslation("global_ready");;
                this.player2Ready.classList.add('ready');
            }
            this.player2Ready.disabled = !isPlayer2 || players.player2.is_ready;
        }
    }

    showJoinGameForm() {
        const modal = document.getElementById('joinGameModal');
        const gameIdInput = document.getElementById('gameIdInput');
        const confirmButton = document.getElementById('confirmJoinGame');
        const cancelButton = document.getElementById('cancelJoinGame');
        const resultSection = document.getElementById('joinGameResultSection');
        const inputSection = document.getElementById('joinGameInputSection');
        const resultMessage = document.getElementById('joinGameResultMessage');
        const closeResultButton = document.getElementById('closeJoinGameResult');

        resultSection.style.display = 'none';
        inputSection.style.display = 'block';
        gameIdInput.value = '';

        modal.style.display = 'flex';

        setTimeout(() => gameIdInput.focus(), 100);

        const handleJoin = () => {
            const gameId = gameIdInput.value.trim();
            if (gameId) {
                console.log('Joining game:', gameId);
                this.joinGame(gameId);
                closeModal();
            } else {
                resultSection.style.display = 'block';
                inputSection.style.display = 'none';
                resultMessage.textContent = 'Please enter a valid Game ID';
                resultMessage.className = 'game_error-message';
            }
        };

        const closeModal = () => {
            modal.style.display = 'none';
            confirmButton.removeEventListener('click', handleJoin);
            cancelButton.removeEventListener('click', closeModal);
            closeResultButton.removeEventListener('click', closeModal);
            gameIdInput.removeEventListener('keypress', handleEnterKey);
        };

        const handleEnterKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleJoin();
            }
        };

        confirmButton.addEventListener('click', handleJoin);
        cancelButton.addEventListener('click', closeModal);
        closeResultButton.addEventListener('click', closeModal);
        gameIdInput.addEventListener('keypress', handleEnterKey);
    }
};
