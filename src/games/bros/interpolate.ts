// Interpolación de posición para el jugador remoto.
// Guardamos las 2 últimas muestras recibidas por broadcast y, en el render,
// interpola (lerp) entre ellas con un pequeño retardo fijo (LATENCY_MS) para
// suavizar los saltos causados por la latencia de la red.

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: string; // "lobby" | "playing" | ...
  isBubble: boolean;
  carrying: string | null;
  carriedBy: string | null;
  emote: string | null;
  t: number; // marca de tiempo del emisor
}

// Retardo fijo de render: mostramos el estado remoto "atrasado" LATENCY_MS
// respecto de las muestras para que el lerp tenga data para interpolar en vez
// de quedarse sin buffer (evita congelamientos y teleports).
export const LATENCY_MS = 90;

export class SnapshotBuffer {
  private buffer = new Map<string, PlayerSnapshot[]>();

  push(s: PlayerSnapshot): void {
    const arr = this.buffer.get(s.id) ?? [];
    arr.push(s);
    if (arr.length > 2) arr.shift(); // conservamos solo las 2 más recientes
    this.buffer.set(s.id, arr);
  }

  // Devuelve la posición interpolada para `now`. Si solo hay una muestra,
  // devuelve esa; si no hay ninguna, null.
  sample(id: string, now: number): PlayerSnapshot | null {
    const arr = this.buffer.get(id);
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1) return arr[0];

    const [older, newer] = arr;
    const span = newer.t - older.t;
    if (span <= 0) return newer;

    // Renderizamos "atrasados" ~LATENCY_MS para tener un par de muestras válidas.
    const renderT = now - LATENCY_MS;
    const f = Math.max(0, Math.min(1, (renderT - older.t) / span));
    const lerp = (a: number, b: number) => a + (b - a) * f;

    return {
      ...newer,
      x: lerp(older.x, newer.x),
      y: lerp(older.y, newer.y),
      vx: lerp(older.vx, newer.vx),
      vy: lerp(older.vy, newer.vy),
    };
  }

  clear(): void {
    this.buffer.clear();
  }
}