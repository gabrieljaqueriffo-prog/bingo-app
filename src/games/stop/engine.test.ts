import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  LETTERS,
  normalizeWord,
  nextRound,
  pickLetter,
  resolveIfReady,
  scoreCategory,
  scoreRound,
  type StopData,
} from "./engine";

describe("normalización", () => {
  it("ignora mayúsculas y tildes al comparar", () => {
    expect(normalizeWord("  ÁRBOL ")).toBe(normalizeWord("arbol"));
    expect(scoreCategory("Maní", "MANI")).toEqual([5, 5]);
    expect(scoreCategory("Bélgica", "Belgica")).toEqual([5, 5]);
  });
});

describe("puntaje por categoría", () => {
  it("palabras distintas valen 10 cada una", () => {
    expect(scoreCategory("Bart", "Betty")).toEqual([10, 10]);
  });
  it("palabras repetidas valen 5 cada una", () => {
    expect(scoreCategory("Bruno", "bruno")).toEqual([5, 5]);
  });
  it("responder solo uno da 10 para quien completó", () => {
    expect(scoreCategory("Felipe", "")).toEqual([10, 0]);
    expect(scoreCategory("", "Gato")).toEqual([0, 10]);
  });
  it("ninguno respondió: cero puntos", () => {
    expect(scoreCategory("", "   ")).toEqual([0, 0]);
  });
});

describe("puntaje de ronda completa", () => {
  it("suma todas las categorías en orden", () => {
    const a = ["Ana", "Perro", "Pizza", "París", "Pelota", "Pablo"];
    const b = ["Ana", "", "Pera", "Portugal", "Pelota", "Pedro"];
    // a: 5 + 10 + 10 + 10 + 5 + 10 = 50 · b: 5 + 0 + 10 + 10 + 5 + 10 = 40
    expect(scoreRound(a, b)).toEqual([50, 40]);
  });
  it("tolera listas cortas o faltantes", () => {
    expect(scoreRound(["Loro"], [])).toEqual([10, 0]);
    expect(scoreRound([], [])).toEqual([0, 0]);
  });
});

describe("letras", () => {
  it("siempre devuelve letras del abecedario habilitado", () => {
    for (let i = 0; i < 50; i++) {
      expect(LETTERS).toContain(pickLetter());
    }
  });
});

describe("resolución de rondas", () => {
  const data = (overrides: Partial<StopData>): StopData => ({
    phase: "writing",
    round: 1,
    letter: "A",
    deadlineIso: new Date().toISOString(),
    entries: [null, null],
    scores: [0, 0],
    history: [],
    ...overrides,
  });

  it("no resuelve si falta entregar a un jugador", () => {
    expect(resolveIfReady(data({ entries: [["Animal"], null] }))).toMatchObject({ phase: "writing" });
  });
  it("al entregarse los dos calcula puntos, acumula y pasa a revisión", () => {
    const next = resolveIfReady(
      data({
        entries: [
          ["Ana", "Gato", "Guiso", "Roma", "Reloj", "Ricardo"],
          ["Ana", "Perro", "Guiso", "Rosario", "Remera", "Roberto"],
        ],
      }),
    );
    expect(next.phase).toBe("review");
    // Ana: 5+10+5+10+10+10 = 50 · Beto: 5+10+5+10+10+10 = 50
    expect(next.scores).toEqual([50, 50]);
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toMatchObject({ round: 1, letter: "A", s1: 50, s2: 50 });
  });
  it("nunca contabiliza la misma ronda dos veces", () => {
    const once = resolveIfReady(data({
      entries: [["x"], ["y"]],
    }));
    const twice = resolveIfReady(once);
    expect(twice.scores).toEqual(once.scores);
    expect(twice.history).toHaveLength(1);
  });
  it("nextRound avanza y limpia las respuestas", () => {
    const reviewed = resolveIfReady(data({
      entries: [["a"], ["b"]],
      letter: "C",
      round: 2,
    }));
    const next = nextRound(reviewed);
    expect(next.round).toBe(3);
    expect(next.phase).toBe("writing");
    expect(next.entries).toEqual([null, null]);
    expect(next.letter).not.toBe("");
    expect(next.scores).toEqual(reviewed.scores); // el acumulado no se toca
    expect(new Date(next.deadlineIso).getTime()).toBeGreaterThan(Date.now());
  });
});

