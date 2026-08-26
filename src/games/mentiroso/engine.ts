// Motor puro del Mentiroso (Dados / Dudo / Perpero).
// Sin dependencias de React, IndexedDB ni DOM para poder testearlo en aislamiento.

export type Face = 1 | 2 | 3 | 4 | 5 | 6;
export type Die = Face;

export type Player = {
  id: string;
  name: string;
  dice: Die[];        // dados restantes en juego (0 a 5)
  cup: Die[] | null;  // dados recién tirados (ocultos para el rival), null entre turnos
};

export type Bid = {
  playerId: string;
  quantity: number;   // cantidad total afirmada (≥1)
  face: Face;         // cara apostada (1..6)
};

export type Challenge = {
  challengerId: string;
  bidderId: string;   // id del jugador cuya apuesta se cuestiona
  bid: Bid;
  actualCount: number;
  truthful: boolean;  // true = la apuesta era cierta o superior
  loserId: string;    // jugador que pierde un dado
  reveal: Record<string, Die[]>; // dados de cada jugador al momento de la duda
};

export type Phase = "rolling" | "bidding" | "reveal" | "finished";

export type GameState = {
  players: Player[];
  currentBid: Bid | null;
  currentPlayerId: string;
  phase: Phase;
  log: string[];                 // mensajes legibles para mostrar al usuario
  lastChallenge: Challenge | null;
  winnerId: string | null;       // id del ganador cuando phase === "finished"
  history: Bid[];                // apuestas realizadas (sin contar dudas)
};

export const DICE_PER_PLAYER = 5;
export const TOTAL_PLAYERS = 2;

// --- Tirada de dados ----------------------------------------------------

export const rollDie = (): Die => (Math.floor(Math.random() * 6) + 1) as Die;

export const rollCup = (count: number): Die[] => {
  if (count < 0) return [];
  return Array.from({ length: count }, () => rollDie());
};

export const createPlayer = (id: string, name: string, dice: Die[] = []): Player => ({
  id,
  name,
  dice,
  cup: null,
});

// --- Reglas de validez de apuestas -------------------------------------

// Una apuesta (q1, f1) es vencida por (q2, f2) si:
//   - más cantidad con la misma cara:  q2 > q1 && f2 === f1
//   - misma cantidad con cara mayor:   q2 === q1 && f2 > f1
export const isValidBid = (next: Bid, current: Bid | null): boolean => {
  if (next.quantity < 1) return false;
  if (next.face < 1 || next.face > 6) return false;
  if (!current) return true;
  if (next.quantity > current.quantity && next.face === current.face) return true;
  if (next.quantity === current.quantity && next.face > current.face) return true;
  return false;
};

// Conteo "real" de una cara en la mesa, con Ases (1) como comodín.
// Si face === 1, todos los Ases cuentan como 1 (ya están incluidos).
// Para cualquier otra cara, los Ases cuentan también como si fueran esa cara.
export const countFace = (allDice: Die[], face: Face): number => {
  return allDice.reduce((acc, die) => {
    if (die === face) return acc + 1;
    if (die === 1 && face !== 1) return acc + 1; // As comodín
    return acc;
  }, 0);
};

export const totalDice = (state: GameState): number =>
  state.players.reduce((acc, p) => acc + p.dice.length, 0);

export const allDice = (state: GameState): Die[] =>
  state.players.flatMap((p) => p.dice);

// --- Transiciones de estado -------------------------------------------

export const startGame = (playerNames: [string, string]): GameState => {
  const players = playerNames.map((name, index) => {
    const initial = createPlayer(`p${index + 1}`, name, rollCup(DICE_PER_PLAYER));
    return { ...initial, cup: initial.dice };
  });
  return {
    players,
    currentBid: null,
    currentPlayerId: players[0].id,
    phase: "rolling",
    log: [`Empieza la partida. ${players[0].name} tira primero.`],
    lastChallenge: null,
    winnerId: null,
    history: [],
  };
};

