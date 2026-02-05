const pieces = {
    white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
    black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' }
};

const initialBoard = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', ''],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
];

// Game state
let board = [];
let selectedSquare = null;
let currentPlayer = 'white';
let gameOver = false;
let castlingRights = {
    white: { kingSide: true, queenSide: true },
    black: { kingSide: true, queenSide: true }
};

// Multiplayer state
let socket = null;
let myColor = null;
let myName = '';
let opponentName = '';
let gameId = null;
let isMultiplayer = false;

// DOM Elements
const lobbyEl = document.getElementById('lobby');
const gameScreenEl = document.getElementById('game-screen');
const lobbyStatusEl = document.getElementById('lobby-status');
const drawModal = document.getElementById('draw-modal');

// Initialize
function init() {
    board = initialBoard.map(row => [...row]);
    selectedSquare = null;
    currentPlayer = 'white';
    gameOver = false;
    castlingRights = {
        white: { kingSide: true, queenSide: true },
        black: { kingSide: true, queenSide: true }
    };
    document.getElementById('message').textContent = '';
    updateTurnIndicator();
    renderBoard();
}

function updateTurnIndicator() {
    const indicator = document.getElementById('turn-indicator');
    const isMyTurn = !isMultiplayer || currentPlayer === myColor;
    indicator.textContent = isMyTurn ? "Your Turn" : "Opponent's Turn";
    indicator.style.background = isMyTurn ? 'rgba(78, 204, 163, 0.3)' : 'rgba(255, 255, 255, 0.1)';
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';

    const rows = myColor === 'black' ? [0,1,2,3,4,5,6,7] : [0,1,2,3,4,5,6,7];
    const cols = [0,1,2,3,4,5,6,7];

    const displayRows = myColor === 'black' ? [...rows].reverse() : rows;
    const displayCols = myColor === 'black' ? [...cols].reverse() : cols;

    for (const row of displayRows) {
        for (const col of displayCols) {
            const square = document.createElement('div');
            square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
            square.dataset.row = row;
            square.dataset.col = col;

            const piece = board[row][col];
            if (piece) {
                square.innerHTML = `<span class="piece">${getPieceSymbol(piece)}</span>`;
                square.classList.add('has-piece');
            }

            if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
                square.classList.add('selected');
            }

            if (selectedSquare) {
                const validMoves = getValidMoves(selectedSquare.row, selectedSquare.col);
                if (validMoves.some(m => m.row === row && m.col === col)) {
                    square.classList.add('valid-move');
                    if (piece) square.classList.add('has-piece');
                }
            }

            square.addEventListener('click', () => handleClick(row, col));
            boardEl.appendChild(square);
        }
    }
}

function getPieceSymbol(piece) {
    const isWhite = piece === piece.toUpperCase();
    const type = piece.toLowerCase();
    const color = isWhite ? 'white' : 'black';
    const typeMap = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
    return pieces[color][typeMap[type]];
}

function getPieceColor(piece) {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? 'white' : 'black';
}

function handleClick(row, col) {
    if (gameOver) return;
    
    if (isMultiplayer && currentPlayer !== myColor) return;

    const piece = board[row][col];
    const pieceColor = getPieceColor(piece);

    if (selectedSquare) {
        const validMoves = getValidMoves(selectedSquare.row, selectedSquare.col);
        const isValidMove = validMoves.some(m => m.row === row && m.col === col);

        if (isValidMove) {
            const from = { row: selectedSquare.row, col: selectedSquare.col };
            const to = { row, col };
            
            makeMove(from.row, from.col, to.row, to.col);
            
            if (isMultiplayer && socket) {
                socket.emit('move', { from, to });
            }
            
            selectedSquare = null;
            currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
            updateTurnIndicator();
            
            checkGameState();
        } else if (pieceColor === currentPlayer && (!isMultiplayer || pieceColor === myColor)) {
            selectedSquare = { row, col };
        } else {
            selectedSquare = null;
        }
    } else if (pieceColor === currentPlayer && (!isMultiplayer || pieceColor === myColor)) {
        selectedSquare = { row, col };
    }

    renderBoard();
}

