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
                    'X-CSRFToken': getCookie('csrftoken')
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
    
    
    initializeElements() {
        console.log('Initializing game elements...');
        
        try {
            // Get DOM elements
            this.canvas = document.getElementById('game_Canvas');
            console.log('Canvas element:', this.canvas);
            
            this.canvasContainer = document.getElementById('game_CanvasContainer');
            console.log('Canvas container:', this.canvasContainer);
            
            this.createGameBtn = document.getElementById('createGameBtn');
            console.log('Create game button:', this.createGameBtn);
            
            this.joinGameBtn = document.getElementById('joinGameBtn');
            console.log('Join game button:', this.joinGameBtn);
            
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
        this.uiSocket = new WebSocket(`${wsBase}/ws/game/`);
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

        this.uiSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'profile_updated' || data.type === 'ui_action_response') {
                // Handle UI-specific messages
                console.log('Received UI message:', data);
                // Update UI elements based on message type
            }
        };
    }

    async startGame() {
        if (this.isCreatingGame) return;
        this.isCreatingGame = true;

        try {
            const response = await fetch('/api/game/create/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCookie('csrftoken')
                }
            });

            if (!response.ok) throw new Error('Failed to create game');
            
            const data = await response.json();
            console.log('Create game response:', data);  // Debug log to see full response
            if (!data.id) {
                throw new Error('No game ID received from server');
            }
            this.gameId = data.id;
            
            // Setup game-specific WebSocket connection after a small delay
            // to ensure database transaction is complete
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const wsScheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            const wsBase = wsScheme + window.location.host;
            const wsUrl = `${wsBase}/ws/play/${this.gameId}/`;
            console.log('Connecting to game socket:', {
                gameId: this.gameId,
                url: wsUrl
            });  // Debug log with more context
            this.gameSocket = new WebSocket(wsUrl);
            
            this.gameSocket.onopen = () => {
                console.log('Game WebSocket connection established');
                // Send create_game message after connection
                this.gameSocket.send(JSON.stringify({
                    'type': 'create_game'
                }));
            };

            this.gameSocket.onerror = (error) => {
                console.error('Game WebSocket error:', error);
                // Try to reconnect if the connection fails
                setTimeout(() => {
                    if (!this.gameSocket || this.gameSocket.readyState === WebSocket.CLOSED) {
                        console.log('Attempting to reconnect game socket...');
                        this.gameSocket = new WebSocket(wsUrl);
                    }
                }, 1000);
            };

            this.gameSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            };

            this.gameSocket.onclose = () => {
                console.log('Game WebSocket connection closed');
                this.gameSocket = null;
            };
            
        } catch (error) {
            console.error('Error creating game:', error);
        } finally {
            this.isCreatingGame = false;
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
    
    handleWebSocketMessage(message) {
        try {
            console.log('here i am');
            console.log('Received message:', message);

            switch (message.type) {
                case 'connection_established':
                    console.log('Connection established:', {
                        playerId: message.user.id,
                        username: message.user.username
                    });
                    this.connected = true;
                    this.playerId = message.user.id;
                    break;

                case 'game_created':
                    console.log('Game created, initializing game state:', message);
                    this.gameId = message.id;  // Changed from message.game_id to message.id
                    this.playerId = message.player_id;
                    this.gameState = message.game_state;
                    this.isCreatingGame = false;
                    
                    // Update URL with the game ID from server
                    window.location.hash = `play/${message.id}`;  // Changed from message.game_id to message.id
                    
                    // Enable ready button for game creator
                    if (this.player1Ready) {
                        this.player1Ready.disabled = false;
                    }
                    this.updateReadyState(message.game_state);
                    break;

                case 'game_joined':
                    console.log('Game joined:', message);
                    this.gameState = message.game_state;
                    if (!this.playerId) {
                        this.playerId = message.player2_id;
                    }
                    
                    // Enable ready button for joined player
                    if (this.player2Ready) {
                        this.player2Ready.disabled = false;
                    }
                    this.updateReadyState(message.game_state);
                    break;

                case 'game_state_update':
                    this.gameState = message.game_state;
                    this.updateReadyState(message.game_state);
                    
                    // Start game if both players are ready
                    if (message.game_state.status === 'playing' && !this.gameStarted) {
                        this.gameStarted = true;
                        if (this.canvasContainer) {
                            this.canvasContainer.style.display = 'block';
                        }
                        if (!this.animationFrameId) {
                            this.animationFrameId = requestAnimationFrame(() => this.animate());
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
                    if (this.gameStatus) {
                        const winner = message.winner === 'player1' ? 'Player 1' : 'Player 2';
                        const duration = message.duration_formatted;
                        const score = `${message.final_score.player1} - ${message.final_score.player2}`;
                        this.gameStatus.textContent = `Game Over! ${winner} wins! (${score}) Duration: ${duration}`;
                        console.log('Updated game status with:', this.gameStatus.textContent);
                    }
                    
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
        const wsScheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsBase = wsScheme + window.location.host;
        const wsUrl = `${wsBase}/ws/play/${gameId}/`;
        console.log('Connecting to game socket:', {
            gameId: gameId,
            url: wsUrl
        });
        
        try {
            this.gameSocket = new WebSocket(wsUrl);
            this.gameId = gameId;
            
            this.gameSocket.onopen = () => {
                console.log('Game WebSocket connection established');
                this.gameSocket.send(JSON.stringify({
                    'type': 'join_game',
                    'game_id': gameId
                }));
                window.location.hash = `play/${gameId}`;
            };

            this.gameSocket.onerror = (error) => {
                console.error('Game WebSocket error:', error);
                // Try to reconnect if the connection fails
                setTimeout(() => {
                    if (!this.gameSocket || this.gameSocket.readyState === WebSocket.CLOSED) {
                        console.log('Attempting to reconnect game socket...');
                        this.gameSocket = new WebSocket(wsUrl);
                    }
                }, 1000);
                // Re-enable buttons on error
                if (this.createGameBtn) this.createGameBtn.disabled = false;
                if (this.joinGameBtn) this.joinGameBtn.disabled = false;
            };

            this.gameSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            };

            this.gameSocket.onclose = () => {
                console.log('Game WebSocket connection closed');
                this.gameSocket = null;
                // Re-enable buttons when connection closes
                if (this.createGameBtn) this.createGameBtn.disabled = false;
                if (this.joinGameBtn) this.joinGameBtn.disabled = false;
            };
        } catch (error) {
            console.error('Error joining game:', error);
            // Re-enable buttons on error
            if (this.createGameBtn) this.createGameBtn.disabled = false;
            if (this.joinGameBtn) this.joinGameBtn.disabled = false;
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
        
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot handle key press:', {
                hasSocket: !!this.gameSocket,
                socketState: this.gameSocket?.readyState,
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
                this.gameSocket.send(JSON.stringify({
                    type: 'paddle_move',
                    direction: direction,
                    game_id: this.gameId
                }));
            }
        }
    }
    
    updatePaddlePosition() {
        // console.log('updatePaddlePosition called');
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot update paddle: socket:', !!this.gameSocket, 'state:', this.gameSocket?.readyState, 'gameId:', this.gameId, 'started:', this.gameStarted);
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
            this.gameSocket.send(JSON.stringify({
                type: 'paddle_move',
                direction: direction
            }));
            this.lastPaddleUpdate = now;
        }
    }
    
    animate() {
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
        
        // Create "Create New Game" button
        const homeButton = document.createElement('button');
        homeButton.innerText = 'Go to Lobby';
        homeButton.style.padding = '15px 30px';
        homeButton.style.fontSize = '1.2em';
        homeButton.style.cursor = 'pointer';
        homeButton.style.backgroundColor = '#4CAF50';
        homeButton.style.color = 'white';
        homeButton.style.border = 'none';
        homeButton.style.borderRadius = '5px';
        homeButton.onclick = () => {
            // Clean up WebSocket before navigating
            if (this.gameSocket) {
                this.gameSocket.onclose = null; // Remove onclose handler
                this.gameSocket.close();
                this.gameSocket = null;
            }
            window.location.href = '#game';  
        };
        
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
        if (this.gameSocket) {
            this.gameSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.gameSocket.close();
            this.gameSocket = null;
        }
    }
    
    handleGameOver(data) {
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
        
        // Create "Create New Game" button
        const createButton = document.createElement('button');
        createButton.innerText = 'Create New Game';
        createButton.style.padding = '15px 30px';
        createButton.style.fontSize = '1.2em';
        createButton.style.cursor = 'pointer';
        createButton.style.backgroundColor = '#4CAF50';
        createButton.style.color = 'white';
        createButton.style.border = 'none';
        createButton.style.borderRadius = '5px';
        createButton.onclick = () => {
            // Clean up WebSocket before navigating
            if (this.gameSocket) {
                this.gameSocket.onclose = null; // Remove onclose handler
                this.gameSocket.close();
                this.gameSocket = null;
            }
            window.location.href = '#game';  
        };
        
        // Create "Join Game" button
        const joinButton = document.createElement('button');
        joinButton.innerText = 'Join Game';
        joinButton.style.padding = '15px 30px';
        joinButton.style.fontSize = '1.2em';
        joinButton.style.cursor = 'pointer';
        joinButton.style.backgroundColor = '#2196F3';
        joinButton.style.color = 'white';
        joinButton.style.border = 'none';
        joinButton.style.borderRadius = '5px';
        joinButton.onclick = () => {
            // Clean up WebSocket before navigating
            if (this.gameSocket) {
                this.gameSocket.onclose = null; // Remove onclose handler
                this.gameSocket.close();
                this.gameSocket = null;
            }
            window.location.href = '#game/join/';  
        };
        
        // Add buttons to container
        buttonsContainer.appendChild(createButton);
        buttonsContainer.appendChild(joinButton);
        
        // Add elements to overlay
        overlay.appendChild(resultText);
        overlay.appendChild(scoreText);
        overlay.appendChild(durationText);
        overlay.appendChild(buttonsContainer);
        
        // Add overlay to body
        document.body.appendChild(overlay);
        
        // Clean up WebSocket connection
        if (this.gameSocket) {
            this.gameSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.gameSocket.close();
            this.gameSocket = null;
        }
    }
    
    handleReadyClick() {
        if (!this.gameSocket || !this.gameId) return;
        
        this.gameSocket.send(JSON.stringify({
            type: 'player_ready'
        }));
    }

    updateReadyState(gameState) {
        if (!gameState || !gameState.players) return;
        
        const players = gameState.players;
        const isPlayer1 = this.playerId === players.player1?.id;
        
        // Update player 1 ready button
        if (players.player1 && this.player1Ready) {
            this.player1Ready.textContent = players.player1.is_ready ? 'Ready!' : 'Not Ready';
            this.player1Ready.classList.toggle('ready', players.player1.is_ready);
            if (isPlayer1) {
                this.player1Ready.disabled = players.player1.is_ready;
            }
        }

        // Update player 2 ready button
        if (players.player2 && this.player2Ready) {
            this.player2Ready.textContent = players.player2.is_ready ? 'Ready!' : 'Not Ready';
            this.player2Ready.classList.toggle('ready', players.player2.is_ready);
            this.player2Ready.disabled = isPlayer1 || players.player2.is_ready;
        }
    }

    showJoinGameForm() {
        let form = document.getElementById('join_game_form');
        if (form) {
            form.remove();
            return;
        }

        form = document.createElement('form');
        form.id = 'join_game_form';
        form.innerHTML = `
            <input type="text" id="game_id_input" placeholder="Enter Game ID">
            <button type="submit">Join</button>
        `;
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const gameId = document.getElementById('game_id_input').value;
            if (gameId) {
                console.log('Joining game:', gameId);
                this.joinGame(gameId);
            }
            form.remove();
        });
        
        this.joinGameBtn.parentNode.insertBefore(form, this.joinGameBtn.nextSibling);
        document.getElementById('game_id_input').focus();
    }
};  
