import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Check, Ship, RotateCw } from "lucide-react";
import {
  shoot,
  startGame,
  win,
  type GameState,
} from "./engine";
import {
  createNavalRoom,
  fetchNavalRoom,
  joinNavalRoom,
  navalLink,
  parseNavalLink,
  recallNavalRole,
  subscribeNavalRoom,
  updateNavalRoom,
  type NavalRole,
  type NavalRow,
} from "./navalRemote";
import { isSupabaseConfigured } from "../../lib/supabase";
import "./naval.css";

type Screen = "menu" | "waiting" | "play";

export default function NavalApp({ onExit }: { onExit: () => void }) {
  if (!isSupabaseConfigured) return <NotConfigured onExit={onExit} />;
  const linked = parseNavalLink();
  return <NavalInner onExit={onExit} initialCode={linked} />;
}

function NotConfigured({ onExit }: { onExit: () => void }) {
  return (
    <main className="naval setup">
      <header className="nv-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Batalla Naval</h1>
        <span />
      </header>
      <section className="nv-hero">
        <Ship size={52} />
        <h2>Modo online sin configurar</h2>
        <p>Falta conectar Supabase para jugar en línea.</p>
      </section>
    </main>
  );
}

const storedName = (): string | null => {
  try { return localStorage.getItem("c4-name"); } catch { return null; }
};

function NavalInner({ onExit, initialCode }: { onExit: () => void; initialCode: string | null }) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [room, setRoom] = useState<NavalRow | null>(null);
  const [role, setRole] = useState<NavalRole>("host");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCreate = async () => {
    setBusy(true); setError(null);
    const name = storedName();
    if (!name) { alert("Primero poné tu nombre en otro juego o probá de nuevo."); setBusy(false); return; }
    const created = await createNavalRoom(name);
    if (!created) { setError("No pude crear la sala, probá de nuevo."); setBusy(false); return; }
    setRole("host");
    const row = await fetchNavalRoom(created.code);
    if (!row) { setError("La sala no respondió."); setBusy(false); return; }
    setRoom(row);
    setScreen("waiting");
    setBusy(false);
  };

  const doJoin = async () => {
    setBusy(true); setError(null);
    const result = await joinNavalRoom(joinCode.trim().toUpperCase());
    if (result === "missing") { setError("No encontré esa sala. Revisá el código."); setBusy(false); return; }
    setRole(recallNavalRole(result.code));
    setRoom(result);
    setScreen("play");
    setBusy(false);
  };

  if (screen === "menu") {
    return (
      <main className="naval setup">
        <header className="nv-head">
          <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
          <h1>Batalla Naval</h1>
          <span />
        </header>
        <section className="nv-hero">
          <Ship size={48} />
          <p className="eyebrow">CADA UNO EN SU CELULAR</p>
          <p>Colocá tus barcos en secreto y dispará a la flota rival. ¡Hundila toda para ganar!</p>
        </section>
        <div className="nv-form">
          <button className="primary" disabled={busy} onClick={() => void doCreate()}>Crear sala</button>
          <form onSubmit={(e) => { e.preventDefault(); void doJoin(); }} style={{ display: "contents" }}>
            <label>
              <b>Código de la sala</b>
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="AB2CD" maxLength={6} autoCapitalize="characters" />
            </label>
            <button className="primary" type="submit" disabled={busy || joinCode.length < 4}>Unirme</button>
          </form>
          {error && <p className="nv-error">{error}</p>}
        </div>
      </main>
    );
  }

  if (screen === "waiting" && room) {
    return <Waiting room={room} onExit={onExit} onStart={(row) => { setRoom(row); setScreen("play"); }} />;
  }

  if (screen === "play" && room) {
    return <PlayOnline room={room} role={role} onUpdate={setRoom} onExit={() => setScreen("menu")} />;
  }
  return null;
}

