// Conecta 4 online: cada jugador desde su celular, sincronizados con Supabase.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CircleDot, Copy, Check, Users } from "lucide-react";
import { dropDisc, startGame, type GameState } from "./engine";
import { Board } from "./Board";
import {
  createRoom,
  fetchRoom,
  joinRoom,
  parseRoomLink,
  roomLink,
  saveRoomState,
  subscribeRoom,
  type Role,
  type RoomRow,
} from "./remote";
import { isSupabaseConfigured, supabaseKeyError } from "../../lib/supabase";
import "./conecta4.css";

type Screen = "menu" | "waiting" | "play";

export default function Conecta4RemoteApp({ onExit }: { onExit: () => void }) {
  if (!isSupabaseConfigured) return <Unconfigured onExit={onExit} />;
  // Si el enlace trae ?#sala=..., arrancamos directo en unirse.
  const link = parseRoomLink();
  return <RemoteInner onExit={onExit} initialCode={link?.code ?? null} />;
}

function Unconfigured({ onExit }: { onExit: () => void }) {
  return (
    <main className="conecta4 setup">
      <header className="c4-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Conecta 4 Online</h1>
        <span />
      </header>
      <section className="c4-hero">
        <Users size={56} />
        <h2>Modo online sin configurar</h2>
        {supabaseKeyError ? (
          <p className="c4-error">{supabaseKeyError}</p>
        ) : (
          <p>
            Para jugar entre celulares hace falta conectar Supabase (gratis).
            Creá el proyecto en supabase.com, ejecutá el SQL de la tabla
            <code> rooms </code> y completá el archivo <code>.env</code>.
          </p>
        )}
      </section>
    </main>
  );
}

function RemoteInner({
  onExit,
  initialCode,
}: {
  onExit: () => void;
  initialCode: string | null;
}) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [joinCode, setJoinCode] = useState(initialCode ?? "");

  const [room, setRoom] = useState<RoomRow | null>(null);
  const [role, setRole] = useState<Role>("host");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryJoin = async (code: string) => {
    setBusy(true);
    setError(null);
    const name = storedName() ?? promptName();
    if (!name) {
      setBusy(false);
      return;
    }
    const result = await joinRoom(code.trim().toUpperCase(), name);
    if (result === "missing") {
      setError("No encontré esa sala. Revisá el código.");
      setBusy(false);
      return;
    }
    setRole("guest");
    setRoom(result);
    setScreen("play");
    setBusy(false);
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    const name = storedName() ?? promptName();
    if (!name) {
      setBusy(false);
      return;
    }
    const created = await createRoom(name);
    if (!created) {
      setError("No pude crear la sala, intentá de nuevo.");
      setBusy(false);
      return;
    }
    const row = await fetchRoom(created.code);
    if (!row) {
      setError("La sala se creó pero no responde. Intentá de nuevo.");
      setBusy(false);
      return;
    }
    setRole(created.role);
    setRoom(row);
    setScreen("waiting");
    setBusy(false);
  };

  if (screen === "menu") {
    return (
      <main className="conecta4 setup">
        <header className="c4-head">
          <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
          <h1>Conecta 4 · Online</h1>
          <span />
        </header>
        <section className="c4-hero">
          <CircleDot size={48} />
          <p className="eyebrow">CADA UNO DESDE SU CELULAR</p>
          <p>Crea una sala y compartí el código, o unite con uno.</p>
        </section>
        <div className="c4-form">
          <button className="primary" disabled={busy} onClick={() => void handleCreate()}>
            Crear sala
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void tryJoin(joinCode);
            }}
            style={{ display: "contents" }}
          >
            <label>
              <b>Código de la sala</b>
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="AB2CD"
                maxLength={6}
                autoCapitalize="characters"
              />
            </label>
            <button className="primary" type="submit" disabled={busy || joinCode.length < 4}>
              Unirme
            </button>
          </form>
          {error && <p className="c4-error">{error}</p>}
        </div>
      </main>
    );
  }

  if (screen === "waiting" && room) {
    return <WaitingRoom room={room} role={role} onStart={(row) => { setRoom(row); setScreen("play"); }} onExit={() => setScreen("menu")} />;
  }

  if (screen === "play" && room) {
    return <PlayOnline room={room} role={role} onUpdate={setRoom} onExit={() => setScreen("menu")} />;
  }

  return null;
}

const storedName = (): string | null => {
  try {
    return localStorage.getItem("c4-name");
  } catch {
    return null;
  }
};

const promptName = (): string | null => {
  const name = window.prompt("¿Cómo te llamás?")?.trim() || "";
  if (!name) return null;
  try {
    localStorage.setItem("c4-name", name);
  } catch {
    /* sin almacenamiento */
  }
  return name;
};

