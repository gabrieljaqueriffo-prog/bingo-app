import { describe, expect, it, vi } from "vitest";
import {
  TOTAL_PLAYERS,
  challenge,
  countFace,
  createPlayer,
  enterBidding,
  gameStateForTest,
  isValidBid,
  placeBid,
  reroll,
  rollCup,
  startGame,
} from "./engine";
import type { Bid, GameState, Player } from "./engine";

const hand = (...values: number[]) => values as Player["dice"];

describe("dados y conteo", () => {
  it("tira la cantidad solicitada de dados", () => {
    const cup = rollCup(5);
    expect(cup).toHaveLength(5);
    cup.forEach((d) => expect(d).toBeGreaterThanOrEqual(1));
  });
  it("cuenta los Ases como su propio valor", () => {
    expect(countFace(hand(1, 1, 2, 3, 4), 1)).toBe(2);
  });
  it("cuenta los Ases como comodín para otras caras", () => {
    expect(countFace(hand(1, 1, 1, 5, 6), 5)).toBe(4);
    expect(countFace(hand(1, 2, 3, 4, 5), 2)).toBe(2);
  });
  it("no cuenta Ases como comodín cuando se busca Ases", () => {
    expect(countFace(hand(1, 1, 1, 1, 1), 1)).toBe(5);
  });
});

describe("validez de apuestas", () => {
  it("acepta la primera apuesta sin restricciones", () => {
    expect(isValidBid({ playerId: "p1", quantity: 3, face: 4 }, null)).toBe(true);
  });
  it("permite subir cantidad con misma cara", () => {
    const prev: Bid = { playerId: "p1", quantity: 3, face: 4 };
    expect(isValidBid({ playerId: "p2", quantity: 4, face: 4 }, prev)).toBe(true);
  });
  it("permite misma cantidad con cara mayor", () => {
    const prev: Bid = { playerId: "p1", quantity: 3, face: 4 };
    expect(isValidBid({ playerId: "p2", quantity: 3, face: 5 }, prev)).toBe(true);
  });
  it("rechaza apuestas que no suben", () => {
    const prev: Bid = { playerId: "p1", quantity: 3, face: 4 };
    expect(isValidBid({ playerId: "p2", quantity: 2, face: 4 }, prev)).toBe(false);
    expect(isValidBid({ playerId: "p2", quantity: 3, face: 3 }, prev)).toBe(false);
    expect(isValidBid({ playerId: "p2", quantity: 3, face: 4 }, prev)).toBe(false);
  });
  it("rechaza apuestas inválidas por cara o cantidad", () => {
    expect(isValidBid({ playerId: "p1", quantity: 0, face: 4 } as Bid, null)).toBe(false);
    expect(isValidBid({ playerId: "p1", quantity: 3, face: 7 } as unknown as Bid, null)).toBe(false);
  });
});

describe("inicio de partida", () => {
  it("crea dos jugadores con 5 dados cada uno", () => {
    const state = startGame(["Ana", "Beto"]);
    expect(state.players).toHaveLength(TOTAL_PLAYERS);
    state.players.forEach((p) => {
      expect(p.dice).toHaveLength(5);
      expect(p.cup).toHaveLength(5);
    });
    expect(state.phase).toBe("rolling");
    expect(state.currentPlayerId).toBe(state.players[0].id);
  });
  it("reparte el primer turno y deja log inicial", () => {
    const state = startGame(["Ana", "Beto"]);
    expect(state.log[0]).toContain("Ana");
  });
});

describe("flujo de tirada y apuesta", () => {
  it("pasa de rolling a bidding al rerollear", () => {
    const state = startGame(["Ana", "Beto"]);
    const next = reroll(state, state.currentPlayerId);
    expect(next.phase).toBe("bidding");
    expect(next.players[0].cup).toHaveLength(5);
  });
  it("rechaza reroll de quien no tiene el turno", () => {
    const state = startGame(["Ana", "Beto"]);
    const other = state.players[1].id;
    const next = reroll(state, other);
    expect(next).toBe(state);
  });
  it("alterna el turno al apostar y guarda historial", () => {
    let state = startGame(["Ana", "Beto"]);
    state = reroll(state, state.currentPlayerId);
    const me = state.currentPlayerId;
    const other = state.players.find((p) => p.id !== me)!.id;
    const bid: Bid = { playerId: me, quantity: 3, face: 4 };
    state = placeBid(state, bid);
    expect(state.currentPlayerId).toBe(other);
    expect(state.history).toHaveLength(1);
  });
  it("rechaza apuestas que no superan la anterior", () => {
    let state = startGame(["Ana", "Beto"]);
    state = reroll(state, state.currentPlayerId);
    const me = state.currentPlayerId;
    state = placeBid(state, { playerId: me, quantity: 3, face: 4 });
    const other = state.currentPlayerId;
    const bad = placeBid(state, { playerId: other, quantity: 3, face: 4 });
    expect(bad).toBe(state);
  });
});

