const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

// Estado do jogo
let players = [];
let gameBoard = [];
let gameStarted = false;

// Função para inicializar o tabuleiro do jogo
const initializeGameBoard = () => {
  const cards = ["A", "A", "B", "B", "C", "C", "D", "D"]; // Exemplo simples com 4 pares
  gameBoard = cards.sort(() => Math.random() - 0.5);
};

io.on("connection", (socket) => {
  console.log("Novo jogador conectado:", socket.id);

  socket.on("joinGame", (playerName) => {
    if (players.length < 2 && !gameStarted) {
      players.push({ id: socket.id, name: playerName, score: 0 });
      socket.emit("gameJoined", { success: true, gameBoard, players });
      io.emit("playerJoined", players);
      if (players.length === 2) {
        gameStarted = true;
        initializeGameBoard();
        io.emit("startGame", gameBoard);
      }
    } else {
      socket.emit("gameJoined", {
        success: false,
        message: "Jogo já está cheio ou em andamento",
      });
    }
  });

  socket.on("flipCard", (cardIndex) => {
    io.emit("cardFlipped", { cardIndex, card: gameBoard[cardIndex] });
    /**
     * Implementar um algoritmo de lista circular para controlar a vez dos jogadores
     * Lógica para verificar se as cartas viradas são iguais
     * Lógica para verificar se as cartas viradas são diferentes
     * Lógica para virar as cartas de volta
     * Lógica para passar a vez para o outro jogador
     * Atualizar o placar dos jogadores
     * Verificar se o jogo acabou
     * Enviar mensagem de fim de jogo
     * Reiniciar o jogo
     * 
     */
  });

  socket.on("disconnect", () => {
    console.log("Jogador desconectado:", socket.id);
    players = players.filter((player) => player.id !== socket.id);
    io.emit("playerLeft", players);
    if (players.length < 2) {
      gameStarted = false;
      io.emit("gameStopped");
    }
  });
});

server.listen(port, () => console.log(`Servidor rodando na porta ${port}`));
