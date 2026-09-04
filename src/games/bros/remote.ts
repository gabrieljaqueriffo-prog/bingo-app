// Salas online de Super Bros vía Supabase (tabla `rooms`, kind = "bros").
// Cada jugador envía inputs y el motor se ejecuta localmente (resync periódico).
import { getSupabase } from "../../lib/supabase";
import {
  applyInput,
  applyGravity,
  collectCoins,
  createInitialGameState,
  reachFlag,
  resolveCollisions,
  type BrosGameState,
  type BrosMode,
  type BrosPlayer,
  type PlayerId,
} from "./engine";
import { type PlayerSnapshot } from "./interpolate";

export type BROS_PLAYER_ID = PlayerId;

export interface BrosRoom {
  code: string;
  rev: number;
  state: BrosGameState;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const makeBrosCode = (): string =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export const brosLink = (code: string): string => `${location.origin}${location.pathname}#sala=${code}&juego=bros`;

export const parseBrosLink = (): string | null => {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const code = params.get("sala");
  if (!code || !/^[A-Z0-9]{4,8}$/i.test(code) || params.get("juego") !== "bros") return null;
  return code.toUpperCase();
};

export const fetchBrosRoom = async (code: string): Promise<BrosRoom | null> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rooms")
    .select("code, rev, payload")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return { code: data.code, rev: data.rev as number, state: (data.payload as { state: BrosGameState }).state };
};

export const updateBrosRoom = async (
  code: string,
  currentRev: number,
  state: BrosGameState,
  selfId?: PlayerId,
  attempts = 4,
): Promise<BrosRoom | null> => {
  const supabase = getSupabase();
  let row = await fetchBrosRoom(code);
  if (!row || row.rev < currentRev) return null;
  for (let i = 0; i < attempts; i++) {
    const nextRev = row.rev + 1;
    // Merge antes de escribir: nunca "des-recolectamos" tiles que el otro
    // jugador ya agarró, y el rival conserva SU jugador simulado.
    const payloadState = selfId ? mergeBrosStates(state, row.state, selfId) : state;
    const { error } = await supabase
      .from("rooms")
      .update({ payload: { state: payloadState }, rev: nextRev })
      .eq("code", code)
      .lt("rev", nextRev);
    if (!error) return { code, rev: nextRev, state: payloadState };
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    row = await fetchBrosRoom(code);
    if (!row || row.rev < currentRev) return null;
  }
  return null;
};

// Combina el estado local con el remoto sin perder progreso de ninguno:
// - cada jugador conserva SU copia simulada de sí mismo;
// - los tiles (monedas/estrellas/corazones) quedan recolectados si CUALQUIERA
//   de los dos los marcó (así las monedas no "renacen" por el sync);
// - el rival aporta enemigos/mundo por ser la versión más fresca de la sala.
export const mergeBrosStates = (
  local: BrosGameState,
  remote: BrosGameState,
  selfId: PlayerId,
): BrosGameState => ({
  ...remote,
  players: remote.players.map((rp) =>
    rp.id === selfId ? (local.players.find((p) => p.id === selfId) ?? rp) : rp,
  ),
  tiles: remote.tiles.map((rt) => {
    const lt = local.tiles.find((t) => t.type === rt.type && t.x === rt.x && t.y === rt.y);
    return lt?.collected ? { ...rt, collected: true } : rt;
  }),
  winner: local.winner ?? remote.winner,
  phase: local.phase === "finished" || remote.phase === "finished" ? "finished" : remote.phase,
});

export const createBrosRoom = async (
  mode: BrosMode,
): Promise<{ code: string } | { code: null; error: string }> => {
  const supabase = getSupabase();
  const code = makeBrosCode();
  const row = { code, kind: "bros", rev: 1, payload: { state: createInitialGameState(mode) } };
  const { error } = await supabase.from("rooms").insert(row);
  if (error) return { code: null, error: `${error.message} (código ${error.code ?? "?"})` };
  return { code };
};

export const joinBrosRoom = async (code: string): Promise<BrosRoom | "missing"> => {
  const existing = await fetchBrosRoom(code);
  if (!existing) return "missing";
  rememberBrosRole(code);
  return existing;
};

