// Motor puro de Super Bros: física, movimiento, salto, items y condiciones de victoria.
// Sin dependencias de React ni DOM para poder testearlo en aislamiento.

export const SCREEN_WIDTH = 800;
export const SCREEN_HEIGHT = 480;

export const GRAVITY = 0.6;
export const JUMP_FORCE = -12;
export const MOVE_SPEED = 3.5;
export const MAX_FALL_SPEED = 15;

// Velocidad de animación (frames por segundo que avanza la walk cycle).
export const ANIM_FPS = 8;

export type PlayerId = "red" | "blue";

export interface BrosPlayer {
  id: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  facing: "left" | "right";
  lives: number;
  coins: number;
  width: number;
  height: number;
  jumped: boolean; // para permitir doble salto
  anim: number; // tiempo acumulado de animación
}

export type TileType = "ground" | "platform" | "coin" | "flag";

export interface BrosTile {
  type: TileType;
  x: number;
  y: number;
  w: number;
  h: number;
  collected?: boolean;
}

export type Phase = "lobby" | "playing" | "finished";

export interface BrosGameState {
  players: BrosPlayer[];
  tiles: BrosTile[];
  phase: Phase;
  winner: PlayerId | null;
}

export const defaultTiles: BrosTile[] = [
  // Suelo
  ...Array.from({ length: Math.ceil(SCREEN_WIDTH / 32) }, (_, i) => ({
    type: "ground" as const,
    x: i * 32,
    y: SCREEN_HEIGHT - 32,
    w: 32,
    h: 32,
  })),
  // Plataformas
  { type: "platform" as const, x: 150, y: 380, w: 200, h: 24 },
  { type: "platform" as const, x: 420, y: 300, w: 200, h: 24 },
  { type: "platform" as const, x: 660, y: 240, w: 100, h: 24 },
  // Banderín meta
  { type: "flag" as const, x: 750, y: 190, w: 32, h: 64 },
  // Monedas dispersas
  ...[200, 240, 280, 330, 370, 420, 470, 520, 570, 620, 670, 720].map((x, i) => ({
    type: "coin" as const,
    x,
    y: 290 - (i % 3) * 20,
    w: 16,
    h: 16,
  })),
];

export const defaultPlayers: BrosPlayer[] = [
  {
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
  },
  {
    id: "blue",
    x: 160,
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
  },
];

export function createInitialGameState(): BrosGameState {
  return {
    players: defaultPlayers.map((p) => ({ ...p })),
    tiles: defaultTiles.map((t) => ({ ...t })),
    phase: "playing",
    winner: null,
  };
}

export function setPhase(state: BrosGameState, phase: Phase): BrosGameState {
  return { ...state, phase };
}

export function applyInput(player: BrosPlayer, input: "left" | "right" | "up" | "stop"): BrosPlayer {
  const p = { ...player };
  if (input === "left") {
    p.vx = -MOVE_SPEED;
    p.facing = "left";
    p.anim += 1 / ANIM_FPS;
  } else if (input === "right") {
    p.vx = MOVE_SPEED;
    p.facing = "right";
    p.anim += 1 / ANIM_FPS;
  } else if (input === "up") {
    if (p.onGround || (p.jumped && Math.abs(p.vy) < 4)) {
      p.vy = JUMP_FORCE;
      p.onGround = false;
      p.jumped = true;
    }
  } else {
    p.vx = 0;
  }
  return p;
}

export function applyGravity(player: BrosPlayer): BrosPlayer {
  const p = { ...player };
  if (p.vy < MAX_FALL_SPEED) p.vy += GRAVITY;
  return p;
}

export function resolveCollisions(player: BrosPlayer, tiles: BrosTile[]): BrosPlayer {
  const p = { ...player };
  const solid: BrosTile[] = tiles.filter(
    (t) => (t.type === "ground" || t.type === "platform") && !t.collected,
  );

  for (const t of solid) {
    const insideX = p.x + p.vx < t.x + t.w && p.x + p.vx + p.width > t.x;
    const insideY = p.y + p.vy < t.y + t.h && p.y + p.vy + p.height > t.y;

    if (!insideX || !insideY) continue;

    const prevBottom = p.y + p.height;
    const nextBottom = p.y + p.vy + p.height;

    if (prevBottom <= t.y && nextBottom >= t.y && p.vy >= 0) {
      // Aterrizo encima
      p.vy = 0;
      p.y = t.y - p.height;
      p.onGround = true;
      p.jumped = false;
    } else {
      const prevTop = p.y;
      const nextTop = p.y + p.vy;
      if (prevTop >= t.y + t.h && nextTop <= t.y + t.h && p.vy < 0) {
        // Golpeó por debajo
        p.vy = 0;
        p.y = t.y + t.h;
      }
    }
  }

  const standing = solid.some(
    (t) =>
      p.y + p.height >= t.y - 1 &&
      p.y + p.height <= t.y + t.h + 1 &&
      p.x + p.width > t.x &&
      p.x < t.x + t.w,
  );
  if (!standing) p.onGround = false;

  if (p.y > SCREEN_HEIGHT) {
    p.lives -= 1;
    p.x = p.id === "red" ? 100 : 160;
    p.y = 300;
    p.vx = 0;
    p.vy = 0;
    p.onGround = false;
    p.jumped = false;
  }

  return p;
}

export function collectCoins(player: BrosPlayer, tiles: BrosTile[]): { player: BrosPlayer; collected: BrosTile[] } {
  const p = { ...player };
  const remaining: BrosTile[] = [];
  const collected: BrosTile[] = [];

  for (const t of tiles) {
    if (t.type === "coin" && !t.collected) {
      const overlap =
        p.x < t.x + t.w && p.x + p.width > t.x && p.y < t.y + t.h && p.y + p.height > t.y;
      if (overlap) {
        collected.push(t);
        p.coins += 1;
        continue;
      }
    }
    remaining.push(t);
  }

  return {
    player: p,
    collected: collected.map((t) => ({ ...t, collected: true })),
  };
}

export function reachFlag(player: BrosPlayer, tiles: BrosTile[]): boolean {
  const flagTile = tiles.find((t) => t.type === "flag");
  if (!flagTile) return false;
  return (
    player.x < flagTile.x + flagTile.w &&
    player.x + player.width > flagTile.x &&
    player.y < flagTile.y + flagTile.h &&
    player.y + player.height > flagTile.y
  );
}

export function updatePlayer(player: BrosPlayer, tiles: BrosTile[]): BrosPlayer {
  let p = applyGravity(player);
  p = resolveCollisions(p, tiles);
  p.x += p.vx;
  p.anim = player.anim; // carryover para animación continua
  return p;
}