function Waiting({
  room,
  onExit,
  onStart,
}: {
  room: NavalRow;
  onExit: () => void;
  onStart: (row: NavalRow) => void;
}) {
  const [copied, setCopied] = useState(false);
  const startedAt = room.rev;

  useEffect(() => {
    const cancel = { done: false };
    const stop = subscribeNavalRoom(room.code, (row) => {
      if (!cancel.done && row.state.started && row.state.phase === "battle") onStart(row);
    });
    const poll = setInterval(async () => {
      const row = await fetchNavalRoom(room.code);
      if (!cancel.done && row?.state.started && row.state.phase === "battle" && row.rev > startedAt) {
        clearInterval(poll);
        stop();
        onStart(row);
      }
    }, 2000);
    return () => { cancel.done = true; clearInterval(poll); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  const share = async () => {
    const link = navalLink(room.code);
    if (navigator.share) {
      await navigator.share({ title: "Batalla Naval", text: `Unite a mi partida: ${room.code}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="naval setup">
      <header className="nv-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Sala creada</h1>
        <span />
      </header>
      <section className="nv-hero">
        <Ship size={44} />
        <p className="eyebrow">COMPARTÍ ESTE CÓDIGO</p>
        <div className="nv-code">{room.code}</div>
        <p>Enviale el código a tu rival. Cuando se una, arranca la partida…</p>
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
  room: NavalRow;
  role: NavalRole;
  onUpdate: (row: NavalRow) => void;
  onExit: () => void;
}) {
  const local = useRef(room);
  local.current = room;
  const state = room.state;
  const meIdx: 0 | 1 = role === "host" ? 0 : 1;
  const foeIdx = meIdx === 0 ? 1 : 0;

  useEffect(() => {
    const stop = subscribeNavalRoom(room.code, (incoming) => {
      if (incoming.rev > local.current.rev) {
        local.current = incoming;
        onUpdate(incoming);
      }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  const commit = (next: GameState) => {
    const code = local.current.code;
    void updateNavalRoom(code, local.current.rev, next).then((updated) => {
      if (updated) {
        local.current = updated;
        onUpdate(updated);
      }
    });
  };

  // Sólo actúa el jugador en turno.
  const myTurn = state.turn === meIdx && state.phase === "battle";
  const finished = state.phase === "finished";
  const iWon = state.winner === meIdx;

  const fire = (r: number, c: number) => {
    if (!myTurn || finished) return;
    const enemyBoard = state.boards[foeIdx];
    if (enemyBoard[r][c] <= 0) return; // ya disparado (agua o barco tocado)
    const { board, result } = shoot(enemyBoard, r, c);
    const newBoards: [number[][], number[][]] = state.boards.map((b, i) =>
      i === foeIdx ? board : b,
    ) as GameState["boards"];
    const attackerWon = win(board);
    let phase: GameState["phase"] = state.phase;
    let winner: 0 | 1 | null = null;
    let turn: 0 | 1 = state.turn;
    if (attackerWon) {
      phase = "finished";
      winner = meIdx;
    } else if (result === "miss") {
      turn = foeIdx; // solo pasa el turno si fallaste
    }
    commit({ ...state, boards: newBoards, phase, turn, winner });
  };

  const rematch = () => {
    commit(startGame());
  };

  return (
    <main className="naval play">
      <header className="nv-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Batalla Naval · {room.code}</h1>
        <button aria-label="Reiniciar" onClick={rematch}><RotateCw /></button>
      </header>

      {!finished && (
        <div className={`nv-turn ${myTurn ? "me" : ""}`}>
          {myTurn
            ? "¡Es tu turno! Elegí dónde disparar."
            : "Turno de tu rival… esperá el disparo."}
        </div>
      )}

      {/* Tu flota (muestra dónde te pegaron) */}
      <section className="nv-grid-block">
        <h3>Tu flota</h3>
        <Grid cells={state.boards[meIdx]} own />
      </section>

      {/* Tu grilla de ataque */}
      <section className="nv-grid-block">
        <h3>Disparos a la flota rival</h3>
        <Grid
          cells={state.boards[foeIdx]}
          attack
          disabled={!myTurn || finished}
          onFire={fire}
        />
        {finished && (
          <div className="nv-result">
            <Ship size={40} />
            <h2>{iWon ? "¡Ganaste!" : "Hundieron tu flota"}</h2>
            <button className="primary" onClick={rematch}>Revancha</button>
          </div>
        )}
      </section>
    </main>
  );
}

function Grid({
  cells,
  attack,
  own,
  disabled,
  onFire,
}: {
  cells: number[][];
  attack?: boolean;
  own?: boolean;
  disabled?: boolean;
  onFire?: (r: number, c: number) => void;
}) {
  // En "own" no se hace click; en "attack" se puede disparar si no está disabled.
  const block = own || disabled;
  return (
    <div className={`nv-grid ${attack ? "attack" : ""}`}>
      {cells.map((row, r) =>
        row.map((v, c) => {
          let cls = "";
          if (v > 0) cls = "ship-intact"; // barco intacto (solo visible en own)
          else if (v < 0 && v !== -1) cls = "ship-hit"; // barco tocado
          else if (v === -1) cls = "water-hit"; // agua disparada
          if (attack && v > 0) cls = ""; // en ataque no se ven barcos intactos del rival
          return (
            <button
              key={`${r}-${c}`}
              className={`nv-cell ${cls}`}
              disabled={block}
              onClick={attack && !own && !disabled ? () => onFire?.(r, c) : undefined}
              aria-label={`Fila ${r + 1} col ${c + 1}`}
            />
          );
        }),
      )}
    </div>
  );
}

// __END_NAVAL__