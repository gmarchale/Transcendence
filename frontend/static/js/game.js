class PongGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameSocket = null;
        this.gameId = null;
        this.playerId = null;
        
        // Game state
        this.ball = { x: 400, y: 200, dx: 5, dy: 5, radius: 8 };
        this.paddles = {
            left: { x: 50, y: 150, width: 10, height: 100 },
            right: { x: 740, y: 150, width: 10, height: 100 }
        };
        this.score = { left: 0, right: 0 };
        
        // Visual settings
        this.colors = {
            background: 'rgba(0, 0, 0, 0.3)',
            ball: '#00ff88',
            paddle: '#ffffff',
            centerLine: 'rgba(255, 255, 255, 0.2)',
            score: '#00ff88',
            glow: '0 0 10px rgba(0, 255, 136, 0.5)'
        };
        
        // Bind event listeners
        document.getElementById('startGameBtn').addEventListener('click', () => this.startGame());
        document.getElementById('joinGameBtn').addEventListener('click', () => this.joinGame());
        window.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        // Initialize WebSocket
        this.setupWebSocket();
    }
    
    setupWebSocket() {
        console.log('Setting up WebSocket connection...');
        try {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws/game/`;
            console.log('Attempting to connect to:', wsUrl);
            
            this.gameSocket = new WebSocket(wsUrl);
            
            this.gameSocket.onopen = () => {
                console.log('WebSocket connection established successfully');
                document.getElementById('startGameBtn').disabled = false;
                document.getElementById('joinGameBtn').disabled = false;
            };
            
            this.gameSocket.onmessage = (event) => {
                console.log('Received WebSocket message:', event.data);
                const data = JSON.parse(event.data);
                this.handleGameEvent(data);
            };
            
            this.gameSocket.onclose = (event) => {
                console.log('WebSocket connection closed:', event);
                document.getElementById('startGameBtn').disabled = true;
                document.getElementById('joinGameBtn').disabled = true;
                setTimeout(() => this.setupWebSocket(), 3000);
            };
            
            this.gameSocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                document.getElementById('startGameBtn').disabled = true;
                document.getElementById('joinGameBtn').disabled = true;
            };
        } catch (error) {
            console.error('Error setting up WebSocket:', error);
            document.getElementById('startGameBtn').disabled = true;
            document.getElementById('joinGameBtn').disabled = true;
        }
    }
    
    startGame() {
        if (this.gameSocket && this.gameSocket.readyState === WebSocket.OPEN) {
            this.gameSocket.send(JSON.stringify({
                type: 'create_game'
            }));
            document.getElementById('gameSection').style.display = 'block';
            document.getElementById('welcomeSection').style.display = 'none';
        } else {
            console.error('WebSocket not connected');
        }
    }
    
    joinGame() {
        if (this.gameSocket && this.gameSocket.readyState === WebSocket.OPEN) {
            this.gameSocket.send(JSON.stringify({
                type: 'join_game'
            }));
            document.getElementById('gameSection').style.display = 'block';
            document.getElementById('welcomeSection').style.display = 'none';
        } else {
            console.error('WebSocket not connected');
        }
    }
    
    handleGameEvent(data) {
        console.log('Handling game event:', data);
        switch (data.type) {
            case 'connection_established':
                console.log('Connection established with game server');
                break;
            
            case 'game_created':
                this.gameId = data.game_id;
                this.playerId = data.player_id;
                this.showGameMessage('Game created! Waiting for another player to join...');
                this.startGameLoop();
                break;
            
            case 'game_joined':
                this.gameId = data.game_id;
                this.playerId = data.player_id;
                this.showGameMessage('Game joined! Get ready to play!');
                setTimeout(() => this.hideGameMessage(), 2000);
                this.startGameLoop();
                break;
            
            case 'game_state':
                this.hideGameMessage();
                this.updateGameState(data.state);
                break;
            
            case 'game_over':
                this.handleGameOver(data);
                break;
            
            case 'error':
                this.showGameMessage(data.message, true);
                break;
        }
    }
    
    showGameMessage(message, isError = false) {
        let messageDiv = document.getElementById('gameMessage');
        if (!messageDiv) {
            messageDiv = document.createElement('div');
            messageDiv.id = 'gameMessage';
            messageDiv.style.position = 'absolute';
            messageDiv.style.top = '50%';
            messageDiv.style.left = '50%';
            messageDiv.style.transform = 'translate(-50%, -50%)';
            messageDiv.style.padding = '20px';
            messageDiv.style.borderRadius = '10px';
            messageDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            messageDiv.style.color = isError ? '#ff4444' : '#00ff88';
            messageDiv.style.fontFamily = "'Orbitron', sans-serif";
            messageDiv.style.fontSize = '1.2em';
            messageDiv.style.textAlign = 'center';
            messageDiv.style.zIndex = '1000';
            messageDiv.style.boxShadow = isError ? '0 0 20px rgba(255, 68, 68, 0.3)' : '0 0 20px rgba(0, 255, 136, 0.3)';
            document.getElementById('gameSection').appendChild(messageDiv);
        }
        messageDiv.textContent = message;
        messageDiv.style.display = 'block';
    }
    
    hideGameMessage() {
        const messageDiv = document.getElementById('gameMessage');
        if (messageDiv) {
            messageDiv.style.display = 'none';
        }
    }
    
    updateGameState(state) {
        this.ball = state.ball;
        this.paddles = state.paddles;
        this.score = state.score;
        this.draw();
    }
    
    handleKeyPress(event) {
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN) return;
        
        let direction = null;
        if (event.key === 'ArrowUp') direction = 'up';
        if (event.key === 'ArrowDown') direction = 'down';
        
        if (direction) {
            this.gameSocket.send(JSON.stringify({
                type: 'paddle_move',
                direction: direction,
                game_id: this.gameId,
                player_id: this.playerId
            }));
        }
    }
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw center line
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.strokeStyle = this.colors.centerLine;
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Draw ball with glow effect
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = this.colors.ball;
        this.ctx.shadowColor = this.colors.ball;
        this.ctx.shadowBlur = 15;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        
        // Draw paddles with slight glow
        this.ctx.shadowColor = this.colors.paddle;
        this.ctx.shadowBlur = 10;
        this.ctx.fillStyle = this.colors.paddle;
        
        // Left paddle
        this.ctx.fillRect(
            this.paddles.left.x,
            this.paddles.left.y,
            this.paddles.left.width,
            this.paddles.left.height
        );
        
        // Right paddle
        this.ctx.fillRect(
            this.paddles.right.x,
            this.paddles.right.y,
            this.paddles.right.width,
            this.paddles.right.height
        );
        
        this.ctx.shadowBlur = 0;
        
        // Update score display
        document.getElementById('player1Score').textContent = this.score.left;
        document.getElementById('player2Score').textContent = this.score.right;
    }
    
    startGameLoop() {
        this.draw();
    }
    
    handleGameOver(data) {
        const winner = data.winner === this.playerId ? 'You won!' : 'You lost!';
        alert(`Game Over! ${winner}`);
        document.getElementById('gameSection').style.display = 'none';
        document.getElementById('welcomeSection').style.display = 'block';
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new PongGame();
});
