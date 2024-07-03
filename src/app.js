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
  const selectedImageIds = imageIds.slice(0, 5);
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

const findDuplicates = (lista) => {
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      if (lista[i].score === lista[j].score) {
        return [lista[i], lista[j]];
      }
    }
  }
  return null;
}

io.on("connection", (socket) => {
  console.log(`New player connected: ${socket.id}`);
  socket.on("joinGame", (playerName) => {
    if (gameStarted) {
      console.log(`Player ${socket.id} cannot join the game because it has already started`);
      socket.emit("gameJoined", {
        success: false,
        message: "Game is already full or in progress",
      });
    } else {
      console.log(`Player ${socket.id} joined the game with name: ${playerName}`);
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
      console.log(`Game started with players: ${players.map((player) => JSON.stringify(player))} and random index: ${randonIndex}`);
      io.emit("players", players);
      initializeGameBoard();
      io.emit("startedGame", gameBoard);
    }
  });

  socket.on("flipCard", (cardIndex) => {
    console.log(`Flipped card: ${cardIndex}`);
    gameBoard = gameBoard.map((card) => (card.id === cardIndex ? { ...card, isFlipped: true } : card));
    if (gameBoard.filter((card) => card.isFlipped && !card.isMatched).length === 2) {
      const flippedCards = gameBoard.filter((card) => card.isFlipped && !card.isMatched);
      if (flippedCards[0].imageId === flippedCards[1].imageId) {
        console.log(`Matched cards: ${flippedCards.map((card) => JSON.stringify(card))}`);
        gameBoard = gameBoard.map((card) =>
          flippedCards.some((flippedCard) => flippedCard.id === card.id) ? { ...card, isMatched: true } : card
        );
        // incrementar score com map
        players = players.map((player) => player.id === socket.id ? { ...player, score: player.score + 1 } : player);
        
        console.log(`Players: ${players.map((player) => JSON.stringify(player))}`);

        io.emit("cardFlipped", {
          gameBoard: gameBoard,
          message: `Player ${socket.id} has matched cards`,
        });
        io.emit("players", players);

        // verificar se todas as cartas já foram viradas
        if (gameBoard.filter((card) => !card.isMatched).length === 0) {
          console.log("All cards have been matched");
          // verificar se existe players com o mesmo score
          const duplicates = findDuplicates(players);
          const playerWithMaxScore = players.reduce((prev, current) => (prev.score > current.score ? prev : current));
          if (duplicates !== null && duplicates[0].score === playerWithMaxScore.score){
            console.log("There is a tie");
            io.emit("gameTied", duplicates);
          } else {
            console.log("There is a winner");
            io.emit("gameWon", playerWithMaxScore);
          }
        }
      } else {
        console.log(`Flipped cards are different: ${flippedCards.map((card) => JSON.stringify(card))}`);
        // enviar mensagem de cartas diferentes
        io.emit("cardFlipped", {
          gameBoard: gameBoard,
          message: `Player ${socket.id} has flipped cards`,
        });
        // resetar cartas viradas
        gameBoard = gameBoard.map((card) =>
          flippedCards.some((flippedCard) => flippedCard.id === card.id) ? { ...card, isFlipped: false } : card
        );

        // passar a vez
        for (let i = 0; i < players.length; i++) {
          if (players[i].id === socket.id) {
            players[i].turn = false;
            if (i === players.length - 1) {
              players[0].turn = true;
            } else {
              players[i + 1].turn = true;
            }
            break;
          }
        } 

        console.log(`Players: ${players.map((player) => JSON.stringify(player))}`);

        setTimeout(() => {
          io.emit("cardFlipped", {
            gameBoard: gameBoard,
            message: `reset cards flipped by player ${socket.id}`,
          });
          io.emit("players", players);
        }, 2000);
      }
    } else {
      console.log(`Player ${socket.id} has flipped a card and is waiting for the turn`);
      io.emit("cardFlipped", {
        gameBoard: gameBoard,
        message: `Player ${socket.id} has flipped a card`,
      });
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
