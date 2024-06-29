const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const port = 3000;

let players = [];
let gameBoard = [];
let gameStarted = false;

const initializeGameBoard = () => {
  const cards = [...Array(18)].map((_, index) => ({
    id: index,
    image: index,
    isFlipped: false,
    isMatched: false,
  }));
  gameBoard = cards.sort(() => Math.random() - 0.5);
};

io.on("connection", (socket) => {
  console.log("New player connected:", socket.id);

  socket.on("joinGame", (playerName) => {
    console.log("Player", playerName, "trying to join the game");
    if (gameStarted) {
      socket.emit("gameJoined", {
        success: false,
        message: "Game is already full or in progress",
      });
    } else {
      players.push({ id: socket.id, name: playerName, score: 0, turn: false });
      if (players.length === 1) {
        console.log("Player", socket.id, "is the host");
        socket.emit("host", socket.id);
      }
      io.emit("playerJoined", players);
      socket.emit("gameJoined", {
        success: true,
        message: "You have successfully joined the game",
      });
    }
  });

  socket.on("startGame", () => {
    gameStarted = true;
    initializeGameBoard();
    io.emit("startedGame", gameBoard);
  });

  socket.on("flipCard", (cardIndex) => {
    console.log("Flipped card:", cardIndex);
    io.emit("cardFlipped", { cardIndex, card: gameBoard[cardIndex] });
    /**
     * Implement a circular list algorithm to control players' turns
     * Logic to check if flipped cards are a match
     * Logic to check if flipped cards are different
     * Logic to flip the cards back
     * Logic to pass the turn to the other player
     * Update players' scores
     * Check if the game is over
     * Send game over message
     * Restart the game
     *
     */
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    players = players.filter((player) => player.id !== socket.id);
    io.emit("playerLeft", players);
    if (players.length < 2) {
      gameStarted = false;
      io.emit("gameStopped");
    }
  });
});

server.listen(port, () => console.log(`Server running on port ${port}`));
