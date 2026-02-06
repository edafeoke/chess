const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Get the project root directory
// Try multiple possible paths for Vercel serverless environment
let projectRoot = path.join(__dirname, '..');
if (!fs.existsSync(path.join(projectRoot, 'style.css'))) {
    // Try process.cwd() as fallback
    projectRoot = process.cwd();
}
if (!fs.existsSync(path.join(projectRoot, 'style.css'))) {
    // Try __dirname directly (if files are in same directory)
    projectRoot = __dirname;
}

// Debug: Log the project root (remove in production if needed)
console.log('Project root:', projectRoot);
console.log('__dirname:', __dirname);
console.log('process.cwd():', process.cwd());
if (fs.existsSync(projectRoot)) {
    console.log('Files in project root:', fs.readdirSync(projectRoot).slice(0, 10));
}

// Serve static files explicitly with error handling
app.get('/style.css', (req, res) => {
    const filePath = path.join(projectRoot, 'style.css');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath, { 
            headers: { 'Content-Type': 'text/css' } 
        });
    } else {
        res.status(404).send('CSS file not found');
    }
});

app.get('/script.js', (req, res) => {
    const filePath = path.join(projectRoot, 'script.js');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath, { 
            headers: { 'Content-Type': 'application/javascript' } 
        });
    } else {
        res.status(404).send('JS file not found');
    }
});

app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No content for favicon
});

// Serve other static files
app.use(express.static(projectRoot, {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath);
        if (ext === '.css') {
            res.setHeader('Content-Type', 'text/css');
        } else if (ext === '.js') {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Catch-all route: serve index.html for SPA routing
app.get('*', (req, res) => {
    // Skip if this is a request for a static file
    const ext = path.extname(req.path);
    if (ext && ext !== '.html') {
        return res.status(404).send('File not found');
    }
    res.sendFile(path.join(projectRoot, 'index.html'));
});

// Socket.IO setup
// Note: Socket.IO has significant limitations on Vercel serverless
// For production, consider Railway, Render, Fly.io, or similar platforms
const http = require('http');
const { Server } = require('socket.io');

// Create HTTP server wrapper for Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true
});

const games = new Map();
const waitingPlayers = [];

function generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('joinGame', (data) => {
        const { playerName, gameId } = data;
        socket.playerName = playerName || 'Anonymous';

        if (gameId) {
            const game = games.get(gameId);
            if (game && !game.black) {
                game.black = { id: socket.id, name: socket.playerName };
                socket.join(gameId);
                socket.gameId = gameId;
                socket.color = 'black';

                socket.emit('gameJoined', {
                    gameId,
                    color: 'black',
                    opponent: game.white.name
                });

                io.to(game.white.id).emit('opponentJoined', {
                    opponent: socket.playerName
                });

                io.to(gameId).emit('gameStart', {
                    white: game.white.name,
                    black: game.black.name
                });
            } else {
                socket.emit('error', { message: 'Game not found or full' });
            }
        } else {
            if (waitingPlayers.length > 0) {
                const opponent = waitingPlayers.shift();
                const newGameId = generateGameId();

                const game = {
                    id: newGameId,
                    white: { id: opponent.id, name: opponent.playerName },
                    black: { id: socket.id, name: socket.playerName },
                    moves: []
                };
                games.set(newGameId, game);

                opponent.join(newGameId);
                opponent.gameId = newGameId;
                opponent.color = 'white';

                socket.join(newGameId);
                socket.gameId = newGameId;
                socket.color = 'black';

                opponent.emit('gameJoined', {
                    gameId: newGameId,
                    color: 'white',
                    opponent: socket.playerName
                });

                socket.emit('gameJoined', {
                    gameId: newGameId,
                    color: 'black',
                    opponent: opponent.playerName
                });

                io.to(newGameId).emit('gameStart', {
                    white: opponent.playerName,
                    black: socket.playerName
                });
            } else {
                waitingPlayers.push(socket);
                socket.emit('waiting', { message: 'Waiting for opponent...' });
            }
        }
    });

    socket.on('createPrivateGame', (data) => {
        const { playerName } = data;
        socket.playerName = playerName || 'Anonymous';

        const gameId = generateGameId();
        const game = {
            id: gameId,
            white: { id: socket.id, name: socket.playerName },
            black: null,
            moves: []
        };
        games.set(gameId, game);

        socket.join(gameId);
        socket.gameId = gameId;
        socket.color = 'white';

        socket.emit('privateGameCreated', {
            gameId,
            color: 'white'
        });
    });

    socket.on('move', (data) => {
        const { from, to } = data;
        const gameId = socket.gameId;

        if (gameId && games.has(gameId)) {
            const game = games.get(gameId);
            game.moves.push({ from, to, player: socket.color });

            socket.to(gameId).emit('opponentMove', { from, to });
        }
    });

    socket.on('chatMessage', (data) => {
        const gameId = socket.gameId;
        if (gameId) {
            io.to(gameId).emit('chatMessage', {
                sender: socket.playerName,
                message: data.message,
                isSystem: false
            });
        }
    });

    socket.on('resign', () => {
        const gameId = socket.gameId;
        if (gameId && games.has(gameId)) {
            io.to(gameId).emit('gameOver', {
                reason: 'resignation',
                winner: socket.color === 'white' ? 'black' : 'white',
                message: `${socket.playerName} resigned`
            });
            games.delete(gameId);
        }
    });

    socket.on('offerDraw', () => {
        const gameId = socket.gameId;
        if (gameId) {
            socket.to(gameId).emit('drawOffered', {
                from: socket.playerName
            });
        }
    });

    socket.on('acceptDraw', () => {
        const gameId = socket.gameId;
        if (gameId && games.has(gameId)) {
            io.to(gameId).emit('gameOver', {
                reason: 'draw',
                message: 'Game drawn by agreement'
            });
            games.delete(gameId);
        }
    });

    socket.on('declineDraw', () => {
        const gameId = socket.gameId;
        if (gameId) {
            socket.to(gameId).emit('drawDeclined', {
                from: socket.playerName
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);

        const waitingIndex = waitingPlayers.findIndex(p => p.id === socket.id);
        if (waitingIndex !== -1) {
            waitingPlayers.splice(waitingIndex, 1);
        }

        const gameId = socket.gameId;
        if (gameId && games.has(gameId)) {
            io.to(gameId).emit('opponentDisconnected', {
                message: `${socket.playerName} disconnected`
            });
            games.delete(gameId);
        }
    });
});

// Export Express app for Vercel serverless
// Note: Socket.IO with persistent WebSocket connections will NOT work reliably 
// on Vercel's traditional serverless platform due to stateless nature of functions
// The server and io are set up but may not function correctly in serverless environment
module.exports = app;
