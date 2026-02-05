const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Serve static files from project root
const path = require('path');
app.use(express.static(path.join(__dirname, '..')));

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

// Export for Vercel serverless
// Note: This approach has limitations with Socket.IO due to serverless stateless nature
module.exports = server;
