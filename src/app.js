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
  const selectedImageIds = imageIds.slice(0, 8);
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

const getPlayerName = (socketId) => players.find((player) => player.id === socketId).name;

io.on("connection", (socket) => {
  console.log(`Novo jogador conectado: ${socket.id}`);
  socket.on("joinGame", (playerName) => {
    if (gameStarted) {
      console.log(`O jogador ${socket.id} não pode entrar no jogo porque já começou`);
      socket.emit("gameJoined", {
        success: false,
        message: "O jogo já está cheio ou em andamento",
      });
    } else {
      console.log(`O jogador ${socket.id} entrou no jogo com o nome: ${playerName}`);

      const newPlayer = { 
        id: socket.id, 
        name: playerName,
        score: 0, 
        turn: false,
        isHost: players.length === 0
      };
      players.push(newPlayer);

      if (players.length === 1) {
        console.log(`O jogador ${socket.id} é o anfitrião`);
      }
      io.emit("players", players);
      socket.emit("gameJoined", {
        success: true,
        message: "Você entrou no jogo com sucesso",
      });
    }
  });

  socket.on("startGame", () => {
    if (players.length < 2) {
      console.log("O jogo não pode ser iniciado com menos de 2 jogadores");
      socket.emit("gameStarted", {
        success: false,
        message: "O jogo não pode ser iniciado com menos de 2 jogadores",
      });
    } else {
      gameStarted = true;
      const randonIndex = Math.floor(Math.random() * players.length);
      players = players.map((player, index) => ({
        ...player,
        turn: index === randonIndex,
      }));
      console.log(`Jogo iniciado com jogadores: ${players.map((player) => JSON.stringify(player))} e índice aleatório: ${randonIndex}`);
      io.emit("players", players);
      initializeGameBoard();
      io.emit("startedGame", gameBoard);
    }
  });

  socket.on("flipCard", (cardIndex) => {
    console.log(`Carta virada: ${cardIndex}`);
    gameBoard = gameBoard.map((card) => (card.id === cardIndex ? { ...card, isFlipped: true } : card));
    if (gameBoard.filter((card) => card.isFlipped && !card.isMatched).length === 2) { // se encontrou duas cartas viradas e não combinadas
      const flippedCards = gameBoard.filter((card) => card.isFlipped && !card.isMatched);
      if (flippedCards[0].imageId === flippedCards[1].imageId) {
        console.log(`Cartas combinadas: ${flippedCards.map((card) => JSON.stringify(card))}`);
        gameBoard = gameBoard.map((card) =>
          flippedCards.some((flippedCard) => flippedCard.id === card.id) ? { ...card, isMatched: true } : card
        );

        players = players.map((player) => player.id === socket.id ? { ...player, score: player.score + 1 } : player);
        
        console.log(`Jogadores: ${players.map((player) => JSON.stringify(player))}`);

        io.emit("cardFlipped", {
          gameBoard: gameBoard,
          message: `${getPlayerName(socket.id)} combinou as cartas`,
          variant: 'success'
        });
        io.emit("players", players);

        // verificar se todas as cartas já foram viradas
        if (gameBoard.filter((card) => !card.isMatched).length === 0) {
          console.log("Todas as cartas foram combinadas");
          // verificar se existem jogadores com a mesma pontuação
          const duplicates = findDuplicates(players);
          const playerWithMaxScore = players.reduce((prev, current) => (prev.score > current.score ? prev : current));
          if (duplicates !== null && duplicates[0].score === playerWithMaxScore.score){
            console.log("Há um empate");
            initializeGameBoard();
            players = players.map((player) => ({ ...player, score: 0 }));
            io.emit("startedGame", gameBoard);
            io.emit("players", players);
            io.emit("gameTied", duplicates);
          } else {
            console.log("Há um vencedor");
            initializeGameBoard();
            players = players.map((player) => ({ ...player, score: 0 }));
            io.emit("startedGame", gameBoard);
            io.emit("players", players);
            io.emit("gameWon", playerWithMaxScore);
          }
        }
      } else {
        console.log(`As cartas viradas são diferentes: ${flippedCards.map((card) => JSON.stringify(card))}`);
        // enviar mensagem de cartas diferentes
        io.emit("cardFlipped", {
          gameBoard: gameBoard,
          message: `${getPlayerName(socket.id)} errou!`,
          variant: 'error'
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

        console.log(`Jogadores: ${players.map((player) => JSON.stringify(player))}`);

        setTimeout(() => {
          io.emit("cardFlipped", {
            gameBoard: gameBoard,
            message: null,
            variant: 'info'
          });
          io.emit("players", players);
        }, 2000);
      }
    } else {
      console.log(`O jogador ${getPlayerName(socket.id)} virou uma carta e está esperando a vez`);
      io.emit("cardFlipped", {
        gameBoard: gameBoard,
        message: `${getPlayerName(socket.id)} virou uma carta`,
        variant: 'info'
      });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Jogador desconectado: ${socket.id}`);
    const disconnectedPlayer = players.find((player) => player.id === socket.id);
    players = players.filter((player) => player.id !== socket.id);
    io.emit("playerLeft", players);
    if (players.length < 2) {
      gameStarted = false;
      io.emit("gameStopped");
    } else if (disconnectedPlayer.turn) {
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
      
      io.emit("players", players);
    } else if (disconnectedPlayer.isHost) {
      players[0].isHost = true;
      io.emit("players", players);
    }
  });
});

server.listen(port, () =>
  console.log(`Servidor rodando em http://${getIp().split(": ")[1]}:${port}`)
);
