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
  coyote: number; // frames de gracia para saltar tras dejar una plataforma
  shields: number; // escudos de estrella (aguantan un golpe de enemigo sin perder vida)
  // --- Mecánicas cooperativas ---
  isBubble?: boolean; // ¿está atrapado en una burbuja esperando rescate?
  carrying?: PlayerId | null; // ¿a quién lleva sobre la cabeza?
  carriedBy?: PlayerId | null; // ¿quién lo lleva a él?
  interactCd?: number; // frames de enfriamiento para cargar/lanzar
  emote?: string | null; // emote rápido mostrado encima del jugador
  emoteT?: number; // frames restantes del emote
}

export type TileType =
  | "ground" | "platform" | "coin" | "flag"
  | "plate" | "gate" | "lever" | "power" | "heart";

export interface BrosTile {
  type: TileType;
  x: number;
  y: number;
  w: number;
  h: number;
  collected?: boolean;
  pair?: number; // une placa (o palanca) y compuerta en el modo cooperación
  both?: boolean; // placa doble: requiere el peso de ambos jugadores a la vez
}

export type Phase = "lobby" | "playing" | "finished";

export type BrosMode = "race" | "coins" | "lives" | "coop" | "temple";
export const COIN_GOAL = 8;
export const BOSS_HP = 3;
export const MAX_LEVELS = 3;
// Frames de "coyote time": tras pisar/abandonar una plataforma podés saltar
// unas décimas de segundo más para que el control se sienta más generoso.
export const COYOTE_FRAMES = 8;
// Máximo de vidas acumulables con los corazones.
export const MAX_LIVES = 9;

// --- Mecánicas cooperativas: llevar/lanzar, burbuja de rescate, palancas ----
export const THROW_SPEED = 14; // velocidad horizontal al lanzar a la pareja
export const THROW_UP = -14;   // impulso vertical al lanzar a la pareja
export const GRAB_RANGE = 46;  // distancia máxima para cargar a la pareja
export const GRAB_CD = 24;     // frames de enfriamiento tras cargar/lanzar
export const BUBBLE_TOP = 130; // altura a la que flota la burbuja de rescate
export const BUBBLE_RISE = 2;  // velocidad de subida de la burbuja
export const EMOTE_FRAMES = 90;

