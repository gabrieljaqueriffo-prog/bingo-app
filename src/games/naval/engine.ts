// Motor puro de Batalla Naval para dos jugadores (tablero 6x6).
// Sin dependencias de React ni DOM para poder testearlo en aislamiento.

export const SIZE = 6;

// Tablero: 0 = agua sin disparar, -1 = agua disparada
//         1..N = casilla intacta de barco, -(1..N) = tocada.
export type Cell = number;
export type Board = number[][];

export const SHIPS: { size: number; count: number }[] = [
  { size: 3, count: 1 },
  { size: 2, count: 2 },
  { size: 1, count: 2 },
];

// Flota aplanada: [3, 2, 2, 1, 1] — 5 barcos, 9 casillas en total.
export const FLEET: number[] = SHIPS.flatMap((s) => Array<number>(s.count).fill(s.size));

export const SHIP_SIZE = (absCell: number): number => Math.abs(absCell);

export const emptyBoard = (): Board =>
  Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0));

export const inRange = (row: number, col: number): boolean =>
  row >= 0 && row < SIZE && col >= 0 && col < SIZE;

export const canPlace = (
  board: Board,
  row: number,
  col: number,
  size: number,
  horizontal: boolean,
): boolean => {
  if (horizontal) {
    if (col < 0 || col + size > SIZE) return false;
    for (let c = col; c < col + size; c++) if (board[row][c] !== 0) return false;
  } else {
    if (row < 0 || row + size > SIZE) return false;
    for (let r = row; r < row + size; r++) if (board[r][col] !== 0) return false;
  }
  return true;
};

export const placeShip = (
  board: Board,
  row: number,
  col: number,
  size: number,
  horizontal: boolean,
): Board => {
  if (!canPlace(board, row, col, size, horizontal)) return board;
  const next = board.map((cells) => [...cells]);
  if (horizontal) for (let c = col; c < col + size; c++) next[row][c] = size;
  else for (let r = row; r < row + size; r++) next[r][col] = size;
  return next;
};

// ¿Hay algún ORIGINAL (positivo) en la celda? (barco intacto)
export const isIntact = (board: Board, row: number, col: number): boolean =>
  board[row][col] > 0;

export type ShotResult = "hit" | "sunk" | "miss";

// Devuelve las casillas conectadas del barco que contiene (row, col),
// considerando células del mismo tamaño, tanto intactas como tocadas.
const component = (board: Board, row: number, col: number): number[] => {
  const size = Math.abs(board[row][col]);
  const out: number[] = [];
  const seen = new Set<string>();
  const stack = [{ r: row, c: col }];
  seen.add(`${row},${col}`);
  while (stack.length) {
    const { r, c } = stack.pop()!;
    out.push(board[r][c]);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && Math.abs(board[nr][nc]) === size && !seen.has(`${nr},${nc}`)) {
        seen.add(`${nr},${nc}`);
        stack.push({ r: nr, c: nc });
      }
    }
  }
  return out;
};

// Dispara. Devuelve el nuevo tablero y el resultado.
export const shoot = (board: Board, row: number, col: number): { board: Board; result: ShotResult } => {
  if (!inRange(row, col)) return { board, result: "miss" };
  const cell = board[row][col];
  const next = board.map((cells) => [...cells]);
  if (cell > 0) {
    // tocar barco intacto
    const neg = -cell;
    next[row][col] = neg;
    // ¿quedan casillas intactas (positivas) en su componente? si no, hundido
    const cellsSnapshot = component(next, row, col);
    const intact = cellsSnapshot.some((v) => v > 0);
    return { board: next, result: intact ? "hit" : "sunk" };
  }
  if (cell === 0) {
    next[row][col] = -1; // marca agua disparada
    return { board: next, result: "miss" };
  }
  // ya tocado o ya disparado: no cambia
  return { board: next, result: "miss" };
};

export const allSunk = (board: Board): boolean =>
  board.every((cells) => cells.every((v) => v <= 0));

// Ganó quien hundió TODO el tablero rival.
export const win = (board: Board): boolean => allSunk(board);

// --- Estado de la partida ---
export type Phase = "place" | "battle" | "finished";

export type LastShot = { by: 0 | 1; r: number; c: number; result: ShotResult } | null;