function checkGameState() {
    if (isInCheck(currentPlayer)) {
        if (isCheckmate(currentPlayer)) {
            const winner = currentPlayer === 'white' ? 'Black' : 'White';
            document.getElementById('message').textContent = `Checkmate! ${winner} wins!`;
            gameOver = true;
        } else {
            document.getElementById('message').textContent = 'Check!';
        }
    } else if (isStalemate(currentPlayer)) {
        document.getElementById('message').textContent = 'Stalemate! Draw!';
        gameOver = true;
    } else {
        document.getElementById('message').textContent = '';
    }
}

function makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    const color = getPieceColor(piece);

    if (piece.toLowerCase() === 'k' && Math.abs(toCol - fromCol) === 2) {
        if (toCol > fromCol) {
            board[fromRow][5] = board[fromRow][7];
            board[fromRow][7] = '';
        } else {
            board[fromRow][3] = board[fromRow][0];
            board[fromRow][0] = '';
        }
    }

    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = '';

    if (piece.toLowerCase() === 'k') {
        castlingRights[color].kingSide = false;
        castlingRights[color].queenSide = false;
    }
    if (piece.toLowerCase() === 'r') {
        if (fromCol === 0) castlingRights[color].queenSide = false;
        if (fromCol === 7) castlingRights[color].kingSide = false;
    }

    if (piece.toLowerCase() === 'p') {
        if ((piece === 'P' && toRow === 0) || (piece === 'p' && toRow === 7)) {
            board[toRow][toCol] = piece === 'P' ? 'Q' : 'q';
        }
    }
}

function getValidMoves(row, col) {
    const piece = board[row][col];
    if (!piece) return [];

    const moves = getPossibleMoves(row, col);
    const color = getPieceColor(piece);

    return moves.filter(move => {
        const tempBoard = board.map(r => [...r]);
        board[move.row][move.col] = board[row][col];
        board[row][col] = '';
        const inCheck = isInCheck(color);
        board = tempBoard;
        return !inCheck;
    });
}

function getPossibleMoves(row, col, skipCastling = false) {
    const piece = board[row][col];
    const type = piece.toLowerCase();
    const color = getPieceColor(piece);
    const moves = [];

    switch (type) {
        case 'p': moves.push(...getPawnMoves(row, col, color)); break;
        case 'r': moves.push(...getSlidingMoves(row, col, [[0,1],[0,-1],[1,0],[-1,0]], color)); break;
        case 'n': moves.push(...getKnightMoves(row, col, color)); break;
        case 'b': moves.push(...getSlidingMoves(row, col, [[1,1],[1,-1],[-1,1],[-1,-1]], color)); break;
        case 'q': moves.push(...getSlidingMoves(row, col, [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]], color)); break;
        case 'k': moves.push(...getKingMoves(row, col, color, skipCastling)); break;
    }
    return moves;
}

function getPawnMoves(row, col, color) {
    const moves = [];
    const direction = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;

    if (isInBounds(row + direction, col) && !board[row + direction][col]) {
        moves.push({ row: row + direction, col });
        if (row === startRow && !board[row + 2 * direction][col]) {
            moves.push({ row: row + 2 * direction, col });
        }
    }

    for (const dc of [-1, 1]) {
        const newRow = row + direction;
        const newCol = col + dc;
        if (isInBounds(newRow, newCol) && board[newRow][newCol] && getPieceColor(board[newRow][newCol]) !== color) {
            moves.push({ row: newRow, col: newCol });
        }
    }
    return moves;
}

function getSlidingMoves(row, col, directions, color) {
    const moves = [];
    for (const [dr, dc] of directions) {
        let r = row + dr, c = col + dc;
        while (isInBounds(r, c)) {
            if (!board[r][c]) {
                moves.push({ row: r, col: c });
            } else {
                if (getPieceColor(board[r][c]) !== color) moves.push({ row: r, col: c });
                break;
            }
            r += dr; c += dc;
        }
    }
    return moves;
}