export interface BrosGameState {
  players: BrosPlayer[];
  tiles: BrosTile[];
  phase: Phase;
  winner: PlayerId | null;
  mode: BrosMode;
  level: number; // etapa actual (1..MAX_LEVELS en los modos con etapas)
  enemies: Enemy[];
  eTick: number; // paso de animación de los enemigos (determinista, compartido)
  worldW: number; // ancho del mundo en píxeles (varias pantallas: hay scroll)
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
  hp?: number; // el jefe tiene vida: se lo golpea saltándole encima
  stun?: number; // ticks de invulnerabilidad tras recibir un golpe (parpadea)
  flyer?: boolean; // enemigo volador que además bobea en vertical
  baseY?: number; // altura base del aleteo vertical
  phase?: number; // fase de animación del aleteo
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

// Estrellas (power-up): al recolectarlas dan un escudo. Van apoyadas en el
// piso para que sean fáciles de agarrar caminando (sin forzar saltos difíciles).
const powerStars = (width: number): BrosTile[] =>
  [0.32, 0.66].map((f) => ({
    type: "power" as const,
    x: Math.max(120, Math.round(width * f)),
    y: GROUND_Y - 40,
    w: 18,
    h: 18,
  }));

// Corazón (1UP): al recolectarlo ganás una vida. Flota a media altura
// acercándose a la meta para que sea un premio dentro de la etapa.
const heartPickup = (width: number): BrosTile => ({
  type: "heart" as const,
  x: Math.max(160, Math.round(width * 0.55)),
  y: GROUND_Y - 72,
  w: 18,
  h: 18,
});

// El mundo mide varias pantallas de ancho; el scroll horizontal recorre cada etapa.
export function worldWidthForLevel(mode: BrosMode, level: number = 1): number {
  if (mode === "temple") return SCREEN_WIDTH * 4;
  if (mode === "coop") return SCREEN_WIDTH * 3 + level * 120;
  return SCREEN_WIDTH * 3;
}

const flagAt = (x: number, h = 64): BrosTile => ({ type: "flag", x, y: 190, w: 32, h });
const flagAtGround = (x: number): BrosTile => ({ type: "flag", x, y: GROUND_Y - 64, w: 32, h: 64 });

// Carrera y monedas: una pista larga con plataformas y arcos de monedas hasta
// la meta muy a la derecha (por eso ahora hay que recorrer todo el mundo).
function raceTiles(): { tiles: BrosTile[]; flagX: number } {
  const width = SCREEN_WIDTH * 3;
  const tiles: BrosTile[] = [...groundSegment(0, width)];
  let x = 180;
  let i = 0;
  while (x < width - 220) {
    const h = 372 - (i % 2) * 70; // 372 / 302
    tiles.push(platform(x, h, 140));
    for (let k = 0; k < 4; k++) tiles.push(coin(x + 18 + k * 26, h - 14 - (k % 2) * 18));
    x += 210;
    i++;
  }
  const flagX = width - 60;
  tiles.push(flagAt(flagX));
  return { tiles, flagX };
}

// Vidas: mundo largo con huecos en el suelo. Caerte cuesta una vida.
function livesTiles(): { tiles: BrosTile[]; flagX: number } {
  const width = SCREEN_WIDTH * 3;
  const tiles: BrosTile[] = [];
  let x = 0;
  let seg = 0;
  while (x < width) {
    const len = 280 - (seg % 2) * 80; // alterna huecos de 80px
    tiles.push(...groundSegment(x, Math.min(x + len, width)));
    x += len + 80;
    seg++;
  }
  let px = 200;
  let i = 0;
  while (px < width - 160) {
    tiles.push(platform(px, 380 - (i % 2) * 60, 130));
    for (let k = 0; k < 3; k++) tiles.push(coin(px + 26 + k * 30, 240 - (k % 2) * 18));
    px += 240;
    i++;
  }
  const flagX = width - 60;
  tiles.push(flagAt(flagX));
  return { tiles, flagX };
}

// Cooperación: compuertas repartidas a lo largo del mundo que solo se abren
// mientras alguien pisa su placa. Cada etapa suma una compuerta más y se recorre
// más mundo (worldW crece con el nivel).
function coopTiles(level: number, width: number): { tiles: BrosTile[]; flagX: number } {
  const pairs = Math.min(5, 2 + level); // lvl1:3, lvl2:4, lvl3:5
  const tiles: BrosTile[] = [...groundSegment(0, width)];
  const step = pairs > 1 ? (width - 600) / (pairs - 1) : 0;
  for (let i = 1; i <= pairs; i++) {
    const px = 150 + (i - 1) * step * 0.7;
    const gx = 420 + (i - 1) * step;
    const gy = 240 + (i % 2) * 40;
    // En niveles superiores la última placa es DOBLE: exige el peso de ambos.
    const both = i === pairs && level >= 2;
    tiles.push({ type: "plate", x: px, y: GROUND_Y - 12, w: both ? 90 : 56, h: 12, pair: i, both });
    tiles.push({ type: "gate", x: gx, y: gy, w: 16, h: GROUND_Y - gy, pair: i });
  }
  // Palanca: un jugador la mantiene presionada para abrir un portón al otro.
  const leverPair = pairs + 1;
  const lx = Math.round(width * 0.3);
  tiles.push({ type: "lever", x: lx, y: GROUND_Y - 22, w: 28, h: 22, pair: leverPair });
  tiles.push({ type: "gate", x: lx + 160, y: 180, w: 16, h: GROUND_Y - 180, pair: leverPair });
  const flagX = width - 60;
  tiles.push(platform(flagX - 260, 380, 120), platform(flagX - 120, 240, 100), flagAt(flagX));
  for (let k = 0; k < 6; k++) tiles.push(coin(220 + k * 220, 300 - (k % 2) * 40));
  return { tiles, flagX };
}

// El Templo Perdido: una cueva profunda que se recorre con scroll. Sellos afuera
// abren compuertas interiores; el último abre la cámara del trofeo. Cada etapa
// es una cámara más profunda (más mundo, más sellos y más compuertas).
function templeTiles(level: number, width: number): { tiles: BrosTile[]; flagX: number; caveX: number } {
  const seals = Math.min(6, 2 + level); // lvl1:3, lvl2:4, lvl3:5
  const tiles: BrosTile[] = [...groundSegment(0, width)];
  const step = seals > 1 ? (width - 600) / (seals - 1) : 0;
  const caveX = 430;
  for (let i = 1; i <= seals; i++) {
    const px = 140 + (i - 1) * step * 0.7;
    const gx = 430 + (i - 1) * step;
    tiles.push({ type: "plate", x: px, y: GROUND_Y - 12, w: 40, h: 12, pair: i });
    tiles.push({ type: "gate", x: gx, y: 200 + (i % 2) * 30, w: 16, h: GROUND_Y - (200 + (i % 2) * 30), pair: i });
  }
  // El Canto de la Runa (interior profundo): abre la cámara del trofeo.
  const runaPair = seals + 1;
  const runaPlateX = width - 260;
  tiles.push({ type: "plate", x: runaPlateX, y: GROUND_Y - 12, w: 44, h: 12, pair: runaPair });
  tiles.push({ type: "gate", x: runaPlateX + 120, y: 200, w: 16, h: GROUND_Y - 200, pair: runaPair });
  const flagX = width - 40;
  tiles.push(flagAtGround(flagX));
  tiles.push(platform(flagX - 300, 380, 120), platform(flagX - 120, 240, 100));
  for (let k = 0; k < 6; k++) tiles.push(coin(200 + k * 260, 320 - (k % 2) * 40));
  return { tiles, flagX, caveX };
}

// Genera los tiles de una etapa. Los modos cooperativos varían con el nivel.
export function tilesForLevel(mode: BrosMode, level: number = 1): BrosTile[] {
  const width = worldWidthForLevel(mode, level);
  const base =
    mode === "lives" ? livesTiles().tiles
    : mode === "coop" ? coopTiles(level, width).tiles
    : mode === "temple" ? templeTiles(level, width).tiles
    : raceTiles().tiles;
  return [...base, ...powerStars(width), heartPickup(width)];
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
    isBubble: false,
    carrying: null,
    carriedBy: null,
    interactCd: 0,
  };
}

