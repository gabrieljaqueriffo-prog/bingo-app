import { describe, expect, it } from "vitest";
import {
  canPlace,
  emptyBoard,
  placeShip,
  shoot,
  win,
  allSunk,
  SHIPS,
} from "./engine";

describe("colocación de barcos", () => {
  it("coloca un barco dentro del tablero", () => {
    let b = emptyBoard();
    b = placeShip(b, 0, 0, 3, true);
    expect(b[0][0]).toBe(3);
    expect(b[0][1]).toBe(3);
    expect(b[0][2]).toBe(3);
  });
  it("rechaza barco fuera de rango", () => {
    const b = emptyBoard();
    expect(placeShip(b, 5, 5, 3, true)).toBe(b); // cols 5..7 fuera
    expect(placeShip(b, 4, 0, 3, false)).toBe(b); // filas 4..6 fuera
  });
  it("rechaza superponer sobre una celda ocupada", () => {
    let b = placeShip(emptyBoard(), 0, 0, 3, true); // ocupa cols 0-2 de la fila 0
    const before = b;
    // intentamos superponer un barco horizontal en la misma fila, dentro del ocupado
    b = placeShip(b, 0, 1, 3, true); // cols 1-3, choca con el de cols 0-2
    expect(b).toBe(before);
    // uno separado, sí entra
    expect(canPlace(before, 0, 3, 1, true)).toBe(true);
  });
});

describe("disparos", () => {
  it("marca agua y falla", () => {
    const b = emptyBoard();
    const { board, result } = shoot(b, 2, 2);
    expect(result).toBe("miss");
    expect(board[2][2]).toBe(-1);
  });
  it("acierto en barco intacto", () => {
    const b = placeShip(emptyBoard(), 1, 1, 3, true);
    const { board, result } = shoot(b, 1, 2);
    expect(result).toBe("hit");
    expect(board[1][2]).toBe(-3);
  });
  it("detecta hundido en barco de tamaño 1", () => {
    let b = placeShip(emptyBoard(), 4, 0, 1, true);
    // dos barcos de tamaño 1 idénticos: asegurar que hundir uno no confunda con el otro
    b = placeShip(b, 5, 5, 1, true);
    const { result } = shoot(b, 4, 0);
    expect(result).toBe("sunk");
  });
  it("no toca una casilla ya disparada", () => {
    const b = emptyBoard();
    const first = shoot(b, 0, 0);
    const second = shoot(first.board, 0, 0);
    expect(second.board).toEqual(first.board);
  });
});

describe("victoria", () => {
  it("allSunk solo con todas las células <= 0", () => {
    const b = emptyBoard();
    expect(allSunk(b)).toBe(true);
    const withShip = placeShip(emptyBoard(), 0, 0, 2, true);
    expect(allSunk(withShip)).toBe(false);
  });
  it("win refleja allSunk", () => {
    expect(win(emptyBoard())).toBe(true);
    expect(win(placeShip(emptyBoard(), 0, 0, 1, true))).toBe(false);
  });
  it("la config de barcos es consistente", () => {
    const total = SHIPS.reduce((a, s) => a + s.size * s.count, 0);
    expect(total).toBe(3 + 2 + 1 + 1); // 7 celdas
  });
});