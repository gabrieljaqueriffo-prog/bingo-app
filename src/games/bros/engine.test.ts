import { describe, it, expect } from "vitest";
import {
  BrosPlayer,
  createInitialGameState,
  applyInput,
  applyGravity,
  resolveCollisions,
  reachFlag,
  collectCoins,
  collectPower,
  collectHeart,
  makeLevel,
  updateEnemies,
  hitEnemy,
  stompEnemy,
  BOSS_HP,
  COYOTE_FRAMES,
  type Enemy,
  type BrosMode,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  MOVE_SPEED,
  JUMP_FORCE,
  GRAVITY,
} from "./engine";

describe("Super Bros Engine", () => {
  const basePlayer: BrosPlayer = {
    id: "red",
    x: 100,
    y: 300,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: "right",
    lives: 3,
    coins: 0,
    width: 30,
    height: 48,
    jumped: false,
    anim: 0,
    coyote: 0,
    shields: 0,
  };

  it("should start with two players and valid dimensions", () => {
    const state = createInitialGameState();
    expect(state.players.length).toBe(2);
    expect(state.players[0].id).toBe("red");
    expect(state.players[1].id).toBe("blue");
    expect(state.phase).toBe("playing");
  });

  it("should move left/right", () => {
    const p = applyInput(basePlayer, "left");
    expect(p.vx).toBe(-MOVE_SPEED);
    expect(p.facing).toBe("left");

    const r = applyInput(basePlayer, "right");
    expect(r.vx).toBe(MOVE_SPEED);
    expect(r.facing).toBe("right");
  });

  it("should stop moving", () => {
    const p = { ...basePlayer, vx: 5 };
    const stopped = applyInput(p, "stop");
    expect(stopped.vx).toBe(0);
  });

  it("should jump when on ground", () => {
    const p = { ...basePlayer, onGround: true, jumped: false };
    const jumped = applyInput(p, "up");
    expect(jumped.vy).toBe(JUMP_FORCE);
    expect(jumped.onGround).toBe(false);
    expect(jumped.jumped).toBe(true);
  });

  it("should double jump", () => {
    const p = { ...basePlayer, onGround: false, jumped: true, vy: 2 };
    const jumped = applyInput(p, "up");
    expect(jumped.vy).toBe(JUMP_FORCE);
    expect(jumped.jumped).toBe(true); // sigue saltado para no triple
  });

  it("should apply gravity when not on ground", () => {
    const p = applyGravity({ ...basePlayer, onGround: false, vy: 0 });
    expect(p.vy).toBeCloseTo(GRAVITY);
  });

  it("should cap fall speed", () => {
    let p = applyGravity({ ...basePlayer, vy: 20, onGround: false });
    expect(p.vy).toBeLessThanOrEqual(20);
  });

  it("should lose a life when falling below the screen", () => {
    const p = { ...basePlayer, y: SCREEN_HEIGHT + 10, vy: 5, onGround: false, jumped: false };
    const fallen = resolveCollisions(p, createInitialGameState().tiles);
    expect(fallen.lives).toBe(2);
    expect(fallen.y).toBe(300); // respawn
  });

  it("should land on the ground", () => {
    const p = { ...basePlayer, y: SCREEN_HEIGHT - 85, vy: 8, onGround: false };
    const tiles = createInitialGameState().tiles;
    const landed = resolveCollisions(p, tiles);
    expect(landed.onGround).toBe(true);
    expect(landed.vy).toBe(0);
  });

  it("should collect a coin when overlapping", () => {
    const tiles = createInitialGameState().tiles;
    const coin = tiles.find((t) => t.type === "coin")!;
    const p = { ...basePlayer, x: coin.x - 5, y: coin.y - 5 };
    const { player, collected } = collectCoins(p, tiles);
    expect(collected.length).toBe(1);
    expect(player.coins).toBe(1);
  });

  it("should win when reaching the flag", () => {
    const tiles = createInitialGameState().tiles;
    const flag = tiles.find((t) => t.type === "flag")!;
    const p = { ...basePlayer, x: flag.x, y: flag.y - 40 };
    expect(reachFlag(p, tiles)).toBe(true);
  });

  it("should respawn with correct position after falling", () => {
    const p: BrosPlayer = { ...basePlayer, id: "blue", y: 1000, vy: 10, onGround: false, jumped: false };
    const tiles = createInitialGameState().tiles;
    const respawned = resolveCollisions(p, tiles);
    expect(respawned.lives).toBe(2);
    expect(respawned.x).toBe(160);
    expect(respawned.y).toBe(300);
  });

  it("should spawn enemies, a flyer and a final boss in temple level 3", () => {
    const level3 = makeLevel("temple", 3, [basePlayer, { ...basePlayer, id: "blue", x: 160 }]);
    expect(level3.enemies.length).toBe(4);
    expect(level3.enemies.some((e) => e.boss)).toBe(true);
    expect(level3.enemies.some((e) => e.flyer)).toBe(true);
    expect(level3.level).toBe(3);
  });

  it("should have multi-screen worlds (scroll) with the flag far to the right", () => {
    const modes: BrosMode[] = ["race", "coins", "lives", "coop", "temple"];
    for (const mode of modes) {
      const state = createInitialGameState(mode);
      // El mundo es más ancho que una pantalla.
      expect(state.worldW).toBeGreaterThan(SCREEN_WIDTH);
      // La meta queda fuera de la primera pantalla: hay que recorrer el mundo.
      const flag = state.tiles.find((t) => t.type === "flag");
      expect(flag).toBeDefined();
      expect(flag!.x).toBeGreaterThan(SCREEN_WIDTH);
      // Todas las compuertas quedan antes de la meta.
      for (const gate of state.tiles.filter((t) => t.type === "gate")) {
        expect(gate.x).toBeLessThan(flag!.x);
      }
    }
  });

  it("should not walk off the left edge of the world", () => {
    const p = { ...basePlayer, x: 2, vx: -MOVE_SPEED, onGround: true };
    const clamped = resolveCollisions(p, createInitialGameState().tiles);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
  });

  it("should bounce enemies between their patrol limits", () => {
    const enemies = updateEnemies([
      { id: "x", x: 280, y: 0, w: 28, h: 40, minX: 280, maxX: 600, dir: 1, speed: 2, boss: false },
      { id: "y", x: 598, y: 0, w: 28, h: 40, minX: 280, maxX: 600, dir: -1, speed: 2, boss: false },
    ] as Enemy[]);
    expect(enemies[0].x).toBeGreaterThan(280);
    expect(enemies[1].x).toBeLessThan(598);
  });

  it("should detect a player hitting an enemy", () => {
    const enemy = [
      { id: "e", x: 300, y: 300, w: 28, h: 40, minX: 0, maxX: 800, dir: 1, speed: 2, boss: false },
    ] as Enemy[];
    const hit = { ...basePlayer, x: 305, y: 300 };
    expect(hitEnemy(hit, enemy)).toBe(true);
    const miss = { ...basePlayer, x: 500, y: 300 };
    expect(hitEnemy(miss, enemy)).toBe(false);
  });

  it("should let the boss be stomped to reduce HP and die after BOSS_HP hits", () => {
    const boss = { id: "boss", x: 300, y: 300, w: 46, h: 66, minX: 0, maxX: 800, dir: 1, speed: 2, boss: true, hp: BOSS_HP };
    let enemies = [boss] as Enemy[];
    const stomper = { ...basePlayer, x: 315, y: 270, vy: 6 };
    const r1 = stompEnemy(stomper, enemies);
    expect(r1.bounced).toBe(true);
    expect(r1.enemies[0].hp).toBe(BOSS_HP - 1);
    enemies = r1.enemies;
    // golpes repetidos (sin stun) lo matan tras BOSS_HP golpes
    let hits = BOSS_HP - 1;
    while (hits-- > 0) {
      const r = stompEnemy(stomper, enemies.map((e) => ({ ...e, stun: 0 })));
      enemies = r.enemies;
    }
    expect(enemies.length).toBe(0);
  });

  it("should stomp via swept detection when falling fast (anti-tunneling)", () => {
    const enemy = { id: "e", x: 300, y: 320, w: 28, h: 40, minX: 0, maxX: 800, dir: 1, speed: 2, boss: false } as Enemy;
    // Cayendo a MAX_FALL_SPEED: los pies pasan de estar ENCIMA del enemigo a
    // atravesarlo en un solo tick; la ventana estática no alcanza, el cruce sí.
    const prevFeetY = 315; // por encima de e.y = 320
    const now = { ...basePlayer, x: 305, y: 340, vy: 15 }; // pies = 388 (fuera de ventana)
    const r = stompEnemy(now, [enemy], prevFeetY);
    expect(r.bounced).toBe(true);
    expect(r.enemies.length).toBe(0);
    expect(r.coins).toBe(1);
    // Sin prevFeetY (comportamiento anterior): NO hay stomp.
    const r2 = stompEnemy(now, [{ ...enemy }]);
    expect(r2.bounced).toBe(false);
    // Cruce desde abajo (subiendo) NO cuenta como stomp.
    const rising = { ...basePlayer, x: 305, y: 340, vy: -8 };
    const r3 = stompEnemy(rising, [{ ...enemy }], 388);
    expect(r3.bounced).toBe(false);
  });

  it("should give coins when stomping enemies (1 for normal, 3 for the boss)", () => {
    const normal = { id: "e", x: 300, y: 320, w: 28, h: 40, minX: 0, maxX: 800, dir: 1, speed: 2, boss: false };
    const stomper = { ...basePlayer, x: 305, y: 290, vy: 6 };
    const rn = stompEnemy(stomper, [normal] as Enemy[]);
    expect(rn.enemies.length).toBe(0);
    expect(rn.coins).toBe(1);

    const boss = { id: "boss", x: 300, y: 300, w: 46, h: 66, minX: 0, maxX: 800, dir: 1, speed: 2, boss: true, hp: 1 };
    const rb = stompEnemy(stomper, [boss] as Enemy[]);
    expect(rb.enemies.length).toBe(0);
    expect(rb.coins).toBe(3);
  });

  it("should cut the jump when released (variable jump height)", () => {
    const p = { ...basePlayer, vy: JUMP_FORCE, jumped: true };
    const cut = applyInput(p, "jumpcut");
    expect(cut.vy).toBeLessThan(0); // sigue subiendo, pero más despacio
    expect(Math.abs(cut.vy)).toBeLessThan(Math.abs(JUMP_FORCE));
  });

  it("should allow a coyote-time jump right after leaving a ledge", () => {
    const p = { ...basePlayer, onGround: false, jumped: false, coyote: 6, vy: 4 };
    const jumped = applyInput(p, "up");
    expect(jumped.vy).toBe(JUMP_FORCE);
    expect(jumped.coyote).toBe(0); // la ventana se consume al saltar
  });

  it("should refresh coyote frames while standing and drain them off a ledge", () => {
    const tiles = createInitialGameState().tiles;
    let p = { ...basePlayer, y: SCREEN_HEIGHT - 85, vy: 8, onGround: false, coyote: 0 };
    p = resolveCollisions(p, tiles);
    expect(p.onGround).toBe(true);
    expect(p.coyote).toBe(COYOTE_FRAMES);
    // En el aire (sin tiles sólidos), la ventana se agota gradualmente.
    const air = resolveCollisions({ ...p, onGround: false, y: p.y - 2, coyote: p.coyote }, []);
    expect(air.coyote).toBeLessThan(COYOTE_FRAMES);
  });

  it("should give a shield when collecting a power star", () => {
    const tiles = createInitialGameState().tiles;
    const star = tiles.find((t) => t.type === "power")!;
    expect(star).toBeDefined();
    const p = { ...basePlayer, x: star.x - 5, y: star.y - 5 };
    const { player, collected } = collectPower(p, tiles);
    expect(collected.length).toBe(1);
    expect(player.shields).toBe(1);
    // No se pueden acumular más de 3 escudos.
    const capped = collectPower({ ...player, x: star.x - 5, y: star.y - 5, shields: 3 }, tiles);
    expect(capped.player.shields).toBe(3);
  });

  it("should give an extra life when collecting a heart (1UP)", () => {
    const tiles = createInitialGameState().tiles;
    const heart = tiles.find((t) => t.type === "heart")!;
    expect(heart).toBeDefined();
    const p = { ...basePlayer, x: heart.x - 5, y: heart.y - 5, lives: 2 };
    const { player, collected } = collectHeart(p, tiles);
    expect(collected.length).toBe(1);
    expect(player.lives).toBe(3);
    // Tope de vidas: no pasa de MAX_LIVES (9).
    const capped = collectHeart({ ...player, x: heart.x - 5, y: heart.y - 5, lives: 9 }, tiles);
    expect(capped.player.lives).toBe(9);
    // Si el corazón ya se recogió, no vuelve a sumar.
    const again = collectHeart({ ...player, x: heart.x - 5, y: heart.y - 5, lives: 3 }, [
      { ...heart, collected: true },
    ]);
    expect(again.collected.length).toBe(0);
    expect(again.player.lives).toBe(3);
  });

  it("should place power stars and a heart in every stage", () => {
    const modes: BrosMode[] = ["race", "coins", "lives", "coop", "temple"];
    for (const mode of modes) {
      const state = createInitialGameState(mode);
      expect(state.tiles.some((t) => t.type === "power")).toBe(true);
      expect(state.tiles.some((t) => t.type === "heart")).toBe(true);
    }
  });

  it("should make flyer enemies bob vertically while patrolling", () => {
    const flyer = { id: "f", x: 400, y: 300, baseY: 300, w: 24, h: 24, minX: 300, maxX: 700, dir: 1, speed: 2, flyer: true, phase: 0 } as Enemy;
    const moved = updateEnemies([flyer])[0];
    expect(moved.y).not.toBe(300); // cambió la altura por el aleteo
    expect(moved.phase).toBeGreaterThan(0);
  });
});
