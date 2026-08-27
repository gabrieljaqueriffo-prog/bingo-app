import { describe, it, expect } from "vitest";
import {
  BrosPlayer,
  createInitialGameState,
  applyInput,
  applyGravity,
  resolveCollisions,
  reachFlag,
  collectCoins,
  SCREEN_HEIGHT,
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
});
