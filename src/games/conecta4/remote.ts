// Salas online para Conecta 4 vía Supabase (tabla `rooms` + Realtime).
// El estado del motor es serializable, así que se guarda tal cual en un jsonb.
import { getSupabase } from "../../lib/supabase";
import { startGame, type GameState } from "./engine";

export type RoomKind = "conecta4";

export type RoomPayload = {
  names: [string | null, string | null]; // [anfitrión, invitado]
  state: GameState;
};

export type RoomRow = {
  code: string;
  kind: RoomKind;
  rev: number; // versión del estado; la más alta gana
  payload: RoomPayload;
  updated_at: string;
};

export type Role = "host" | "guest";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sin I, L, O, 0, 1 (confusas)

export const makeRoomCode = (): string =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

// Enlace compartible para que el otro jugador se una desde su celular.
export const roomLink = (code: string): string => {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#sala=${code}&juego=conecta4`;
};

// Parsea el enlace compartido; null si no apunta a una sala.
export const parseRoomLink = (): { code: string; game: RoomKind } | null => {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const code = params.get("sala");
  const game = params.get("juego");
  if (!code || !/^[A-Z0-9]{4,8}$/i.test(code)) return null;
  if (game !== "conecta4") return null;
  return { code: code.toUpperCase(), game };
};

// Crea una sala nueva con el anfitrión. Devuelve null si el código colisionó.
export const createRoom = async (name: string): Promise<{ code: string; role: Role } | null> => {
  const supabase = getSupabase();
  const code = makeRoomCode();
  const row: Omit<RoomRow, "updated_at"> = {
    code,
    kind: "conecta4",
    rev: 1,
    payload: { names: [name, null], state: startGame() },
  };
  const { error } = await supabase.from("rooms").insert(row);
  if (error) return null; // códigos repetidos son raros; el usuario reintenta
  rememberRole(code, "host");
  return { code, role: "host" };
};

// Se une a una sala existente y registra el nombre del invitado.
export const joinRoom = async (
  code: string,
  name: string,
): Promise<RoomRow | "missing"> => {
  const supabase = getSupabase();
  const existing = await fetchRoom(code);
  if (!existing) return "missing";

  // Si ya hay un estado en juego, nos unimos igual (reconexión o espectador del turno libre).
  if (!existing.payload.names[1]) {
    const next: RoomPayload = {
      ...existing.payload,
      names: [existing.payload.names[0] ?? "Jugador 1", name],
    };
    const { error } = await supabase
      .from("rooms")
      .update({ payload: next, rev: existing.rev + 1 })
      .eq("code", code)
      .lt("rev", existing.rev + 1); // guarda contra carreras simples
    if (error) return "missing";
    existing.payload = next;
    existing.rev += 1;
  }
  rememberRole(code, "guest");
  return existing;
};

export const fetchRoom = async (code: string): Promise<RoomRow | null> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("rooms")
    .select("code, kind, rev, payload, updated_at")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  return data as RoomRow;
};

// Guarda el nuevo estado con versión incrementada. Los clientes ignoran
// actualizaciones con rev menor o igual a la que ya tienen.
export const saveRoomState = async (room: RoomRow, state: GameState): Promise<void> => {
  const supabase = getSupabase();
  const nextPayload: RoomPayload = { ...room.payload, state };
  await supabase
    .from("rooms")
    .update({ payload: nextPayload, rev: room.rev + 1 })
    .eq("code", room.code)
    .lt("rev", room.rev + 1);
  room.rev += 1;
  room.payload = nextPayload;
};

// Suscripción en tiempo real a cambios de la sala. Devuelve la función para desuscribirse.
export const subscribeRoom = (
  code: string,
  onUpdate: (row: RoomRow) => void,
): (() => void) => {
  const supabase = getSupabase();
  let lastRev = -1;
  let cancelled = false;

  const readLatest = async () => {
    try {
      const row = await fetchRoom(code);
      if (row && !cancelled && row.rev > lastRev) {
        lastRev = row.rev;
        onUpdate(row);
      }
    } catch {}
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
  const poll = window.setInterval(() => void readLatest(), 500);

  return () => {
    cancelled = true;
    window.clearInterval(poll);
    void supabase.removeChannel(channel);
  };
};

// Papel local por sala (quién es host y quién guest) guardado en localStorage.
const ROLE_KEY = (code: string) => `c4-role-${code}`;

export const rememberRole = (code: string, role: Role): void => {
  try {
    localStorage.setItem(ROLE_KEY(code), role);
  } catch {
    /* almacenamiento no disponible */
  }
};

export const recallRole = (code: string): Role => {
  try {
    return (localStorage.getItem(ROLE_KEY(code)) as Role | null) ?? "host";
  } catch {
    return "host";
  }
};
