import { describe, expect, it } from "vitest";
import {
  COLS,
  ROWS,
  dropDisc,
  landingRow,
  startGame,
  type Board,
  type GameState,
} from "./engine";

describe("caída de fichas", () => {
  it("empieza con tablero vacío y turno del jugador 1", () => {
    const state = startGame();
    expect(state.board.flat().every((cell) => cell === 0)).toBe(true);
    expect(state.current).toBe(1);
    expect(state.phase).toBe("playing");
  });

  it("la primera ficha cae al fondo de la columna", () => {
    const next = dropDisc(startGame(), 3);
    expect(next.board[ROWS - 1][3]).toBe(1);
    expect(next.moves).toBe(1);
  });

  it("apila las fichas de una columna", () => {
    let state = startGame();
    state = dropDisc(state, 0);
    state = dropDisc(state, 0);
    state = dropDisc(state, 0);
    expect(state.board[ROWS - 1][0]).toBe(1);
    expect(state.board[ROWS - 2][0]).toBe(2);
    expect(state.board[ROWS - 3][0]).toBe(1);
  });

  it("alterna el turno entre jugadores", () => {
    let state = startGame();
    state = dropDisc(state, 0);
    expect(state.current).toBe(2);
    state = dropDisc(state, 1);
    expect(state.current).toBe(1);
  });

  it("rechaza soltar en columna llena sin cambiar el estado", () => {
    let state = startGame();
    for (let i = 0; i < ROWS; i++) state = dropDisc(state, 5);
    expect(dropDisc(state, 5)).toBe(state);
  });

  it("landingRow detecta la posición de caída y columnas inválidas", () => {
    const board: Board = Array.from({ length: ROWS }, () => Array<0 | 1 | 2>(COLS).fill(0));
    board[ROWS - 1][2] = 1;
    expect(landingRow(board, 2)).toBe(ROWS - 2);
    expect(landingRow(board, -1)).toBeNull();
    expect(landingRow(board, COLS)).toBeNull();
  });

  it("ignora columnas fuera del tablero", () => {
    const state = startGame();
    expect(dropDisc(state, -1)).toBe(state);
    expect(dropDisc(state, COLS)).toBe(state);
  });
});

describe("detección de victoria", () => {
  it("detecta cuatro en horizontal", () => {
    let state = startGame();
    const p1 = [0, 1, 2, 3];
    const p2 = [4, 5, 6];
    for (let i = 0; i < 3; i++) {
      state = dropDisc(state, p1[i]);
      state = dropDisc(state, p2[i]);
    }
    state = dropDisc(state, p1[3]); // cuarta ficha seguida de p1
    expect(state.phase).toBe("finished");
    expect(state.winner).toBe(1);
    expect(state.winningLine).toHaveLength(4);
    expect(new Set(state.winningLine!.map(([, c]) => c))).toEqual(new Set([0, 1, 2, 3]));
  });

  it("detecta cuatro en vertical", () => {
    let state = startGame();
    // p2 juega SIEMPRE lejos de la columna 2 para no interrumpir la pila.
    const otras = [0, 1, 3];
    for (let i = 0; i < 3; i++) {
      state = dropDisc(state, 2); // p1 apila en col 2
      state = dropDisc(state, otras[i]);
    }
    state = dropDisc(state, 2); // cuarta ficha consecutiva de p1
    expect(state.phase).toBe("finished");
    expect(state.winner).toBe(1);
    const rows = state.winningLine!.map(([r]) => r).sort((a, b) => a - b);
    expect(rows).toEqual([ROWS - 4, ROWS - 3, ROWS - 2, ROWS - 1]);
  });

  it("detecta cuatro en diagonal (barrido de partidas simuladas)", () => {
    // En partidas aleatorias aparecen líneas horizontales, verticales y diagonales:
    // validamos que TODA victoria tenga una línea ganadora coherente.
    let hayDiagonal = false;
    for (let attempt = 0; attempt < 400; attempt++) {
      let s = startGame();
      while (s.phase === "playing") s = dropDisc(s, Math.floor(Math.random() * COLS));
      if (s.winner === null) continue;
      const line = s.winningLine!;
      expect(line.length).toBeGreaterThanOrEqual(4);
      // todas las fichas de la línea son del ganador y son consecutivas
      for (const [r, c] of line) expect(s.board[r][c]).toBe(s.winner);
      if (line.length >= 4 && esDiagonal(line)) hayDiagonal = true;
    }
    expect(hayDiagonal).toBe(true);
  });

  const esDiagonal = (line: [number, number][]): boolean => {
    if (line.length < 3) return false;
    const sorted = [...line].sort((a, b) => a[0] - b[0]);
    const dr = Math.abs(sorted[1][0] - sorted[0][0]);
    const dc = Math.abs(sorted[1][1] - sorted[0][1]);
    return dr === 1 && dc === 1;
  };

  it("detecta victoria del jugador 2", () => {
    let state = startGame();
    // p1 juega disperso (sin llegar a 4 en fila) mientras p2 apila en col 6.
    const disperso = [0, 1, 2, 4];
    for (let i = 0; i < 3; i++) {
      state = dropDisc(state, disperso[i]);
      state = dropDisc(state, 6);
    }
    state = dropDisc(state, disperso[3]);
    state = dropDisc(state, 6); // cuarta ficha de p2
    expect(state.phase).toBe("finished");
    expect(state.winner).toBe(2);
  });

  it("no corta antes de tiempo una línea incompleta", () => {
    let state = startGame();
    state = dropDisc(state, 0);
    state = dropDisc(state, 1);
    state = dropDisc(state, 1);
    expect(state.phase).toBe("playing");
    expect(state.winner).toBeNull();
  });

  it("rechaza jugadas después de terminar", () => {
    let state = startGame();
    // p2 evita la columna 2 para permitir la vertical limpia de p1.
    const otras = [0, 1, 3];
    for (let i = 0; i < 3; i++) {
      state = dropDisc(state, 2);
      state = dropDisc(state, otras[i]);
    }
    state = dropDisc(state, 2); // gana p1 vertical
    expect(dropDisc(state, 0)).toBe(state);
  });
});

describe("fin de partida", () => {
  it("detecta empate en una partida completa sin ganador", () => {
    // En partidas aleatorias los empates (tablero lleno) ocurren con frecuencia:
    let empate: GameState | null = null;
    for (let attempt = 0; attempt < 20000 && !empate; attempt++) {
      let s = startGame();
      while (s.phase === "playing") s = dropDisc(s, Math.floor(Math.random() * COLS));
      if (s.phase === "finished" && s.winner === null && !s.draw) {
        throw new Error("partida terminada sin ganador debería ser empate");
      }
      if (s.draw) empate = s;
    }
    expect(empate).not.toBeNull();
    expect(empate!.moves).toBe(ROWS * COLS);
    expect(empate!.board.flat().every((cell) => cell !== 0)).toBe(true);
  });

  it("un ganador nunca se marca como empate", () => {
    for (let attempt = 0; attempt < 100; attempt++) {
      let s = startGame();
      while (s.phase === "playing") s = dropDisc(s, Math.floor(Math.random() * COLS));
      if (s.winner !== null) {
        expect(s.draw).toBe(false);
        expect(s.moves).toBeLessThan(ROWS * COLS);
        break;
      }
    }
  });
});