function getKnightMoves(row, col, color) {
    const moves = [];
    const offsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for (const [dr, dc] of offsets) {
        const r = row + dr, c = col + dc;
        if (isInBounds(r, c) && getPieceColor(board[r][c]) !== color) {
            moves.push({ row: r, col: c });
        }
    }
    return moves;
}

function getKingMoves(row, col, color, skipCastling = false) {
    const moves = [];
    const offsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    
    for (const [dr, dc] of offsets) {
        const r = row + dr, c = col + dc;
        if (isInBounds(r, c) && getPieceColor(board[r][c]) !== color) {
            moves.push({ row: r, col: c });
        }
    }

    if (!skipCastling) {
        const homeRow = color === 'white' ? 7 : 0;
        if (row === homeRow && col === 4 && !isInCheckSimple(color)) {
            if (castlingRights[color].kingSide &&
                !board[homeRow][5] && !board[homeRow][6] &&
                board[homeRow][7]?.toLowerCase() === 'r') {
                if (!isSquareAttacked(homeRow, 5, color) && !isSquareAttacked(homeRow, 6, color)) {
                    moves.push({ row: homeRow, col: 6 });
                }
            }
            if (castlingRights[color].queenSide &&
                !board[homeRow][1] && !board[homeRow][2] && !board[homeRow][3] &&
                board[homeRow][0]?.toLowerCase() === 'r') {
                if (!isSquareAttacked(homeRow, 2, color) && !isSquareAttacked(homeRow, 3, color)) {
                    moves.push({ row: homeRow, col: 2 });
                }
            }
        }
    }
    return moves;
}

function isInBounds(row, col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function isSquareAttacked(row, col, byColor) {
    const opponentColor = byColor === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (getPieceColor(board[r][c]) === opponentColor) {
                const moves = getPossibleMoves(r, c, true);
                if (moves.some(m => m.row === row && m.col === col)) return true;
            }
        }
    }
    return false;
}

function isInCheckSimple(color) {
    const kingPos = findKing(color);
    if (!kingPos) return false;
    return isSquareAttacked(kingPos.row, kingPos.col, color);
}

function findKing(color) {
    const king = color === 'white' ? 'K' : 'k';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (board[row][col] === king) return { row, col };
        }
    }
    return null;
}

function isInCheck(color) {
    const kingPos = findKing(color);
    if (!kingPos) return false;
    const opponentColor = color === 'white' ? 'black' : 'white';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (getPieceColor(board[row][col]) === opponentColor) {
                const moves = getPossibleMoves(row, col, true);
                if (moves.some(m => m.row === kingPos.row && m.col === kingPos.col)) return true;
            }
        }
    }
    return false;
}

function isCheckmate(color) {
    return isInCheck(color) && !hasLegalMoves(color);
}

function isStalemate(color) {
    return !isInCheck(color) && !hasLegalMoves(color);
}

function hasLegalMoves(color) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            if (getPieceColor(board[row][col]) === color) {
                if (getValidMoves(row, col).length > 0) return true;
            }
        }
    }
    return false;
}

// ============ MULTIPLAYER ============

