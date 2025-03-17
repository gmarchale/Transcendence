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
                    // Parse game_id as integer
                    this.gameId = parseInt(message.game_id || message.id, 10);
                    this.playerId = parseInt(message.player_id, 10);
                    this.gameState = message.game_state;
                    this.isCreatingGame = false;

                    console.log('Setting URL hash to:', `play/${this.gameId}`);
                    window.location.hash = `play/${this.gameId}`;
                    break;
                    
                case 'game_joined':
                    console.log('Game joined:', message);
                    // Parse game_id as integer
                    this.gameId = parseInt(message.game_id, 10);
                    this.playerId = parseInt(message.player2.id, 10);  // Set player ID from player2 info
                    window.location.hash = `play/${this.gameId}`;
                    break;

                case 'connection_established':
                    console.log('Connection established:', {
                        playerId: message.user.id,
                        username: message.user.username
                    });
                    this.connected = true;
                    this.playerId = parseInt(message.user.id, 10);  // Ensure player ID is integer
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
        // console.log('updatePaddlePosition called');
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
            if (this.uiSocket) {
                this.uiSocket.onclose = null; // Remove onclose handler
                this.uiSocket.close();
                this.uiSocket = null;
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
        if (this.uiSocket) {
            this.uiSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.uiSocket.close();
            this.uiSocket = null;
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
            if (this.uiSocket) {
                this.uiSocket.onclose = null; // Remove onclose handler
                this.uiSocket.close();
                this.uiSocket = null;
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
            if (this.uiSocket) {
                this.uiSocket.onclose = null; // Remove onclose handler
                this.uiSocket.close();
                this.uiSocket = null;
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
        if (this.uiSocket) {
            this.uiSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.uiSocket.close();
            this.uiSocket = null;
        }
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
        
        const players = gameState.players;
        const isPlayer1 = this.playerId === parseInt(players.player1?.id, 10);
        const isPlayer2 = this.playerId === parseInt(players.player2?.id, 10);
        
        // Update player 1 ready button
        if (players.player1 && this.player1Ready) {
            this.player1Ready.textContent = players.player1.is_ready ? 'Ready!' : 'Not Ready';
            this.player1Ready.classList.toggle('ready', players.player1.is_ready);
            // Only enable player 1's button if they are player 1 and not ready
            this.player1Ready.disabled = !isPlayer1 || players.player1.is_ready;
        }

        // Update player 2 ready button
        if (players.player2 && this.player2Ready) {
            this.player2Ready.textContent = players.player2.is_ready ? 'Ready!' : 'Not Ready';
            this.player2Ready.classList.toggle('ready', players.player2.is_ready);
            // Only enable player 2's button if they are player 2 and not ready
            this.player2Ready.disabled = !isPlayer2 || players.player2.is_ready;
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