export const subscribeBrosRoom = (code: string, onUpdate: (row: BrosRoom) => void): (() => void) => {
  const supabase = getSupabase();
  let lastRev = -1;
  let cancelled = false;

  const readLatest = async () => {
    try {
      const row = await fetchBrosRoom(code);
      if (row && !cancelled && row.rev > lastRev) {
        lastRev = row.rev;
        onUpdate(row);
      }
    } catch {
      // Realtime or the next polling attempt can recover the connection.
    }
  };

  const channel = supabase
    .channel(`room-${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
      readLatest,
    )
    .subscribe();

  void readLatest();
  // Respaldo para proyectos donde la publicación supabase_realtime aún no incluye rooms.
  const poll = window.setInterval(() => void readLatest(), 500);

  return () => {
    cancelled = true;
    window.clearInterval(poll);
    void supabase.removeChannel(channel);
  };
};

const rememberBrosRole = (code: string): void => {
  try {
    localStorage.setItem(`bros-role-${code}`, "guest");
  } catch {}
};

export const processInputs = (state: BrosGameState, inputs: Record<string, "left" | "right" | "up">): BrosGameState => {
  const next: BrosGameState = { ...state, players: [], tiles: [...state.tiles] };
  const list: BrosPlayer[] = [];

  for (const player of state.players) {
    let p = { ...player };
    const input = inputs[player.id];
    if (input) p = applyInput(p, input);
    p = applyGravity(p);
    // Pasamos la lista completa para que las compuertas dobles/palancas de
    // cooperativo tengan en cuenta a ambos jugadores.
    p = resolveCollisions(p, next.tiles, [...list, p]);
    p.x += p.vx;
    list.push(p);

    if (reachFlag(p, next.tiles)) {
      next.winner = p.id;
      next.phase = "finished";
    }
  }
  next.players = list;

  const { player: red, collected: rCoins } = collectCoins(next.players.find((p) => p.id === "red")!, next.tiles);
  const { player: blue, collected: bCoins } = collectCoins(next.players.find((p) => p.id === "blue")!, next.tiles);
  next.players = next.players.map((p) => {
    if (p.id === "red") return { ...p, ...red };
    if (p.id === "blue") return { ...p, ...blue };
    return p;
  });
  next.tiles = next.tiles.map((t) => {
    if (rCoins.some((c) => c.x === t.x && c.y === t.y)) return { ...t, collected: true };
    if (bCoins.some((c) => c.x === t.x && c.y === t.y)) return { ...t, collected: true };
    return t;
  });

  return next;
};

// --- Broadcast de posición en tiempo real (para suavizar el rival) -------
// La base de datos (tabla `rooms`) es la fuente de verdad del estado; ademas,
// cada jugador difunde su snapshot ~10 veces/seg por Realtime para que el rival
// se dibuje con interpolación en vez de a saltos de 250ms.

const PLAYER_EVENT = "player-pos";

export interface PlayerBroadcast {
  send: (s: PlayerSnapshot) => void;
  stop: () => void;
}

// Crea el canal de broadcast, descarta los mensajes propios y llama `onRemote`
// con cada snapshot del rival. Devuelve { send, stop } para emitir y limpiar.
export const setupPlayerBroadcast = (
  code: string,
  selfId: BROS_PLAYER_ID,
  onRemote: (s: PlayerSnapshot) => void,
): PlayerBroadcast => {
  const supabase = getSupabase();
  const channel = supabase.channel(`bros-broadcast-${code}`, {
    config: { broadcast: { self: false } },
  });
  channel
    .on("broadcast", { event: PLAYER_EVENT }, ({ payload }) => {
      const s = payload as PlayerSnapshot;
      if (!s || s.id === selfId) return;
      onRemote(s);
    })
    .subscribe();

  const send = (s: PlayerSnapshot) => {
    void channel.send({ type: "broadcast", event: PLAYER_EVENT, payload: s });
  };

  const stop = () => {
    void supabase.removeChannel(channel);
  };

  return { send, stop };
};