export const reroll = (state: GameState, playerId: string): GameState => {
  if (state.phase !== "rolling") return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.id !== state.currentPlayerId) return state;
  const newDice = rollCup(player.dice.length);
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, dice: [...newDice], cup: [...newDice] } : p,
    ),
    phase: "bidding",
    log: [...state.log, `${player.name} tira ${newDice.join(" ")}.`],
  };
};

// Alias para cuando ya entran a "bidding" tras startGame
export const enterBidding = (state: GameState): GameState => {
  if (state.phase !== "rolling") return state;
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, cup: p.cup ? [...p.cup] : p.cup })),
    phase: "bidding",
  };
};

export const placeBid = (state: GameState, bid: Bid): GameState => {
  if (state.phase !== "bidding") return state;
  if (bid.playerId !== state.currentPlayerId) return state;
  if (!isValidBid(bid, state.currentBid)) return state;
  const nextPlayerId = state.players.find((p) => p.id !== state.currentPlayerId)!.id;
  const player = state.players.find((p) => p.id === bid.playerId)!;
  return {
    ...state,
    currentBid: { ...bid },
    currentPlayerId: nextPlayerId,
    history: [...state.history, { ...bid }],
    log: [
      ...state.log,
      `${player.name} apuesta: hay al menos ${bid.quantity} dado${bid.quantity === 1 ? "" : "s"} de valor ${bid.face}.`,
    ],
  };
};

export const challenge = (state: GameState, challengerId: string): GameState => {
  if (state.phase !== "bidding" || !state.currentBid) return state;
  if (challengerId !== state.currentPlayerId) return state; // solo el rival puede dudar
  const bid = state.currentBid;
  const actual = countFace(allDice(state), bid.face);
  const truthful = actual >= bid.quantity;
  const bidder = state.players.find((p) => p.id === bid.playerId)!;
  const challenger = state.players.find((p) => p.id === challengerId)!;
  const loserId = truthful ? challenger.id : bidder.id;
  const reveal: Record<string, Die[]> = {};
  state.players.forEach((p) => {
    reveal[p.id] = [...p.dice];
  });
  const challengeRecord: Challenge = {
    challengerId,
    bidderId: bid.playerId,
    bid,
    actualCount: actual,
    truthful,
    loserId,
    reveal,
  };
  const updatedPlayers = state.players.map((p) => {
    if (p.id !== loserId) return p;
    return { ...p, dice: p.dice.slice(0, -1), cup: null };
  });
  const log = [
    ...state.log,
    `${challenger.name} duda de la apuesta de ${bidder.name}.`,
    `Había ${actual} dado${actual === 1 ? "" : "s"} de valor ${bid.face}. ${truthful ? "La apuesta era cierta" : "La apuesta era falsa"}, pierde ${(loserId === bidder.id ? bidder : challenger).name}.`,
  ];
  if (updatedPlayers.some((p) => p.dice.length === 0)) {
    const survivor = updatedPlayers.find((p) => p.dice.length > 0) ?? null;
    return {
      ...state,
      players: updatedPlayers,
      phase: "finished",
      log,
      lastChallenge: challengeRecord,
      winnerId: survivor?.id ?? null,
    };
  }
  // Quien tira después de la duda: si la apuesta era cierta, sigue el que apostó;
  // si era falsa, tira el que dudó (porque perdió).
  // Los vasos quedan vacíos: cada jugador vuelve a tirar desde la fase "rolling".
  const nextRollerId = truthful ? bidder.id : challenger.id;
  return {
    ...state,
    players: updatedPlayers.map((p) => ({ ...p, cup: null })),
    currentBid: null,
    currentPlayerId: nextRollerId,
    phase: "rolling",
    log,
    lastChallenge: challengeRecord,
  };
};

// Utilidad para tests / UI: detectar si el jugador actual es el del turno.
export const isCurrentPlayer = (state: GameState, playerId: string): boolean =>
  state.currentPlayerId === playerId;

// Helper para tests deterministas.
export const gameStateForTest = (overrides: Partial<GameState>): GameState => {
  const base = startGame(["A", "B"]);
  return { ...base, ...overrides };
};
