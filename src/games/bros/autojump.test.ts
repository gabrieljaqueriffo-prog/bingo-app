import { describe, expect, it } from "vitest";
import {
  applyInput, applyGravity, resolveCollisions, stompEnemy, updateEnemies, tickThief,
  createInitialGameState, hitBlock, collectFeather, tickFly,
  block, feather, stageCoinsLeft, stageCoinsTotal,
  FLY_FRAMES, FLY_SPEED,
  type BrosPlayer,
} from "./engine";
import "./stages";

describe("Poderes y descubrimiento estilo Mario", () => {
  const player = (over: Partial<BrosPlayer> = {}): BrosPlayer => ({
    id: "red", x: 100, y: 200, vx: 0, vy: 0, onGround: false, facing: "right",
    lives: 3, coins: 0, width: 30, height: 48, jumped: false, anim: 0, coyote: 0, shields: 0,
    ...over,
  });

  it("recoger una pluma otorga el poder de volar", () => {
    const f = feather(100, 220);
    const r = collectFeather(player({ x: 90 }), [f]);
    expect(r.player.fly).toBe(true);
    expect(r.player.flyT).toBe(FLY_FRAMES);
  });

  it("mientras dura el vuelo, mantener el salto sube", () => {
    const p = tickFly(player({ fly: true, flyT: 50 }), true);
    expect(p.vy).toBe(FLY_SPEED);
  });

  it("el vuelo se agota y se desactiva", () => {
    const p = tickFly(player({ fly: true, flyT: 0 }), true);
    expect(p.fly).toBe(false);
  });

  it("golpear un bloque '?' desde abajo otorga el poder y lo gasta", () => {
    const b = block(140, 150); // ocupa y 150..184
    // La cabeza cruza el borde inferior del bloque (y=184) de abajo hacia arriba.
    const r = hitBlock(player({ x: 136, y: 184, vy: -12 }), [b], 200);
    expect(r.hit).toBe(true);
    expect(r.player.fly).toBe(true);
    expect(r.tiles[0].collected).toBe(true);
  });

  it("golpear el bloque '?' ya gastado no vuelve a otorgar poder", () => {
    const b = { ...block(140, 150), collected: true };
    const r = hitBlock(player({ x: 136, y: 184, vy: -12 }), [b], 200);
    expect(r.hit).toBe(false);
  });

  it("contar monedas de la etapa (total y restantes)", () => {
    const coin = (x: number) => ({ type: "coin" as const, x, y: 0, w: 16, h: 16 });
    const collected = { ...coin(1), collected: true };
    const tiles = [coin(0), coin(0), collected];
    expect(stageCoinsTotal(tiles)).toBe(3);
    expect(stageCoinsLeft(tiles)).toBe(2);
  });
});

describe("BUG: rojo salta solo al crear sala", () => {
  it("sin input, el jugador queda apoyado y no vuelve a subir", () => {
    let g = createInitialGameState("story");
    let p = g.players[0];
    let jumps = 0;
    let groundedOnce = false;
    for (let i = 0; i < 300; i++) {
      const enemies0 = updateEnemies(g.enemies);
      tickThief(enemies0, g.players);
      let np = applyInput(p, "stop");
      np = applyGravity(np);
      np = resolveCollisions(np, g.tiles, g.players, { coop: true });
      const prevFeetY = np.y + np.height;
      np = { ...np, x: np.x + np.vx, y: np.y + np.vy };
      const stomp = stompEnemy(np, enemies0, prevFeetY);
      if (stomp.bounced) { jumps++; np = { ...np, vy: -10, onGround: false, jumped: false }; }
      if (np.onGround) groundedOnce = true;
      else if (groundedOnce && np.vy > 0) jumps++;
      p = np;
    }
    expect(groundedOnce).toBe(true);
    expect(jumps).toBe(0);
  });
});
