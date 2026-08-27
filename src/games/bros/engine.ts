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
// Cantidad de etapas en los modos cooperativos (Cooperación y El Templo).
export const MAX_LEVELS = 3;

export interface BrosGameState {
  players: BrosPlayer[];
  tiles: BrosTile[];
  phase: Phase;
  winner: PlayerId | null;
  mode: BrosMode;
  level: number; // etapa actual (1..MAX_LEVELS en los modos con etapas)
  enemies: Enemy[];
  eTick: number; // paso de animación de los enemigos (determinista, compartido)
}

export interface Enemy {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minX: number;
  maxX: number;
  dir: 1 | -1;
  speed: number;
  boss?: boolean;
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

// Cooperación: compuertas que solo se abren mientras alguien pisa la placa.
// Cada etapa suma una compuerta más (más trabajo en equipo).
function coopTiles(level: number): BrosTile[] {
  const pairs = Math.min(3, 1 + level); // lvl1:2, lvl2:3, lvl3:3(compuertas bien altas)
  const tiles: BrosTile[] = [...groundSegment(0, SCREEN_WIDTH)];
  let gx = 400;
  for (let i = 1; i <= pairs; i++) {
    const px = 220 + (i - 1) * 130;
    const gy = 240 + (i % 2) * 40;
    tiles.push({ type: "plate", x: px, y: GROUND_Y - 12, w: 56, h: 12, pair: i });
    tiles.push({ type: "gate", x: gx, y: gy, w: 16, h: GROUND_Y - gy, pair: i });
    gx += 120;
  }
  tiles.push(platform(470, 380, 120), platform(660, 240, 100), flagTile);
  tiles.push(coin(320, 300), coin(520, 340), coin(700, 200));
  return tiles;
}

// El Templo Perdido: un explorador entra a la cueva, el otro queda afuera
// pisando los sellos que abren —una a una— las puertas del interior. Cada
// etapa es una cámara más profunda: más sellos y más compuertas que coordinar.
function templeTiles(level: number): BrosTile[] {
  const seals = Math.min(5, 2 + level); // lvl1:3, lvl2:4, lvl3:5
  const tiles: BrosTile[] = [...groundSegment(0, SCREEN_WIDTH)];
  // Sellos del exterior (afuera) y puertas hacia la penumbra.
  for (let i = 1; i <= seals; i++) {
    const px = 100 + (i - 1) * 50;
    const gx = 410 + (i - 1) * 52;
    tiles.push({ type: "plate", x: px, y: GROUND_Y - 12, w: 44, h: 12, pair: i });
    tiles.push({ type: "gate", x: gx, y: 200 + (i % 2) * 30, w: 16, h: GROUND_Y - (200 + (i % 2) * 30), pair: i });
  }
  // El Canto de la Runa (interior): abre la cámara del trofeo.
  tiles.push({ type: "plate", x: 560, y: GROUND_Y - 12, w: 44, h: 12, pair: seals + 1 });
  tiles.push({ type: "gate", x: 700, y: 200, w: 16, h: GROUND_Y - 200, pair: seals + 1 });
  // El Trofeo Dorado de la Mesita
  tiles.push({ type: "flag", x: 750, y: 384, w: 32, h: 64 });
  tiles.push(platform(470, 380, 120), platform(660, 240, 100));
  tiles.push(coin(300, 380), coin(480, 340), coin(740, 330));
  return tiles;
}

// Genera los tiles de una etapa. Los modos cooperativos varían con el nivel.
export function tilesForLevel(mode: BrosMode, level: number = 1): BrosTile[] {
  if (mode === "lives") return livesTiles();
  if (mode === "coop") return coopTiles(level);
  if (mode === "temple") return templeTiles(level);
  return raceTiles();
}

// Reposiciona un jugador a su punto de partida (para cambiar de etapa).
export function resetPlayer(p: BrosPlayer): BrosPlayer {
  return {
    ...p,
    x: p.id === "red" ? 100 : 160,
    y: 300,
    vx: 0,
    vy: 0,
    onGround: false,
    jumped: false,
    anim: 0,
  };
}

// Enemigos que patrullan de un lado a otro. Aparecen en los modos
// cooperativos y crecen con la etapa; en la 3ª hay un jefe final más grande.
export function enemiesForLevel(mode: BrosMode, level: number = 1): Enemy[] {
  const base: Enemy[] = [];
  if (mode === "coop") {
    base.push({ id: "e1", x: 360, y: 380, w: 28, h: 40, minX: 280, maxX: 600, dir: -1, speed: 2, boss: false });
    if (level >= 2) base.push({ id: "e2", x: 640, y: 320, w: 28, h: 40, minX: 560, maxX: 740, dir: 1, speed: 2.6, boss: false });
    if (level >= 3) base.push({ id: "boss", x: 700, y: 256, w: 46, h: 66, minX: 640, maxX: 770, dir: -1, speed: 3, boss: true });
  }
  if (mode === "temple") {
    base.push({ id: "g1", x: 520, y: 320, w: 26, h: 40, minX: 470, maxX: 660, dir: -1, speed: 2, boss: false });
    if (level >= 2) base.push({ id: "g2", x: 580, y: 420, w: 26, h: 40, minX: 540, maxX: 720, dir: 1, speed: 2.6, boss: false });
    if (level >= 3) base.push({ id: "boss", x: 700, y: 380, w: 46, h: 66, minX: 660, maxX: 780, dir: -1, speed: 3, boss: true });
  }
  return base;
}

// Avanza los enemigos un paso, rebotando entre sus límites. Determinista:
// todos los clientes computan lo mismo a partir del estado compartido.
export function updateEnemies(enemies: Enemy[]): Enemy[] {
  return enemies.map((e) => {
    let x = e.x + e.dir * e.speed;
    let dir = e.dir;
    if (x <= e.minX) { x = e.minX; dir = 1; }
    if (x + e.w >= e.maxX) { x = e.maxX - e.w; dir = -1; }
    return { ...e, x, dir };
  });
}

// ¿Un jugador colisiona con un enemigo?
export function hitEnemy(p: BrosPlayer, enemies: Enemy[]): boolean {
  return enemies.some(
    (e) =>
      p.x < e.x + e.w && p.x + p.width > e.x &&
      p.y < e.y + e.h && p.y + p.height > e.y,
  );
}

// Reconstruye completo el estado de una etapa (mapa + enemigos + salida),
// usado para avanzar de nivel o reiniciar la etapa tras perder todas las vidas.
export function makeLevel(mode: BrosMode, level: number, players: BrosPlayer[]): BrosGameState {
  return {
    players: players.map((p) => ({ ...resetPlayer(p), lives: 3 })),
    tiles: tilesForLevel(mode, level).map((t) => ({ ...t })),
    enemies: enemiesForLevel(mode, level),
    phase: "playing",
    winner: null,
    mode,
    level,
    eTick: 0,
  };
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
    tiles: tilesForLevel(mode, 1).map((t) => ({ ...t })),
    enemies: enemiesForLevel(mode, 1),
    phase: "playing",
    winner: null,
    mode,
    level: 1,
    eTick: 0,
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
