// Salas online del Stop vía Supabase (misma tabla `rooms`, kind = "stop").
// El estado del juego es serializable y vive en payload.data.
import { getSupabase } from "../../lib/supabase";
import { initialStopData, type StopData } from "./engine";

export type StopPayload = {
  names: [string | null, string | null];
  data: StopData;
};

export type StopRoomRow = {
  code: string;
  rev: number;
  payload: StopPayload;
};

export type StopRole = "host" | "guest";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const makeStopCode = (): string =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");

export const stopLink = (code: string): string => {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#sala=${code}&juego=stop`;
};

// Detecta enlaces de invitación al Stop (el app lo consulta al arrancar).
export const parseStopLink = (): string | null => {
  const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
  const params = new URLSearchParams(hash);
  const code = params.get("sala");
  if (!code || !/^[A-Z0-9]{4,8}$/i.test(code) || params.get("juego") !== "stop") return null;
  return code.toUpperCase();
};

const remember = (code: string, role: StopRole): void => {
  try {
    localStorage.setItem(`stop-role-${code}`, role);
  } catch {
    /* sin almacenamiento */
  }
};

export const recallStopRole = (code: string): StopRole => {
  try {
    return (localStorage.getItem(`stop-role-${code}`) as StopRole | null) ?? "host";
  } catch {
    return "host";
  }
};

export const fetchStopRoom = async (code: string): Promise<StopRoomRow | null> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .schema("public")
    .from("rooms")
    .select("code, kind, rev, payload")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error || !data || data.kind !== "stop") return null;
  return { code: data.code, rev: data.rev as number, payload: data.payload as StopPayload };
};

// Guarda los datos con control de versión. Si otro cliente escribió antes
// (rev más alta), reintenta transformando sobre lo último que había.
export const updateStopRoom = async (
  code: string,
  currentRev: number,
  transform: (payload: StopPayload) => StopPayload,
  attempts = 4,
): Promise<{ rev: number; payload: StopPayload } | null> => {
  const supabase = getSupabase();
  let row = await fetchStopRoom(code);
  if (!row || row.rev < currentRev) return null;

  for (let i = 0; i < attempts; i++) {
    const nextPayload = transform(row.payload);
    const nextRev = row.rev + 1;
    const { error } = await supabase
      .from("rooms")
      .update({ payload: nextPayload, rev: nextRev })
      .eq("code", code)
      .lt("rev", nextRev);
    if (!error) return { rev: nextRev, payload: nextPayload };
    // Alguien escribió entre medias: releer y reintentar.
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    row = await fetchStopRoom(code);
    if (!row) return null;
  }
  return null;
};

export const createStopRoom = async (
  name: string,
): Promise<{ code: string; role: StopRole } | null> => {
  const supabase = getSupabase();
  const code = makeStopCode();
  const row = {
    code,
    kind: "stop",
    rev: 1,
    payload: { names: [name, null], data: initialStopData() } satisfies StopPayload,
  };
  const { error } = await supabase.from("rooms").insert(row);
  if (error) return null;
  remember(code, "host");
  return { code, role: "host" };
};

export const joinStopRoom = async (
  code: string,
  name: string,
): Promise<StopRoomRow | "missing"> => {
  const existing = await fetchStopRoom(code);
  if (!existing) return "missing";

  if (!existing.payload.names[1]) {
    const updated = await updateStopRoom(code, existing.rev, (p) => ({
      ...p,
      names: [p.names[0] ?? "Jugador 1", name],
    }));
    if (!updated) return "missing";
    existing.payload = updated.payload;
    existing.rev = updated.rev;
  }
  remember(code, "guest");
  return existing;
};

// Suscripción realtime reutilizando el canal de la tabla rooms.
export const subscribeStopRoom = (
  code: string,
  onUpdate: (row: StopRoomRow) => void,
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
        const row = await fetchStopRoom(code);
        if (row && !cancelled && row.rev > lastRev) {
          lastRev = row.rev;
          onUpdate(row);
        }
      },
    )
    .subscribe();

  // Primer fetch inmediato para pintar el estado actual.
  void fetchStopRoom(code).then((row) => {
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
