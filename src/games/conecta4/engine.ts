// Motor puro de Conecta 4 (4 en línea).
// Sin dependencias de React ni DOM para poder testearlo en aislamiento.

export type Disc = 0 | 1 | 2; // 0 = celda vacía
export type Board = Disc[][]; // board[fila][columna]; fila 0 es la visual más alta

export const ROWS = 6;
export const COLS = 7;
export const CONNECT = 4;

export type LineCell = [number, number]; // [fila, columna]

export type GameState = {
  board: Board;
  current: 1 | 2;
  phase: "playing" | "finished";
  winner: Disc | null;   // 1 o 2 cuando hay ganador; null si empate o en juego
  draw: boolean;         // tablero lleno sin ganador
  winningLine: LineCell[] | null; // las 4+ fichas ganadoras, para resaltarlas
  moves: number;
};

export const startGame = (): GameState => ({
  board: Array.from({ length: ROWS }, () => Array<Disc>(COLS).fill(0)),
  current: 1,
  phase: "playing",
  winner: null,
  draw: false,
  winningLine: null,
  moves: 0,
});

export const columnFull = (state: GameState, col: number): boolean =>
  col < 0 || col >= COLS || state.board[0][col] !== 0;

// Fila donde cae la ficha al soltarla en `col` (null si la columna está llena).
export const landingRow = (board: Board, col: number): number | null => {
  if (col < 0 || col >= COLS) return null;
  for (let row = ROWS - 1; row >= 0; row--) {
    if (board[row][col] === 0) return row;
  }
  return null;
};

// Busca una línea de CONNECT fichas del mismo jugador pasando por (row, col).
const findLineThrough = (
  board: Board,
  player: 1 | 2,
  row: number,
  col: number,
): LineCell[] | null => {
  const directions: [number, number][] = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal ↘
    [1, -1], // diagonal ↙
  ];
  for (const [dr, dc] of directions) {
    const line: LineCell[] = [[row, col]];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
        line.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= CONNECT) return line;
  }
  return null;
};

// Suelta una ficha del jugador actual en `col`. Devuelve el mismo estado si el movimiento no es válido.
export const dropDisc = (state: GameState, col: number): GameState => {
  if (state.phase !== "playing") return state;
  const row = landingRow(state.board, col);
  if (row === null) return state;

  const player = state.current;
  const board = state.board.map((cells, r) =>
    r === row ? (cells.map((cell, c) => (c === col ? player : cell)) as Board[number]) : cells,
  );
  const moves = state.moves + 1;
  const line = findLineThrough(board, player, row, col);
  if (line) {
    return { ...state, board, current: player, phase: "finished", winner: player, winningLine: line, moves };
  }
  if (moves === ROWS * COLS) {
    return { ...state, board, phase: "finished", winner: null, draw: true, moves };
  }
  return { ...state, board, current: player === 1 ? 2 : 1, moves };
};
