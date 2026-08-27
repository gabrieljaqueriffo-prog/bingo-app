// Salas online de Batalla Naval vía Supabase (misma tabla `rooms`, kind = "naval").
// Cada jugador conoce su propia grilla y el estado sincronizado completo.
import { getSupabase } from "../../lib/supabase";
import {
  defaultPlacements0,
  defaultPlacements1,
  placeAll,
  startGame,
  type GameState,
} from "./engine";

export type NavalRow = {
  code: string;
  rev: number;
  state: GameState;
};

export type NavalRole = "host" | "guest";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const makeNavalCode = (): string =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export const navalLink = (code: string): string => {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#sala=${code}&juego=naval`;
};

export const parseNavalLink = (): string | null => {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const code = params.get("sala");
  if (!code || !/^[A-Z0-9]{4,8}$/i.test(code) || params.get("juego") !== "naval") return null;
  return code.toUpperCase();
};

const remember = (code: string, role: NavalRole): void => {
  try {
    localStorage.setItem(`naval-role-${code}`, role);
  } catch {
    /* sin almacenamiento */
  }
};

export const recallNavalRole = (code: string): NavalRole => {
  try {
    return (localStorage.getItem(`naval-role-${code}`) as NavalRole | null) ?? "host";
  } catch {
    return "host";
  }
};

export const fetchNavalRoom = async (code: string): Promise<NavalRow | null> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rooms")
    .select("code, rev, state")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return { code: data.code, rev: data.rev as number, state: data.state as GameState };
};

export const updateNavalRoom = async (
  code: string,
  currentRev: number,
  state: GameState,
  attempts = 4,
): Promise<NavalRow | null> => {
  const supabase = getSupabase();
  let row = await fetchNavalRoom(code);
  if (!row || row.rev < currentRev) return null;
  for (let i = 0; i < attempts; i++) {
    const nextRev = row.rev + 1;
    const { error } = await supabase
      .from("rooms")
      .update({ state, rev: nextRev })
      .eq("code", code)
      .lt("rev", nextRev);
    if (!error) return { code, rev: nextRev, state };
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    row = await fetchNavalRoom(code);
    if (!row || row.rev < currentRev) return null;
  }
  return null;
};

export const createNavalRoom = async (
  guestName: string,
): Promise<{ code: string; role: NavalRole } | null> => {
  const supabase = getSupabase();
  const code = makeNavalCode();
  const row = { code, kind: "naval", rev: 1, state: startGame() };
  const { error } = await supabase.from("rooms").insert(row);
  if (error) return null;
  remember(code, "host");
  return { code, role: "host" };
};

export const joinNavalRoom = async (
  code: string,
): Promise<NavalRow | "missing"> => {
  const existing = await fetchNavalRoom(code);
  if (!existing) return "missing";
  // Marcar que la partida comenzó (bandera para que el anfitrión sepa).
  if (!existing.state.started) {
    const updated = await updateNavalRoom(code, existing.rev, {
      ...existing.state,
      started: true,
      boards: [
        placeAll(existing.state, 0, defaultPlacements0),
        placeAll(existing.state, 1, defaultPlacements1),
      ],
      phase: "battle",
    });
    if (updated) {
      existing.state = updated.state;
      existing.rev = updated.rev;
    }
  }
  remember(code, "guest");
  return existing;
};

export const subscribeNavalRoom = (
  code: string,
  onUpdate: (row: NavalRow) => void,
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
        const row = await fetchNavalRoom(code);
        if (row && !cancelled && row.rev > lastRev) {
          lastRev = row.rev;
          onUpdate(row);
        }
      },
    )
    .subscribe();

  void fetchNavalRoom(code).then((row) => {
    if (row && !cancelled) {
      lastRev = Math.max(lastRev, row.rev);
      onUpdate(row);
    }
  });

  return () => {
    cancelled = true;
    void supabase.removeChannel(channel);
  };
};