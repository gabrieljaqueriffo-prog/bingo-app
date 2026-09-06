import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Check, Ship, RotateCw, RefreshCw, Undo2 } from "lucide-react";
import {
  SIZE,
  FLEET,
  shoot,
  startGame,
  win,
  canPlace,
  placeShip,
  randomBoard,
  hasNeighbor,
  fleetStatus,
  emptyBoard,
  type Board,
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

const promptName = (): string => {
  const name = window.prompt("¿Cómo te llamás?")?.trim() || "";
  if (name) {
    try { localStorage.setItem("c4-name", name); } catch { /* */ }
  }
  return name;
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
    const name = storedName() || promptName();
    if (!name) { setBusy(false); return; }
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
    const name = storedName() || promptName();
    if (!name) { setBusy(false); return; }
    const result = await joinNavalRoom(joinCode.trim().toUpperCase(), name);
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

  // --- Colocación propia (fase "place") ------------------------------------
  // Cada jugador arma su flota en su celular: nada de posiciones fijas.
  const [myBoard, setMyBoard] = useState<Board>(emptyBoard());
  const [myShips, setMyShips] = useState<{ r: number; c: number; size: number; h: boolean }[]>([]);
  const [horiz, setHoriz] = useState(true);
  const nextSize = FLEET[myShips.length];

  const placeAt = (r: number, c: number) => {
    if (nextSize === undefined) return;
    if (!canPlace(myBoard, r, c, nextSize, horiz)) return;
    if (hasNeighbor(myBoard, r, c, nextSize, horiz)) return; // regla clásica: agua entre barcos
    setMyBoard(placeShip(myBoard, r, c, nextSize, horiz));
    setMyShips((s) => [...s, { r, c, size: nextSize, h: horiz }]);
  };

  const undoShip = () => {
    if (!myShips.length) return;
    let b = emptyBoard();
    for (const p of myShips.slice(0, -1)) b = placeShip(b, p.r, p.c, p.size, p.h);
    setMyBoard(b);
    setMyShips((s) => s.slice(0, -1));
  };

  const randomFleet = () => {
    const b = randomBoard();
    setMyBoard(b);
    // derivamos las colocaciones (runs) para poder deshacer después
    const ships: { r: number; c: number; size: number; h: boolean }[] = [];
    const seen = new Set<string>();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = b[r][c];
        if (v <= 0 || seen.has(`${r},${c}`)) continue;
        const h = c + 1 < SIZE && b[r][c + 1] === v;
        ships.push({ r, c, size: v, h });
        for (let i = 0; i < v; i++) seen.add(h ? `${r},${c + i}` : `${r + i},${c}`);
      }
    }
    setMyShips(ships);
  };

  const confirmFleet = () => {
    if (myShips.length < FLEET.length) return;
    const boards = state.boards.map((b, i) => (i === meIdx ? myBoard : b)) as GameState["boards"];
    const placed = (state.placed?.map((p, i) => (i === meIdx ? true : p)) ??
      [meIdx === 0, meIdx === 1]) as [boolean, boolean];
    const bothReady = placed[0] && placed[1];
    commit({ ...state, boards, placed, phase: bothReady ? "battle" : "place", turn: 0 });
  };

  const rematch = () => {
    // La revancha conserva los nombres pero vuelve a la fase de colocación.
    commit({ ...startGame(), names: state.names, started: true });
  };

  // Esperando a que el rival coloque: mostramos aviso en vez de grillas.
  if (state.phase === "place" || !state.started) {
    const ready = myShips.length >= FLEET.length;
    const foePlaced = Boolean(state.placed?.[foeIdx]);
    return (
      <main className="naval play">
        <header className="nv-head">
          <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
          <h1>Batalla Naval · {room.code}</h1>
          <button aria-label="Reiniciar" onClick={rematch}><RotateCw /></button>
        </header>

        <div className="nv-turn">
          {state.started
            ? "🚢 Colocá tu flota: tocá una casilla para poner el barco"
            : "Esperando al rival… podés ir colocando tu flota"}
        </div>

        <section className="nv-grid-block">
          <h3>
            Barco de {nextSize ?? "—"} casilla · {myShips.length}/{FLEET.length} colocados
          </h3>
          <div className="nv-grid attack">
            {myBoard.map((row, r) =>
              row.map((v, c) => (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={`nv-cell ${v > 0 ? "ship-intact" : ""}`}
                  onClick={() => placeAt(r, c)}
                  aria-label={`Fila ${r + 1} col ${c + 1}`}
                />
              )),
            )}
          </div>
          <div className="nv-place-actions">
            <button className="nv-small" onClick={() => setHoriz((h) => !h)}>
              <RotateCw size={15} /> {horiz ? "Horizontal" : "Vertical"}
            </button>
            <button className="nv-small" onClick={undoShip} disabled={!myShips.length}>
              <Undo2 size={15} /> Deshacer
            </button>
            <button className="nv-small" onClick={randomFleet}>
              <RefreshCw size={15} /> Aleatorio
            </button>
          </div>
          <button className="primary" onClick={confirmFleet} disabled={!ready}>
            {foePlaced ? "¡Listo, a batallar! ⚓" : "¡Listo! (esperando al rival…)"}
          </button>
        </section>
      </main>
    );
  }

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
    commit({
      ...state,
      boards: newBoards,
      phase,
      turn,
      winner,
      lastShot: { by: meIdx, r, c, result },
    });
  };

  const myName = state.names?.[meIdx] || "Vos";
  const foeName = state.names?.[foeIdx] || "Tu rival";
  const myFleet = fleetStatus(state.boards[meIdx]);
  const foeFleet = fleetStatus(state.boards[foeIdx]);
  const ls = state.lastShot ?? null;
  const shotFeedback = !ls
    ? myTurn ? "¡Es tu turno! Elegí dónde disparar." : "Turno del rival… esperá el disparo."
    : ls.by === meIdx
      ? ls.result === "miss"
        ? "💧 Agua… ahora dispara el rival."
        : ls.result === "sunk"
          ? "🚢 ¡Hundido! Seguís disparando."
          : "💥 ¡Tocaste! Seguís disparando."
      : ls.result === "miss"
        ? "💧 El rival dio en agua. ¡Es tu turno!"
        : ls.result === "sunk"
          ? "😱 Te hundieron un barco… el rival sigue disparando."
          : "😬 Te tocaron un barco. El rival sigue disparando.";

  return (
    <main className="naval play">
      <header className="nv-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Batalla Naval · {room.code}</h1>
        <button aria-label="Reiniciar" onClick={rematch}><RotateCw /></button>
      </header>

      {!finished && (
        <div className={`nv-turn ${myTurn ? "me" : ""}`}>{shotFeedback}</div>
      )}

      {/* Marcador de flotas */}
      <div className="nv-fleets">
        <span>🚢 {myName}: {myFleet.total - myFleet.sunk}/{myFleet.total} a flote</span>
        <span>🎯 {foeName}: {foeFleet.sunk}/{foeFleet.total} hundidos</span>
      </div>

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