describe("resolución de dudas", () => {
  it("apuesta cierta: pierde el que duda", () => {
    const state: GameState = gameStateForTest({
      players: [
        createPlayer("p1", "Ana", hand(3, 3, 2, 6, 1)),
        createPlayer("p2", "Beto", hand(4, 5, 1, 2, 6)),
      ],
      currentPlayerId: "p2",
      currentBid: { playerId: "p1", quantity: 4, face: 3 },
      phase: "bidding",
    });
    const next = challenge(state, "p2");
    // Hay 2 doses + 2 ases contables como 3 = 4. Apuesta era 4, hay 4 => truthful
    expect(next.lastChallenge?.truthful).toBe(true);
    expect(next.lastChallenge?.loserId).toBe("p2");
    // Beto (p2) perdió un dado: 5 -> 4
    expect(next.players.find((p) => p.id === "p2")!.dice).toHaveLength(4);
  });
  it("apuesta falsa: pierde el que apostó", () => {
    const state: GameState = gameStateForTest({
      players: [
        createPlayer("p1", "Ana", hand(3, 5, 2, 6, 1)),
        createPlayer("p2", "Beto", hand(4, 5, 6, 2, 6)),
      ],
      currentPlayerId: "p2",
      currentBid: { playerId: "p1", quantity: 5, face: 6 },
      phase: "bidding",
    });
    const next = challenge(state, "p2");
    expect(next.lastChallenge?.truthful).toBe(false);
    expect(next.lastChallenge?.loserId).toBe("p1");
    expect(next.players.find((p) => p.id === "p1")!.dice).toHaveLength(4);
  });
  it("termina la partida cuando alguien pierde su último dado", () => {
    // Ana (p1) tiene 1 solo dado, Beto (p2) tiene 5. Apuesta imposible: 99 doses.
    // p1 pierde el único dado, gana p2.
    const state: GameState = gameStateForTest({
      players: [
        createPlayer("p1", "Ana", hand(3)),
        createPlayer("p2", "Beto", hand(4, 5, 1, 2, 6)),
      ],
      currentPlayerId: "p2",
      currentBid: { playerId: "p1", quantity: 99, face: 3 },
      phase: "bidding",
    });
    const next = challenge(state, "p2");
    expect(next.phase).toBe("finished");
    expect(next.winnerId).toBe("p2");
  });
  it("rechaza dudas de quien no tiene el turno", () => {
    const state: GameState = gameStateForTest({
      players: [
        createPlayer("p1", "Ana", hand(3, 3, 2, 6, 1)),
        createPlayer("p2", "Beto", hand(4, 5, 1, 2, 6)),
      ],
      currentPlayerId: "p2",
      currentBid: { playerId: "p1", quantity: 4, face: 3 },
      phase: "bidding",
    });
    const same = challenge(state, "p1");
    expect(same).toBe(state);
  });
  it("enterBidding solo aplica en fase rolling", () => {
    const state: GameState = gameStateForTest({ phase: "bidding" });
    expect(enterBidding(state)).toBe(state);
  });
});

describe("sincronización dice/cup (regresión)", () => {
  // Math.random() = 0.99 => floor(0.99*6)+1 = 6 en cada tirada
  const rollAllSixes = () => vi.spyOn(Math, "random").mockReturnValue(0.99);

  it("reroll actualiza dice y cup con la misma tirada", () => {
    const spy = rollAllSixes();
    try {
      const state = startGame(["Ana", "Beto"]);
      const next = reroll(state, state.currentPlayerId);
      expect(next.players[0].dice.every((d) => d === 6)).toBe(true);
      expect(next.players[0].cup?.every((d) => d === 6)).toBe(true);
      expect(next.players[1].dice).toHaveLength(5);
    } finally {
      spy.mockRestore();
    }
  });

  it("una duda se resuelve con los dados recién tirados, no con los viejos", () => {
    // Primeras 10 tiradas (reparto inicial de ambos jugadores): todo 2.
    // Tiradas siguientes (reroll de Ana): todo 6.
    let calls = 0;
    const spy = vi.spyOn(Math, "random").mockImplementation(() => (++calls <= 10 ? 0.25 : 0.99));
    try {
      let state = startGame(["Ana", "Beto"]);
      state = reroll(state, state.currentPlayerId); // Ana tira cinco 6
      const anaId = state.currentPlayerId;
      state = placeBid(state, { playerId: anaId, quantity: 3, face: 6 });
      state = challenge(state, "p2"); // Beto duda
      expect(state.lastChallenge).not.toBeNull();
      // En mesa hay cinco 6 (Ana) y cero 6 entre los doses viejos de Beto:
      expect(state.lastChallenge!.actualCount).toBe(5);
      expect(state.lastChallenge!.truthful).toBe(true);
      expect(state.lastChallenge!.loserId).toBe("p2");
      // El revelado muestra las tiradas vigentes de cada uno
      expect(state.lastChallenge!.reveal["p1"].every((d) => d === 6)).toBe(true);
      expect(state.lastChallenge!.reveal["p2"].every((d) => d === 2)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("después de una duda los vasos quedan vacíos para volver a tirar", () => {
    const state: GameState = gameStateForTest({
      players: [
        createPlayer("p1", "Ana", hand(3, 3, 2, 6, 1)),
        createPlayer("p2", "Beto", hand(4, 5, 1, 2, 6)),
      ],
      currentPlayerId: "p2",
      currentBid: { playerId: "p1", quantity: 4, face: 3 },
      phase: "bidding",
    });
    const next = challenge(state, "p2");
    if (next.phase === "rolling") {
      next.players.forEach((p) => {
        expect(p.cup).toBeNull();
      });
    }
  });
});