// Enemigos que patrullan de un lado a otro. Aparecen en los modos
// cooperativos y crecen con la etapa; en la 3ª hay un jefe final más grande
// cerca de la meta (que quedó al fondo del mundo largo).
export function enemiesForLevel(mode: BrosMode, level: number = 1, width: number = SCREEN_WIDTH): Enemy[] {
  const base: Enemy[] = [];
  if (mode === "coop") {
    base.push({ id: "e1", x: 480, y: 380, w: 28, h: 40, minX: 320, maxX: Math.min(width * 0.5, 900), dir: -1, speed: 2, boss: false });
    if (level >= 2) base.push({ id: "e2", x: Math.min(width * 0.55, 1200), y: 320, w: 28, h: 40, minX: Math.min(width * 0.5, 1000), maxX: Math.max(width * 0.7, width - 320), dir: 1, speed: 2.6, boss: false });
    if (level >= 2) base.push({ id: "f1", x: Math.min(width * 0.62, 1400), y: 360, baseY: 360, w: 24, h: 24, minX: Math.min(width * 0.5, 1200), maxX: Math.min(width * 0.75, 1700), dir: 1, speed: 2.2, flyer: true });
    if (level >= 3) base.push({ id: "boss", x: width - 120, y: 256, w: 46, h: 66, minX: width - 220, maxX: width - 60, dir: -1, speed: 3, boss: true, hp: BOSS_HP });
  }
  if (mode === "temple") {
    base.push({ id: "g1", x: 520, y: 320, w: 26, h: 40, minX: 470, maxX: 720, dir: -1, speed: 2, boss: false });
    if (level >= 2) base.push({ id: "g2", x: Math.min(width * 0.6, 1300), y: 420, w: 26, h: 40, minX: Math.min(width * 0.55, 1200), maxX: Math.min(width * 0.72, 1600), dir: 1, speed: 2.6, boss: false });
    if (level >= 3) base.push({ id: "f2", x: width * 0.72, y: 250, baseY: 250, w: 24, h: 24, minX: width * 0.62, maxX: width * 0.8, dir: -1, speed: 2.4, flyer: true });
    if (level >= 3) base.push({ id: "boss", x: width - 120, y: 380, w: 46, h: 66, minX: width - 220, maxX: width - 50, dir: -1, speed: 3, boss: true, hp: BOSS_HP });
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
    const stun = e.stun ? e.stun - 1 : 0;
    // Enemigos voladores: además de patrullar en horizontal, bobean en vertical.
    if (e.flyer) {
      const phase = (e.phase ?? 0) + 0.15;
      const baseY = e.baseY ?? e.y;
      return { ...e, x, dir, stun, phase, y: baseY + Math.sin(phase) * 16 };
    }
    return { ...e, x, dir, stun };
  });
}

