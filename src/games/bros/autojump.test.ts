import { describe, expect, it } from "vitest";
import {
  applyInput, applyGravity, resolveCollisions, stompEnemy, updateEnemies, tickThief,
  createInitialGameState,
} from "./engine";
import "./stages";

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