export type GameState = {
  boards: [Board, Board]; // [jugador0, jugador1]
  phase: Phase;
  turn: 0 | 1;
  winner: 0 | 1 | null;
  started: boolean; // true una vez que el invitado se unió
  placed: [boolean, boolean]; // ¿ya colocó su flota cada jugador?
  names: [string | null, string | null]; // nombre de cada jugador
  lastShot: LastShot; // último disparo, para el feedback del turno
};

export const startGame = (): GameState => ({
  boards: [emptyBoard(), emptyBoard()],
  phase: "place",
  turn: 0,
  winner: null,
  started: false,
  placed: [false, false],
  names: [null, null],
  lastShot: null,
});

// Coloca la flota completa al azar (para el botón "Aleatorio" y el rival).
export const randomBoard = (): Board => {
  for (let attempt = 0; attempt < 200; attempt++) {
    let b = emptyBoard();
    let ok = true;
    for (const size of FLEET) {
      let done = false;
      for (let tries = 0; tries < 100 && !done; tries++) {
        const row = Math.floor(Math.random() * SIZE);
        const col = Math.floor(Math.random() * SIZE);
        const h = Math.random() < 0.5;
        if (canPlace(b, row, col, size, h)) {
          // evitamos barcos pegados (regla clásica: hay agua entre barcos)
          if (hasNeighbor(b, row, col, size, h)) continue;
          b = placeShip(b, row, col, size, h);
          done = true;
        }
      }
      if (!done) { ok = false; break; }
    }
    if (ok) return b;
  }
  // fallback casi imposible: sin separación
  let b = emptyBoard();
  for (const size of FLEET) {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        for (const h of [true, false]) {
          if (canPlace(b, row, col, size, h)) {
            b = placeShip(b, row, col, size, h);
            row = SIZE; col = SIZE;
          }
        }
      }
    }
  }
  return b;
};

// ¿Hay barcos (de cualquier tamaño) en las 8 casillas alrededor del lugar?
export const hasNeighbor = (
  board: Board,
  row: number,
  col: number,
  size: number,
  horizontal: boolean,
): boolean => {
  const cells: [number, number][] = [];
  for (let i = 0; i < size; i++) cells.push(horizontal ? [row, col + i] : [row + i, col]);
  for (const [r, c] of cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (inRange(nr, nc) && board[nr][nc] !== 0) return true;
      }
    }
  }
  return false;
};

// Cantidad de barcos hundidos y totales en un tablero (para el marcador).
export const fleetStatus = (board: Board): { sunk: number; total: number } => {
  const seen = new Set<string>();
  let sunk = 0;
  let total = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c];
      if (v === 0 || seen.has(`${r},${c}`)) continue;
      const cells = component(board, r, c);
      // marcamos todas las casillas del barco como visitadas
      const stack = [[r, c]];
      seen.add(`${r},${c}`);
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] !== 0 && !seen.has(`${nr},${nc}`) && Math.abs(board[nr][nc]) === Math.abs(v)) {
            seen.add(`${nr},${nc}`);
            stack.push([nr, nc]);
          }
        }
      }
      total += 1;
      if (cells.every((x) => x < 0)) sunk += 1;
    }
  }
  return { sunk, total };
};

// Lista de lugares para una partida por defecto (sin confianza en auto-setup).
export const defaultPlacements0: { row: number; col: number; size: number; h: boolean }[] = [
  { row: 0, col: 0, size: 3, h: true },
  { row: 2, col: 2, size: 2, h: false },
  { row: 4, col: 0, size: 1, h: true },
  { row: 4, col: 5, size: 1, h: true },
];
export const defaultPlacements1: typeof defaultPlacements0 = [
  { row: 5, col: 0, size: 3, h: true },
  { row: 2, col: 4, size: 2, h: false },
  { row: 0, col: 0, size: 1, h: true },
  { row: 0, col: 5, size: 1, h: true },
];

export const placeAll = (
  state: GameState,
  player: 0 | 1,
  placements: { row: number; col: number; size: number; h: boolean }[],
): Board => {
  let b = emptyBoard();
  for (const p of placements) b = placeShip(b, p.row, p.col, p.size, p.h);
  return b;
};