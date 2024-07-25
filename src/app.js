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
let maxCards = 0;
const maxRounds = 3;
let currentRound = 1;

const initializeGameBoard = () => {
  const imageIds = [...Array(50)].map((_, index) => index + 1);
  for (let i = imageIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [imageIds[i], imageIds[j]] = [imageIds[j], imageIds[i]];
  }
  const selectedImageIds = imageIds.slice(0, maxCards);
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

const getNextActivePlayerIndex = (players, currentIndex) => {
  const totalPlayers = players.length;
  let nextIndex = (currentIndex + 1) % totalPlayers;
  while (!players[nextIndex].isActive) {
    nextIndex = (nextIndex + 1) % totalPlayers;
    if (nextIndex === currentIndex) {
      return -1;
    }
  }
  return nextIndex;
}

const passTheTurn = (socketId) => {
  const currentPlayerIndex = players.findIndex((player) => player.id === socketId);
  const nextPlayerIndex = getNextActivePlayerIndex(players, currentPlayerIndex);
  players.forEach((player) => player.turn = false);
  players[nextPlayerIndex].turn = true;
}

const getPlayerName = (socketId) => players.find((player) => player.id === socketId).name;

io.on("connection", (socket) => {
  console.log(`Novo jogador conectado: ${socket.id}`);

  //=============================================================================================================
  // JOIN GAME
  //=============================================================================================================
  socket.on("joinGame", ({ playerName, ip }) => {
    if (gameStarted) {
      const playerWithSameIp = players.find((player) => player.ip === ip);
      if (playerWithSameIp) {
        console.log(`O jogador ${socket.id} retornou ao jogo com o nome: ${playerName} e IP: ${ip}`);
        players = players.map((player) => (player.ip === ip && player.name === playerName) ? { ...player, id: socket.id, isActive: true } : player);
        console.table(players);
        socket.emit("gameJoined", {
          success: true,
          message: "Você voltou ao jogo!",
        });
        io.emit("players", players);
        io.emit("startedGame", gameBoard);
      } else {
        console.log(`O jogador ${socket.id} não pode entrar no jogo porque já começou`);
        socket.emit("gameJoined", {
          success: false,
          message: "O jogo já está cheio ou em andamento",
        });
      }   
    } else {
      console.log(`O jogador ${socket.id} entrou no jogo com o nome: ${playerName} e IP: ${ip}`);
      const newPlayer = { 
        id: socket.id, 
        name: playerName,
        score: 0, 
        acumulatedScore: 0,
        turn: false,
        isHost: players.length === 0,
        ip: ip,
        isActive: true,
        victories: 0
      };
      players.push(newPlayer);

      if (players.length === 1) {
        console.log(`O jogador ${socket.id} é o anfitrião`);
      }
      io.emit("players", players);
      socket.emit("gameJoined", {
        success: true,
        message: "Você entrou no jogo!",
      });
    }
  });

  //=============================================================================================================
  // START GAME
  //=============================================================================================================
  socket.on("startGame", (numberOfCards) => {
    if (players.length < 2) {
      console.log("O jogo não pode ser iniciado com menos de 2 jogadores");
      socket.emit("gameStarted", {
        success: false,
        message: "O jogo não pode ser iniciado com menos de 2 jogadores",
      });
    } else {
      gameStarted = true;
      maxCards = numberOfCards;
      const randonIndex = Math.floor(Math.random() * players.length);
      players = players.map((player, index) => ({
        ...player,
        turn: index === randonIndex,
      }));
      console.log(`Jogo iniciado com ${players.length} jogadores e índice aleatório: ${randonIndex}`);
      console.table(players);
      io.emit("players", players);
      initializeGameBoard();
      io.emit("startedGame", gameBoard);
    }
  });

  //=============================================================================================================
  // FLIP CARD
  //=============================================================================================================
  socket.on("flipCard", (cardIndex) => {
    console.log(`Carta virada: ${cardIndex}`);
    gameBoard = gameBoard.map((card) => (card.id === cardIndex ? { ...card, isFlipped: true } : card));
    if (gameBoard.filter((card) => card.isFlipped && !card.isMatched).length === 2) { // se encontrou duas cartas viradas e não combinadas
      const flippedCards = gameBoard.filter((card) => card.isFlipped && !card.isMatched);
      if (flippedCards[0].imageId === flippedCards[1].imageId) {
        console.log('Cartas combinadas:');
        console.table(flippedCards);
        gameBoard = gameBoard.map((card) =>
          flippedCards.some((flippedCard) => flippedCard.id === card.id) ? { ...card, isMatched: true } : card
        );
        players = players.map((player) => player.id === socket.id ? 
          { 
            ...player, 
            score: player.score + 1, 
            acumulatedScore: player.acumulatedScore + 1
          } 
          : 
          player
        );
        console.table(players);
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
            currentRound++;
            duplicates[0].victories++;
            duplicates[1].victories++;
            if (currentRound > maxRounds) {
              console.log("O jogo terminou");
              currentRound = 1;
              gameStarted = false;
              io.emit("gameFinished");
              io.emit("players", players);
              players = players.map((player) => ({
                ...player,
                score: 0,
                victories: 0
              }));
            } else {
              console.log(`Iniciando a rodada ${currentRound}`);
              initializeGameBoard();
              players = players.map((player) => ({ ...player, score: 0 }));
              console.table(players);
              io.emit("players", players);
              io.emit("startedGame", gameBoard);
              io.emit("gameTied", duplicates);
              io.emit("round", { currentRound, maxRounds });
            }
          } else {
            console.log("Há um vencedor");
            currentRound++;
            playerWithMaxScore.victories++;
            if (currentRound > maxRounds) {
              console.log("O jogo terminou");
              currentRound = 1;
              gameStarted = false;
              io.emit("gameFinished");
              io.emit("players", players);
              players = players.map((player) => ({
                ...player,
                score: 0,
                victories: 0
              }));
            } else {
              console.log(`Iniciando a rodada ${currentRound}`);
              initializeGameBoard();
              players = players.map((player) => ({ ...player, score: 0 }));
              console.table(players);
              io.emit("players", players);
              io.emit("startedGame", gameBoard);
              io.emit("gameWon", playerWithMaxScore);
              io.emit("round", { currentRound, maxRounds });
            }
          }
        }
      } else {
        console.log('As cartas viradas são diferentes:');
        console.table(flippedCards);
        io.emit("cardFlipped", {
          gameBoard: gameBoard,
          message: `${getPlayerName(socket.id)} errou!`,
          variant: 'error'
        });
        // resetar cartas viradas
        gameBoard = gameBoard.map((card) =>
          flippedCards.some((flippedCard) => flippedCard.id === card.id) ? { ...card, isFlipped: false } : card
        );
        passTheTurn(socket.id);
        console.table(players);
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

  //=============================================================================================================
  // DISCONNECT
  //=============================================================================================================
  socket.on("disconnect", () => {
    console.log(`Jogador desconectado: ${socket.id}`);
    const disconnectedPlayer = players.find((player) => player.id === socket.id);
    const activePlayers = players.filter((player) => player.isActive && player.id !== socket.id);
    if (!disconnectedPlayer) {
      return;
    }
    io.emit("playerLeft", players);
    if (activePlayers.length < 2) {
      gameStarted = false;
      players = [];
      gameBoard = [];
      gameStarted = false;
      maxCards = 0;
      currentRound = 1;
      console.log("O jogo foi interrompido porque não há jogadores suficientes");
      io.emit("gameStopped");
    } else if (disconnectedPlayer.turn && !disconnectedPlayer.isHost) {
      passTheTurn(disconnectedPlayer.id);
      console.log(`O jogador ${getPlayerName(socket.id)} desconectou e passou a vez`);
      io.emit("players", players);
    } else if (disconnectedPlayer.turn && disconnectedPlayer.isHost) {
      disconnectedPlayer.isHost = false;
      const newHost = players.find((player) => player.isActive);
      newHost.isHost = true;
      passTheTurn(disconnectedPlayer.id);
      console.log(`O jogador ${players[0].name} é o novo anfitrião`);
      io.emit("players", players);
    } else if (disconnectedPlayer.isHost) {
      disconnectedPlayer.isHost = false;
      const newHost = players.find((player) => player.isActive);
      newHost.isHost = true;
      console.log(`O jogador ${players[0].name} é o novo anfitrião`);
      io.emit("players", players);
    }
    console.table(players);
  });
});

server.listen(port, () =>
  console.log(`Servidor rodando em http://${getIp().split(": ")[1]}:${port}`)
);