// ¿Un jugador colisiona con un enemigo? (sin contar al jefe en su стun)
export function hitEnemy(p: BrosPlayer, enemies: Enemy[]): boolean {
  return enemies.some(
    (e) =>
      (e.stun ?? 0) <= 0 &&
      p.x < e.x + e.w && p.x + p.width > e.x &&
      p.y < e.y + e.h && p.y + p.height > e.y,
  );
}

// Salto encima de un enemigo: lo destruye (normal) o le saca vida al jefe.
// Devuelve los enemigos actualizados y si hubo un "piso justo" (rebote).
export function stompEnemy(
  player: BrosPlayer,
  enemies: Enemy[],
): { enemies: Enemy[]; bounced: boolean; coins: number } {
  let bounced = false;
  let coins = 0;
  const next = enemies.map((e) => {
    if ((e.stun ?? 0) > 0) return e; // no se puede golpear mientras se recupera
    const touchX = player.x < e.x + e.w && player.x + player.width > e.x;
    const falling = player.vy > 0;
    const feetJustAbove =
      player.y + player.height >= e.y &&
      player.y + player.height <= e.y + e.h * 0.65;
    if (touchX && falling && feetJustAbove) {
      bounced = true;
      if (e.boss) {
        const nhp = (e.hp ?? 1) - 1;
        if (nhp <= 0) { coins += 3; return null; } // jefe vencido: +3 monedas
        return { ...e, hp: nhp, stun: 24 };
      }
      coins += 1; // enemigo normal pisado: +1 moneda
      return null;
    }
    return e;
  }).filter((e): e is Enemy => e !== null);
  return { enemies: next, bounced, coins };
}

// Reconstruye completo el estado de una etapa (mapa + enemigos + salida),
// usado para avanzar de nivel o reiniciar la etapa tras perder todas las vidas.
export function makeLevel(mode: BrosMode, level: number, players: BrosPlayer[]): BrosGameState {
  const width = worldWidthForLevel(mode, level);
  return {
    players: players.map((p) => ({ ...resetPlayer(p), lives: 3 })),
    tiles: tilesForLevel(mode, level).map((t) => ({ ...t })),
    enemies: enemiesForLevel(mode, level, width),
    phase: "playing",
    winner: null,
    mode,
    level,
    eTick: 0,
    worldW: width,
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
    coyote: 0,
    shields: 0,
    isBubble: false,
    carrying: null,
    carriedBy: null,
    interactCd: 0,
    emote: null,
    emoteT: 0,
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
    coyote: 0,
    shields: 0,
    isBubble: false,
    carrying: null,
    carriedBy: null,
    interactCd: 0,
    emote: null,
    emoteT: 0,
  },
];

export function createInitialGameState(mode: BrosMode = "race"): BrosGameState {
  const width = worldWidthForLevel(mode, 1);
  return {
    players: defaultPlayers.map((p) => ({ ...p })),
    tiles: tilesForLevel(mode, 1).map((t) => ({ ...t })),
    enemies: enemiesForLevel(mode, 1, width),
    phase: "playing",
    winner: null,
    mode,
    level: 1,
    eTick: 0,
    worldW: width,
  };
}

export function setPhase(state: BrosGameState, phase: Phase): BrosGameState {
  return { ...state, phase };
}

