const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const getIp = require("./get_ip");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const port = 3000;

let players = [];
let gameBoard = [];
let gameStarted = false;

const initializeGameBoard = () => {
  const imageIds = [...Array(50)].map((_, index) => index + 1);
  for (let i = imageIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [imageIds[i], imageIds[j]] = [imageIds[j], imageIds[i]];
  }
  const selectedImageIds = imageIds.slice(0, 9);
  let duplicatedImageIds = [...selectedImageIds, ...selectedImageIds];
  for (let i = duplicatedImageIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [duplicatedImageIds[i], duplicatedImageIds[j]] = [duplicatedImageIds[j], duplicatedImageIds[i]];
  }
  gameBoard = duplicatedImageIds.map((imageId, index) => ({
    id: index,
    imageId: `F${imageId}`,
    isFlipped: false,
    isMatched: false,
  }));
};

io.on("connection", (socket) => {
  console.log(`New player connected: ${socket.id}`);
  socket.on("joinGame", (playerName) => {
    console.log(`Player ${socket.id} joined the game with name: ${playerName}`);
    if (gameStarted) {
      socket.emit("gameJoined", {
        success: false,
        message: "Game is already full or in progress",
      });
    } else {
      players.push({ id: socket.id, name: playerName, score: 0, turn: false });
      if (players.length === 1) {
        console.log(`Player ${socket.id} is the host`);
        socket.emit("host", socket.id);
      }
      io.emit("players", players);
      socket.emit("gameJoined", {
        success: true,
        message: "You have successfully joined the game",
      });
    }
  });

  socket.on("startGame", () => {
    if (players.length < 2) {
      console.log("Game cannot be started with less than 2 players");
      socket.emit("gameStarted", {
        success: false,
        message: "Game cannot be started with less than 2 players",
      });
    } else {
      gameStarted = true;
      const randonIndex = Math.floor(Math.random() * players.length);
      players = players.map((player, index) => ({
        ...player,
        turn: index === randonIndex,
      }));
      console.log(`Game started with players: ${players} and random index: ${randonIndex}`);
      socket.emit("players", players);
      initializeGameBoard();
      io.emit("startedGame", gameBoard);
    }
  });

  socket.on("flipCard", (cardIndex) => {
    console.log(`Flipped card: ${cardIndex}`);
    io.emit("cardFlipped", { cardIndex, card: gameBoard[cardIndex] });
    if (gameBoard.filter((card) => !card.isMatched).length === 2) {
      const flippedCards = gameBoard.filter((card) => card.isFlipped && !card.isMatched);
      if (flippedCards[0].image === flippedCards[1].image) {
        console.log(`Matched cards: ${flippedCards}`);
        gameBoard = gameBoard.map((card) =>
          flippedCards.some((flippedCard) => flippedCard.id === card.id)
            ? { ...card, isMatched: true }
            : card
        );
        players = players.map((player) =>
          player.id === socket.id
            ? { ...player, score: player.score + 1 }
            : { ...player, turn: !player.turn }
        );
        io.emit("matchedCards", gameBoard);
        io.emit("players", players);
      } else {
        console.log(`Flipped cards are different: ${flippedCards}`);
        gameBoard = gameBoard.map((card) =>
          flippedCards.some((flippedCard) => flippedCard.id === card.id)
            ? { ...card, isFlipped: false }
            : card
        );
        players = players.map((player) =>
          player.id === socket.id
            ? { ...player, turn: !player.turn }
            : { ...player, turn: !player.turn }
        );
        io.emit("differentCards", gameBoard);
        io.emit("players", players);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log(`Player disconnected: ${socket.id}`);
    players = players.filter((player) => player.id !== socket.id);
    io.emit("playerLeft", players);
    if (players.length < 2) {
      gameStarted = false;
      io.emit("gameStopped");
    }
  });
});

server.listen(port, () =>
  console.log(`Server running on http://${getIp().split(": ")[1]}:${port}`)
);
