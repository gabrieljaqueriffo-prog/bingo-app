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

export type TileType = "ground" | "platform" | "coin" | "flag" | "plate" | "gate";

export interface BrosTile {
  type: TileType;
  x: number;
  y: number;
  w: number;
  h: number;
  collected?: boolean;
  pair?: number; // une placa y compuerta en el modo cooperación
}

export type Phase = "lobby" | "playing" | "finished";

export type BrosMode = "race" | "coins" | "lives" | "coop" | "temple";
export const COIN_GOAL = 8;

export interface BrosGameState {
  players: BrosPlayer[];
  tiles: BrosTile[];
  phase: Phase;
  winner: PlayerId | null;
  mode: BrosMode;
}

const GROUND_Y = SCREEN_HEIGHT - 32;

const groundSegment = (from: number, to: number): BrosTile[] =>
  Array.from({ length: Math.round((to - from) / 32) }, (_, i) => ({
    type: "ground" as const,
    x: from + i * 32,
    y: GROUND_Y,
    w: 32,
    h: 32,
  }));

const platform = (x: number, y: number, w: number): BrosTile => ({ type: "platform", x, y, w, h: 24 });
const coin = (x: number, y: number): BrosTile => ({ type: "coin", x, y, w: 16, h: 16 });

const flagTile: BrosTile = { type: "flag", x: 750, y: 190, w: 32, h: 64 };
const coinsArc: BrosTile[] = [200, 240, 280, 330, 370, 420, 470, 520, 570, 620, 670, 720].map((x, i) =>
  coin(x, 290 - (i % 3) * 20),
);

// Carrera y monedas: plataformas hasta la meta arriba a la derecha.
function raceTiles(): BrosTile[] {
  return [
    ...groundSegment(0, SCREEN_WIDTH),
    platform(150, 380, 200),
    platform(420, 300, 200),
    platform(660, 240, 100),
    flagTile,
    ...coinsArc,
  ];
}

// Vidas: mismo mapa pero con huecos en el suelo. Caerte cuesta una vida.
function livesTiles(): BrosTile[] {
  return [
    ...groundSegment(0, 288),
    ...groundSegment(352, 544),
    ...groundSegment(608, SCREEN_WIDTH),
    platform(150, 380, 200),
    platform(420, 300, 200),
    platform(660, 240, 100),
    flagTile,
    ...coinsArc.slice(0, 6),
  ];
}

// Cooperación: una compuerta que solo se abre mientras alguien pisa una placa.
// Solo no la podés cruzar: uno sostiene la placa, el otro pasa, y después se turnan.
function coopTiles(): BrosTile[] {
  return [
    ...groundSegment(0, SCREEN_WIDTH),
    { type: "plate", x: 240, y: GROUND_Y - 12, w: 56, h: 12, pair: 1 },
    { type: "gate", x: 400, y: 250, w: 16, h: GROUND_Y - 250, pair: 1 },
    { type: "plate", x: 600, y: GROUND_Y - 12, w: 56, h: 12, pair: 1 },
    platform(440, 380, 160),
    platform(660, 240, 100),
    flagTile,
    coin(320, 300),
    coin(520, 340),
    coin(700, 200),
  ];
}

// El Templo Perdido: cooperación con historia. Un explorador entra a la
// Cueva de los Ecos; el otro queda afuera pisando los sellos antiguos que
// abren —una por una— las puertas del interior. Solo juntos despiertan al
// Trofeo Dorado de la Mesita.
function templeTiles(): BrosTile[] {
  return [
    ...groundSegment(0, SCREEN_WIDTH),
    // Sellos del exterior
    { type: "plate", x: 240, y: GROUND_Y - 12, w: 56, h: 12, pair: 1 },
    { type: "plate", x: 120, y: GROUND_Y - 12, w: 56, h: 12, pair: 2 },
    // Entrada de la cueva (se abre con el Sello del Sol)
    { type: "gate", x: 430, y: 200, w: 16, h: GROUND_Y - 200, pair: 1 },
    // Puerta del corredor (se abre con el Espejo de la Luna)
    { type: "gate", x: 520, y: 250, w: 16, h: GROUND_Y - 250, pair: 2 },
    // El Canto de la Runa (interior): abre la cámara del trofeo
    { type: "plate", x: 565, y: GROUND_Y - 12, w: 44, h: 12, pair: 3 },
    { type: "gate", x: 640, y: 250, w: 16, h: GROUND_Y - 250, pair: 3 },
    // El Trofeo Dorado de la Mesita
    { type: "flag", x: 750, y: 384, w: 32, h: 64 },
    platform(470, 380, 120),
    coin(300, 380),
    coin(480, 340),
    coin(740, 330),
  ];
}

export function tilesForMode(mode: BrosMode): BrosTile[] {
  if (mode === "lives") return livesTiles();
  if (mode === "coop") return coopTiles();
  if (mode === "temple") return templeTiles();
  return raceTiles();
}

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

export function createInitialGameState(mode: BrosMode = "race"): BrosGameState {
  return {
    players: defaultPlayers.map((p) => ({ ...p })),
    tiles: tilesForMode(mode).map((t) => ({ ...t })),
    phase: "playing",
    winner: null,
    mode,
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

// ¿Hay alguien parado sobre una placa de ese par? (mantiene abierta su compuerta)
export function platePressed(tiles: BrosTile[], pair: number, players: BrosPlayer[]): boolean {
  return tiles.some(
    (t) =>
      t.type === "plate" &&
      t.pair === pair &&
      players.some(
        (p) =>
          p.y + p.height >= t.y - 2 &&
          p.y + p.height <= t.y + t.h + 2 &&
          p.x + p.width > t.x &&
          p.x < t.x + t.w,
      ),
  );
}

export function resolveCollisions(
  player: BrosPlayer,
  tiles: BrosTile[],
  players: BrosPlayer[] = [player],
): BrosPlayer {
  const p = { ...player };
  const solid: BrosTile[] = tiles.filter(
    (t) =>
      t.type === "ground" ||
      t.type === "platform" ||
      (t.type === "gate" && !platePressed(tiles, t.pair ?? 0, players)),
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

  // Bloqueo horizontal (compuertas cerradas): frena sin trabar si ya te superponés.
  for (const t of solid) {
    const overlapY = p.y < t.y + t.h && p.y + p.height > t.y;
    if (!overlapY) continue;
    if (p.vx > 0 && p.x + p.width <= t.x && p.x + p.width + p.vx > t.x) {
      p.x = t.x - p.width;
      p.vx = 0;
    } else if (p.vx < 0 && p.x >= t.x + t.w && p.x + p.vx < t.x + t.w) {
      p.x = t.x + t.w;
      p.vx = 0;
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
