// Salas online del Mentiroso vía Supabase (misma tabla `rooms`, kind = "mentiroso").
// guarda el estado completo del motor (GameState). Cada dispositivo oculta en
// la UI los dados del rival hasta que una duda los revela.
import { getSupabase } from "../../lib/supabase";
import { startGame, type GameState } from "./engine";

export type MentRow = {
  code: string;
  rev: number;
  state: GameState;
};

export type MentRole = "host" | "guest";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const makeMentCode = (): string =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export const mentLink = (code: string): string => {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#sala=${code}&juego=mentiroso`;
};

export const parseMentLink = (): string | null => {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const code = params.get("sala");
  if (!code || !/^[A-Z0-9]{4,8}$/i.test(code) || params.get("juego") !== "mentiroso") return null;
  return code.toUpperCase();
};

const remember = (code: string, role: MentRole): void => {
  try {
    localStorage.setItem(`ment-role-${code}`, role);
  } catch {
    /* sin almacenamiento */
  }
};

export const recallMentRole = (code: string): MentRole => {
  try {
    return (localStorage.getItem(`ment-role-${code}`) as MentRole | null) ?? "host";
  } catch {
    return "host";
  }
};

export const fetchMentRoom = async (code: string): Promise<MentRow | null> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rooms")
    .select("code, rev, payload")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return { code: data.code, rev: data.rev as number, state: (data.payload as { state: GameState }).state };
};

// Guarda el estado con control de versión. Reintenta si alguien escribió antes.
export const updateMentRoom = async (
  code: string,
  currentRev: number,
  state: GameState,
  attempts = 4,
): Promise<MentRow | null> => {
  const supabase = getSupabase();
  let row = await fetchMentRoom(code);
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
    row = await fetchMentRoom(code);
    if (!row || row.rev < currentRev) return null;
  }
  return null;
};

export const createMentRoom = async (
  name: string,
): Promise<{ code: string; role: MentRole } | null> => {
  const supabase = getSupabase();
  const code = makeMentCode();
  // El anfitrión es el jugador 1 (p1); el invitado se usará al unirse.
  const state = startGame([name, "Jugador 2"]);
  const row = { code, kind: "mentiroso", rev: 1, payload: { state } };
  const { error } = await supabase.from("rooms").insert(row);
  if (error) return null;
  remember(code, "host");
  return { code, role: "host" };
};

export const joinMentRoom = async (
  code: string,
  name: string,
): Promise<MentRow | "missing"> => {
  const existing = await fetchMentRoom(code);
  if (!existing) return "missing";

  // Si el segundo jugador todavía está libre, lo registramos.
  if (existing.state.players[1].name === "Jugador 2") {
    const renamed = {
      ...existing.state,
      players: existing.state.players.map((p, i) =>
        i === 1 ? { ...p, name } : p,
      ),
    };
    const updated = await updateMentRoom(code, existing.rev, renamed);
    if (!updated) return "missing";
    existing.state = updated.state;
    existing.rev = updated.rev;
  }
  remember(code, "guest");
  return existing;
};

export const subscribeMentRoom = (
  code: string,
  onUpdate: (row: MentRow) => void,
): (() => void) => {
  const supabase = getSupabase();
  let lastRev = -1;
  let cancelled = false;

  const channel = supabase
    .channel(`room-${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
      async () => {
        const row = await fetchMentRoom(code);
        if (row && !cancelled && row.rev > lastRev) {
          lastRev = row.rev;
          onUpdate(row);
        }
      },
    )
    .subscribe();

  void fetchMentRoom(code).then((row) => {
    if (row && !cancelled) {
      lastRev = Math.max(lastRev, row.rev);
      onUpdate(row);
    }
  });
  const poll = window.setInterval(() => {
    void fetchMentRoom(code).then((row) => {
      if (row && !cancelled && row.rev > lastRev) {
        lastRev = row.rev;
        onUpdate(row);
      }
    }).catch(() => {});
  }, 500);

  return () => {
    cancelled = true;
    window.clearInterval(poll);
    void supabase.removeChannel(channel);
  };
};