function connectToServer() {
    socket = io();

    socket.on('waiting', (data) => {
        lobbyStatusEl.textContent = data.message;
    });

    socket.on('privateGameCreated', (data) => {
        gameId = data.gameId;
        myColor = data.color;
        lobbyStatusEl.innerHTML = `Game created! Share this code: <strong>${gameId}</strong><br>Waiting for opponent...`;
    });

    socket.on('gameJoined', (data) => {
        gameId = data.gameId;
        myColor = data.color;
        opponentName = data.opponent;
        lobbyStatusEl.textContent = 'Game found! Starting...';
    });

    socket.on('opponentJoined', (data) => {
        opponentName = data.opponent;
    });

    socket.on('gameStart', (data) => {
        isMultiplayer = true;
        startGame(data);
    });

    socket.on('opponentMove', (data) => {
        const { from, to } = data;
        makeMove(from.row, from.col, to.row, to.col);
        currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
        updateTurnIndicator();
        checkGameState();
        renderBoard();
    });

    socket.on('chatMessage', (data) => {
        addChatMessage(data.sender, data.message, data.sender === myName);
    });

    socket.on('drawOffered', (data) => {
        document.getElementById('draw-message').textContent = `${data.from} offers a draw`;
        drawModal.style.display = 'flex';
    });

    socket.on('drawDeclined', (data) => {
        addSystemMessage(`${data.from} declined the draw offer`);
    });

    socket.on('gameOver', (data) => {
        gameOver = true;
        document.getElementById('message').textContent = data.message;
        addSystemMessage(data.message);
    });

    socket.on('opponentDisconnected', (data) => {
        gameOver = true;
        document.getElementById('message').textContent = data.message;
        addSystemMessage(data.message);
    });

    socket.on('error', (data) => {
        lobbyStatusEl.textContent = data.message;
    });
}

function startGame(data) {
    lobbyEl.style.display = 'none';
    gameScreenEl.style.display = 'block';

    document.getElementById('your-name').textContent = myName;
    document.getElementById('opponent-name').textContent = opponentName;
    
    const yourColorBadge = document.getElementById('your-color');
    const opponentColorBadge = document.getElementById('opponent-color');
    
    yourColorBadge.textContent = myColor.charAt(0).toUpperCase() + myColor.slice(1);
    yourColorBadge.className = `color-badge ${myColor}`;
    
    const oppColor = myColor === 'white' ? 'black' : 'white';
    opponentColorBadge.textContent = oppColor.charAt(0).toUpperCase() + oppColor.slice(1);
    opponentColorBadge.className = `color-badge ${oppColor}`;

    init();
    addSystemMessage('Game started!');
}

function addChatMessage(sender, message, isOwn) {
    const chatMessages = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = `chat-message ${isOwn ? 'own' : 'other'}`;
    
    if (!isOwn) {
        const senderEl = document.createElement('div');
        senderEl.className = 'sender';
        senderEl.textContent = sender;
        msgEl.appendChild(senderEl);
    }
    
    const textEl = document.createElement('div');
    textEl.textContent = message;
    msgEl.appendChild(textEl);
    
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    const chatMessages = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message system';
    msgEl.textContent = message;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function sendChat() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (message && socket) {
        socket.emit('chatMessage', { message });
        input.value = '';
    }
}

// ============ EVENT LISTENERS ============

document.getElementById('find-game-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value.trim() || 'Anonymous';
    connectToServer();
    socket.emit('joinGame', { playerName: myName });
    lobbyStatusEl.textContent = 'Connecting...';
});

document.getElementById('create-private-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value.trim() || 'Anonymous';
    connectToServer();
    socket.emit('createPrivateGame', { playerName: myName });
    lobbyStatusEl.textContent = 'Creating game...';
});

document.getElementById('join-private-btn').addEventListener('click', () => {
    myName = document.getElementById('player-name').value.trim() || 'Anonymous';
    const code = document.getElementById('game-code').value.trim().toUpperCase();
    if (code) {
        connectToServer();
        socket.emit('joinGame', { playerName: myName, gameId: code });
        lobbyStatusEl.textContent = 'Joining game...';
    }
});

document.getElementById('send-chat-btn').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

document.getElementById('resign-btn').addEventListener('click', () => {
    if (socket && !gameOver) {
        socket.emit('resign');
    }
});

document.getElementById('draw-btn').addEventListener('click', () => {
    if (socket && !gameOver) {
        socket.emit('offerDraw');
        addSystemMessage('Draw offer sent');
    }
});

document.getElementById('accept-draw-btn').addEventListener('click', () => {
    if (socket) {
        socket.emit('acceptDraw');
        drawModal.style.display = 'none';
    }
});

document.getElementById('decline-draw-btn').addEventListener('click', () => {
    if (socket) {
        socket.emit('declineDraw');
        drawModal.style.display = 'none';
    }
});
