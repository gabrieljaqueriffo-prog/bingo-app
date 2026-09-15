// Test de regresión del bug online "la caja no se mueve" y de la reja que se
// cerraba (había que quedarse pisando la placa).
//
// Cubre las DOS mitades del problema:
//  1. El motor empuja la caja cuando caminás contra ella.
//  2. La posición de la caja y el latch de la reja SOBREVIVEN el ciclo online
//     tick -> commit (mergeBrosStates) -> reconciliación, y el otro jugador ve
//     lo que el empujador hizo.
import { describe, expect, it } from "vitest";
import {
  applyGravity,
  applyInput,
  createInitialGameState,
  crate,
  gateOpen,
  groundSegment,
  GROUND_Y,
  latchGate,
  platePressed,
  pushCrates,
  resolveCollisions,
  storyStage,
  type BrosGameState,
  type BrosPlayer,
  type BrosTile,
} from "./engine";
import { mergeBrosStates } from "./remote";
import "./stages";

const crateOf = (tiles: BrosTile[]): BrosTile => tiles.find((t) => t.type === "crate")!;

// Reconciliación de tiles idéntica a la de BrosAppV2 (por índice + autoridad
// del empujador para las cajas + latch pegado para las rejas).
const reconcileTiles = (local: BrosGameState, db: BrosGameState, meId: "red" | "blue"): BrosTile[] => {
  const me = local.players.find((p) => p.id === meId);
  const nearCrate = (c: BrosTile): boolean => {
    if (!me || me.carriedBy) return false;
    const dx = me.x + me.width < c.x ? c.x - (me.x + me.width) : me.x > c.x + c.w ? me.x - (c.x + c.w) : 0;
    const dy = me.y + me.height < c.y ? c.y - (me.y + me.height) : me.y > c.y + c.h ? me.y - (c.y + c.h) : 0;
    return dx <= 14 && dy <= 20;
  };
  return db.tiles.map((rt, i) => {
    const lt = local.tiles[i];
    if (!lt || lt.type !== rt.type) return rt;
    if (rt.type === "crate") return nearCrate(lt) ? lt : rt;
    if (rt.type === "gate") return lt.latched ? { ...rt, latched: true } : rt;
    return lt.collected ? { ...rt, collected: true } : rt;
  });
};

// Un frame del tick online de MI jugador (mismo orden de llamadas que la app).
const tickOne = (g: BrosGameState, meId: "red" | "blue", dir: number): BrosGameState => {
  const dirs: Partial<Record<"red" | "blue", number>> = { [meId]: dir };
  const players = g.players.map((p) => {
    if (p.id !== meId) return p;
    let np: BrosPlayer = dir ? applyInput(p, dir > 0 ? "right" : "left") : applyInput(p, "stop");
    np = applyGravity(np);
    np = resolveCollisions(np, g.tiles, g.players, { coop: true });
    return { ...np, x: np.x + np.vx, y: np.y + np.vy };
  });
  const pushed = pushCrates(players, g.tiles, dirs);
  return { ...g, players: pushed.players, tiles: pushed.tiles };
};

const standAt = (g: BrosGameState, id: "red" | "blue", x: number, y: number): BrosGameState => ({
  ...g,
  players: g.players.map((p) => (p.id === id ? { ...p, x, y, vx: 0, vy: 0, onGround: true } : p)),
});