function WaitingRoom({
  room,
  onStart,
  onExit,
}: {
  room: RoomRow;
  role?: Role;
  onStart: (row: RoomRow) => void;
  onExit: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stop = subscribeRoom(room.code, (row) => {
      if (row.payload.names[1]) onStart(row);
    });
    // Respaldo por si la suscripción tarda:
    const poll = setInterval(async () => {
      const row = await fetchRoom(room.code);
      if (row?.payload.names[1]) {
        clearInterval(poll);
        stop();
        onStart(row);
      }
    }, 2500);
    return () => {
      clearInterval(poll);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  const share = async () => {
    const link = roomLink(room.code);
    if (navigator.share) {
      await navigator.share({ title: "Conecta 4", text: `Unite a mi partida: ${room.code}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="conecta4 setup">
      <header className="c4-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Sala creada</h1>
        <span />
      </header>
      <section className="c4-hero">
        <p className="eyebrow">COMPARTÍ ESTE CÓDIGO</p>
        <div className="room-code">{room.code}</div>
        <p>{room.payload.names[0]} espera a su rival…</p>
        <button className="primary" onClick={() => void share()}>
          {copied ? <><Check /> ¡Enlace copiado!</> : <><Copy /> Compartir invitación</>}
        </button>
      </section>
    </main>
  );
}

function PlayOnline({
  room,
  role,
  onUpdate,
  onExit,
}: {
  room: RoomRow;
  role: Role;
  onUpdate: (row: RoomRow) => void;
  onExit: () => void;
}) {
  const local = useRef<RoomRow>(room);
  local.current = room;

  const myDisc: 1 | 2 = role === "host" ? 1 : 2;
  const names: [string, string] = [
    room.payload.names[0] ?? "Jugador 1",
    room.payload.names[1] ?? "Esperando…",
  ];
  const state = room.payload.state;
  const finished = state.phase === "finished";
  const myTurn = !finished && state.current === myDisc;

  useEffect(() => {
    const stop = subscribeRoom(room.code, (incoming) => {
      if (incoming.rev > local.current.rev) {
        local.current = incoming;
        onUpdate(incoming);
      }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  const play = async (col: number) => {
    if (!myTurn || state.phase !== "playing") return;
    const next = dropDisc(state, col);
    if (next === state) return;
    // Optimista: aplico localmente y luego guardo en Supabase.
    const optimistic: RoomRow = {
      ...room,
      payload: { ...room.payload, state: next },
      rev: room.rev + 1,
    };
    local.current = optimistic;
    onUpdate(optimistic);
    await saveRoomState(local.current, next);
  };

  const rematch = async () => {
    const reset: GameState = startGame();
    const optimistic: RoomRow = {
      ...room,
      payload: { ...room.payload, state: reset },
      rev: room.rev + 1,
    };
    local.current = optimistic;
    onUpdate(optimistic);
    await saveRoomState(local.current, reset);
  };

  const winnerName = state.winner === null ? null : names[state.winner - 1];
  const iWon = state.winner !== null && state.winner === myDisc;

  return (
    <main className="conecta4 play">
      <header className="c4-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Sala {room.code}</h1>
        <span />
      </header>

      <div className="scoreboard">
        {names.map((name, i) => {
          const disc = (i + 1) as 1 | 2;
          return (
            <div
              key={i}
              className={`score ${!finished && state.current === disc ? "turn" : ""}`}
            >
              <b><span className={`chip chip-${i + 1}`} /> {name}</b>
              <small>
                {!finished && state.current === disc
                  ? disc === myDisc
                    ? "Tu turno"
                    : "Pensando…"
                  : "\u00A0"}
              </small>
            </div>
          );
        })}
      </div>

      {!finished && (
        <div className={`turn-banner phase-${state.current}`}>
          {myTurn
            ? "¡Es tu turno! Tocá una columna."
            : `Turno de ${names[state.current - 1]}…`}
        </div>
      )}

      <Board state={state} onDrop={(col) => void play(col)} />

      {finished && (
        <div className="winner-banner">
          <CircleDot size={48} />
          {winnerName ? (
            <>
              <p className="eyebrow">{iWon ? "¡GANASTE!" : "GANA TU RIVAL…"}</p>
              <h2>{winnerName}</h2>
            </>
          ) : (
            <>
              <p className="eyebrow">TABLERO LLENO</p>
              <h2>¡Empate!</h2>
            </>
          )}
          <button className="primary" onClick={() => void rematch()}>
            Revancha
          </button>
        </div>
      )}
    </main>
  );
}



