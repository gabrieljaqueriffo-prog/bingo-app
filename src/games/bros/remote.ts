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
} from "./engine";

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
  attempts = 4,
): Promise<BrosRoom | null> => {
  const supabase = getSupabase();
  let row = await fetchBrosRoom(code);
  if (!row || row.rev < currentRev) return null;
  for (let i = 0; i < attempts; i++) {
    const nextRev = row.rev + 1;
    const { error } = await supabase
      .from("rooms")
      .update({ payload: { state }, rev: nextRev })
      .eq("code", code)
      .lt("rev", nextRev);
    if (!error) return { code, rev: nextRev, state };
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    row = await fetchBrosRoom(code);
    if (!row || row.rev < currentRev) return null;
  }
  return null;
};

export const createBrosRoom = async (mode: BrosMode): Promise<{ code: string } | null> => {
  const supabase = getSupabase();
  const code = makeBrosCode();
  const row = { code, kind: "bros", rev: 1, payload: { state: createInitialGameState(mode) } };
  const { error } = await supabase.from("rooms").insert(row);
  if (error) { console.error("createBrosRoom:", error.message); return null; }
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

  for (const player of state.players) {
    let p = { ...player };
    const input = inputs[player.id];
    if (input) p = applyInput(p, input);
    p = applyGravity(p);
    p = resolveCollisions(p, next.tiles);
    p.x += p.vx;
    next.players.push(p);

    if (reachFlag(p, next.tiles)) {
      next.winner = p.id;
      next.phase = "finished";
    }
  }

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