export function applyInput(player: BrosPlayer, input: "left" | "right" | "up" | "stop" | "jumpcut"): BrosPlayer {
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
    // Salto desde el suelo, con coyote time o como doble salto.
    if (p.onGround || (p.coyote ?? 0) > 0 || (p.jumped && Math.abs(p.vy) < 4)) {
      p.vy = JUMP_FORCE;
      p.onGround = false;
      p.jumped = true;
    }
    p.coyote = 0; // la ventana se consume al saltar
  } else if (input === "jumpcut") {
    // Salto variable: soltar el botón corta el impulso ascendente a la mitad.
    if (p.vy < 0) p.vy = p.vy * 0.45;
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

// Overlap de cajas AABB entre dos jugadores (para rescates y contactos).
export const aabbOverlap = (a: BrosPlayer, b: BrosPlayer): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

// ¿Hay jugadores sobre la placa de ese par? Las placas "both" exigen a los dos.
export function platePressed(tiles: BrosTile[], pair: number, players: BrosPlayer[]): boolean {
  const plate = tiles.find((t) => t.type === "plate" && t.pair === pair);
  if (!plate) return false;
  const pressing = players.filter(
    (p) =>
      p.y + p.height >= plate.y - 2 &&
      p.y + p.height <= plate.y + plate.h + 2 &&
      p.x + p.width > plate.x &&
      p.x < plate.x + plate.w,
  );
  return plate.both ? pressing.length >= 2 : pressing.length >= 1;
}

// ¿Alguien está tocando (manteniendo) la palanca de ese par?
export function leverHeld(tiles: BrosTile[], pair: number, players: BrosPlayer[]): boolean {
  const lever = tiles.find((t) => t.type === "lever" && t.pair === pair);
  if (!lever) return false;
  return players.some(
    (p) =>
      p.x < lever.x + lever.w &&
      p.x + p.width > lever.x &&
      p.y < lever.y + lever.h &&
      p.y + p.height > lever.y,
  );
}

// Un portón cooperativo se abre mientras su placa (simple o doble) esté pisada,
// o mientras alguien mantenga su palanca presionada.
export function gateOpen(tiles: BrosTile[], pair: number, players: BrosPlayer[]): boolean {
  return platePressed(tiles, pair, players) || leverHeld(tiles, pair, players);
}

export function resolveCollisions(
  player: BrosPlayer,
  tiles: BrosTile[],
  players: BrosPlayer[] = [player],
  opts?: { coop?: boolean },
): BrosPlayer {
  const p = { ...player };
  const solid: BrosTile[] = tiles.filter(
    (t) =>
      t.type === "ground" ||
      t.type === "platform" ||
      (t.type === "gate" && !gateOpen(tiles, t.pair ?? 0, players)),
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
  if (standing) {
    p.onGround = true;
    p.coyote = COYOTE_FRAMES; // refrescá la ventana mientras estás parado
  } else {
    p.onGround = false;
    p.coyote = Math.max(0, (p.coyote ?? 0) - 1); // agotá la ventana en el aire
  }

  // No salirse por el borde izquierdo (el derecho lo marca la meta).
  if (p.x < 0) p.x = 0;

  if (p.y > SCREEN_HEIGHT) {
    if (opts?.coop) {
      // Cooperativo: caer al vacío no es muerte inmediata. El jugador queda en
      // burbuja (isBubble) flotando hasta que la pareja lo rescate tocándolo.
      p.lives -= 1;
      p.isBubble = true;
      p.carrying = null;
      p.carriedBy = null;
      p.vx = 0;
      p.vy = 0;
      p.x = Math.max(p.x, 80); // la burbuja sube cerca de donde cayó
      p.y = BUBBLE_TOP;
      p.onGround = false;
      p.jumped = true; // evita doble salto mientras flota
    } else {
      p.lives -= 1;
      p.x = p.id === "red" ? 100 : 160;
      p.y = 300;
      p.vx = 0;
      p.vy = 0;
      p.onGround = false;
      p.jumped = false;
    }
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

// Recolectar una estrella: otorga un escudo que aguanta un golpe de enemigo.
export function collectPower(
  player: BrosPlayer,
  tiles: BrosTile[],
): { player: BrosPlayer; collected: BrosTile[] } {
  const p = { ...player };
  const remaining: BrosTile[] = [];
  const collected: BrosTile[] = [];

  for (const t of tiles) {
    if (t.type === "power" && !t.collected) {
      const overlap =
        p.x < t.x + t.w && p.x + p.width > t.x && p.y < t.y + t.h && p.y + p.height > t.y;
      if (overlap) {
        collected.push(t);
        p.shields = Math.min(3, (p.shields ?? 0) + 1);
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

// Recolectar un corazón (1UP): otorga una vida extra (con tope para no abusar).
export function collectHeart(
  player: BrosPlayer,
  tiles: BrosTile[],
): { player: BrosPlayer; collected: BrosTile[] } {
  const p = { ...player };
  const remaining: BrosTile[] = [];
  const collected: BrosTile[] = [];

  for (const t of tiles) {
    if (t.type === "heart" && !t.collected) {
      const overlap =
        p.x < t.x + t.w && p.x + p.width > t.x && p.y < t.y + t.h && p.y + p.height > t.y;
      if (overlap) {
        collected.push(t);
        p.lives = Math.min(MAX_LIVES, (p.lives ?? 0) + 1);
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
  p.y += p.vy; // <-- APLICA LA CAÍDA REAL
  p.anim = player.anim; // carryover para animación continua
  return p;
}

// --- Mecánicas cooperativas ---------------------------------------------

// Cargar a la pareja: la sube sobre su cabeza. Falla si hay burbujas, ya está
// cargando/a bordo, está en el aire, está de espaldas o fuera de rango.
export function tryGrab(
  actor: BrosPlayer,
  partner: BrosPlayer,
): { actor: BrosPlayer; partner: BrosPlayer } | null {
  if (!partner) return null;
  if (actor.isBubble || partner.isBubble) return null;
  if (actor.carrying) return null;
  if (partner.carriedBy) return null;
  if ((actor.interactCd ?? 0) > 0) return null;
  if (!actor.onGround) return null;
  const dx = partner.x - actor.x;
  const inFront = actor.facing === "right" ? dx >= -6 : dx <= 6;
  if (!inFront || Math.abs(dx) > GRAB_RANGE || Math.abs(partner.y - actor.y) > 54) return null;
  return {
    actor: { ...actor, carrying: partner.id, interactCd: GRAB_CD },
    partner: { ...partner, carriedBy: actor.id, onGround: false },
  };
}

// Lanzar a la pareja que llevamos: la impulsa en la dirección de la mirada,
// hacia plataformas lejanas. El lanzado puede hacer doble salto a mitad vuelo.
export function tryThrow(
  actor: BrosPlayer,
  partner: BrosPlayer,
): { actor: BrosPlayer; partner: BrosPlayer } | null {
  if (!partner || actor.carrying !== partner.id) return null;
  const dir = actor.facing === "right" ? 1 : -1;
  return {
    actor: { ...actor, carrying: null, interactCd: GRAB_CD },
    partner: {
      ...partner,
      carriedBy: null,
      onGround: false,
      jumped: false,
      vx: dir * THROW_SPEED,
      vy: THROW_UP,
      interactCd: GRAB_CD,
    },
  };
}

// Mientras un jugador lleva a otro, garantiza que quede sentado sobre su cabeza.
export function attachCarried(partner: BrosPlayer, carrier: BrosPlayer): BrosPlayer {
  if (partner.carriedBy !== carrier.id || !carrier) return partner;
  return {
    ...partner,
    x: carrier.x + carrier.width / 2 - partner.width / 2,
    y: carrier.y - partner.height,
    vx: carrier.vx,
    vy: 0,
    onGround: false,
  };
}

// Burbuja de rescate: el jugador no cae, sube hasta el tope y bobea suavemente
// hasta que la pareja toque su caja (AABB) para liberarlo.
export function updateBubble(p: BrosPlayer): BrosPlayer {
  if (!p.isBubble) return p;
  const bob = Math.sin(p.anim * Math.PI * 1.4);
  const y = p.y > BUBBLE_TOP ? p.y - BUBBLE_RISE : BUBBLE_TOP + bob * 4;
  return { ...p, y, vx: 0, vy: 0, onGround: false };
}

// Rescate: si uno está en burbuja y el otro toca su AABB, se libera y salta.
export function tryRescueBubble(
  a: BrosPlayer,
  b: BrosPlayer,
): { a: BrosPlayer; b: BrosPlayer } {
  const free = (p: BrosPlayer): BrosPlayer => ({
    ...p,
    isBubble: false,
    carriedBy: null,
    carrying: null,
    interactCd: GRAB_CD,
    vy: -3,
    onGround: false,
  });
  if (a.isBubble && !b.isBubble && aabbOverlap(a, b)) {
    return { a: free(a), b: { ...b, interactCd: GRAB_CD } };
  }
  if (b.isBubble && !a.isBubble && aabbOverlap(b, a)) {
    return { a: { ...a, interactCd: GRAB_CD }, b: free(b) };
  }
  return { a, b };
}

// Emote rápido que flota encima del jugador durante unos frames.
export function emote(p: BrosPlayer, e: string): BrosPlayer {
  return { ...p, emote: e, emoteT: EMOTE_FRAMES };
}

// Consume un frame de vida del emote; al agotarse se limpia.
export function tickEmote(p: BrosPlayer): BrosPlayer {
  if (!p.emote) return p;
  const t = (p.emoteT ?? 0) - 1;
  if (t <= 0) return { ...p, emote: null, emoteT: 0 };
  return { ...p, emoteT: t };
}