describe("caja empujable", () => {
  it("caminar contra la caja la empuja (motor)", () => {
    const tiles: BrosTile[] = [...groundSegment(0, 1000), crate(300, GROUND_Y - 36)];
    let players: BrosPlayer[] = [{ ...createInitialGameState("story").players[0], x: 220, y: GROUND_Y - 48, onGround: true }];
    for (let i = 0; i < 60; i++) {
      let p = applyInput(players[0], "right");
      p = applyGravity(p);
      p = resolveCollisions(p, tiles, players, { coop: true });
      p = { ...p, x: p.x + p.vx, y: p.y + p.vy };
      players = [p];
      const pushed = pushCrates(players, tiles, { red: 1 });
      players = pushed.players;
      tiles.splice(0, tiles.length, ...pushed.tiles);
    }
    expect(crateOf(tiles).x).toBeGreaterThan(300);
  });

  it("la caja se mueve aunque el jugador esté unos px separado (ventana amplia)", () => {
    const tiles: BrosTile[] = [...groundSegment(0, 1000), crate(300, GROUND_Y - 36)];
    const me: BrosPlayer = { ...createInitialGameState("story").players[0], x: 300 - 30 - 3, y: GROUND_Y - 48, onGround: true };
    const pushed = pushCrates([me], tiles, { red: 1 });
    expect(crateOf(pushed.tiles).x).toBe(300 + 3); // PUSH_SPEED = 3
  });
});
describe("sincronización online de la caja y la reja", () => {
  it("el empuje SOBREVIVE el ciclo commit + reconciliación y el rival lo ve", () => {
    const start = createInitialGameState("story");
    const spawn = crateOf(start.tiles).x;
    let red: BrosGameState = standAt({ ...start, tiles: start.tiles.map((t) => ({ ...t })) }, "red", spawn - 60, GROUND_Y - 48);
    let db: BrosGameState = { ...start, tiles: start.tiles.map((t) => ({ ...t })) };

    for (let frame = 0; frame < 120; frame++) {
      red = tickOne(red, "red", 1);
      if (frame % 8 === 0) {
        db = mergeBrosStates(red, db, "red"); // commit del host
        red.tiles = reconcileTiles(red, db, "red"); // reconciliación del host
      }
    }
    const redCrate = crateOf(red.tiles).x;
    const dbCrate = crateOf(db.tiles).x;
    const blueSees = crateOf(
      reconcileTiles({ ...start, tiles: start.tiles.map((t) => ({ ...t })) }, db, "blue"),
    ).x;
    expect(redCrate).toBeGreaterThan(spawn); // se movió de verdad
    expect(dbCrate).toBe(redCrate); // viajó a la BD
    expect(blueSees).toBe(redCrate); // y el rival lo ve igual
  });

  it("la reja NO se cierra: el latch sobrevive el merge (nadie queda encerrado)", () => {
    const start = createInitialGameState("story");
    const local: BrosGameState = {
      ...start,
      tiles: start.tiles.map((t) => (t.type === "gate" && t.pair === 1 ? { ...t, latched: true } : t)),
    };
    const db: BrosGameState = { ...start, tiles: start.tiles.map((t) => ({ ...t })) }; // BD sin latch
    const merged = mergeBrosStates(local, db, "red");
    const gate = merged.tiles.find((t) => t.type === "gate" && t.pair === 1)!;
    expect(gate.latched).toBe(true);
    expect(gateOpen(merged.tiles, 1, start.players)).toBe(true); // abierta sin nadie pisando
  });
});

describe("puzzle de la placa 2P (Etapa 1)", () => {
  it("caja + jugador sobre la placa la abre, y con latch queda abierta para siempre", () => {
    const stage = storyStage(0)!;
    const plate = stage.tiles.find((t) => t.type === "plate" && t.pair === 1)!;
    // Caja apoyada en la placa (1 peso) + un jugador encima (2 pesos) = abre.
    const withCrate = stage.tiles.map((t) =>
      t.type === "crate" ? { ...t, x: plate.x + 10, y: GROUND_Y - t.h } : { ...t },
    );
    const onPlate: BrosPlayer[] = createInitialGameState("story").players.map((p, i) =>
      i === 0 ? { ...p, x: plate.x + 44, y: plate.y - p.height, onGround: true } : p,
    );
    expect(platePressed(withCrate, 1, onPlate)).toBe(true);
    expect(gateOpen(withCrate, 1, onPlate)).toBe(true);
    // Al trabarse, el jugador se puede bajar: sigue abierta para los dos.
    const latched = latchGate(withCrate, 1);
    const bothOff: BrosPlayer[] = onPlate.map((p) => ({ ...p, x: 0 }));
    expect(gateOpen(latched, 1, bothOff)).toBe(true);
  });
});