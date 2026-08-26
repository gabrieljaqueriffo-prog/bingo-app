// Stop (Categorías) online: cada jugador escribe en su celular.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Check, Type, Send, Trophy } from "lucide-react";
import {
  CATEGORIES,
  ROUNDS_PER_GAME,
  initialStopData,
  resolveIfReady,
  nextRound,
  type StopData,
} from "./engine";
import {
  createStopRoom,
  fetchStopRoom,
  joinStopRoom,
  parseStopLink,
  recallStopRole,
  stopLink,
  subscribeStopRoom,
  updateStopRoom,
  type StopRole,
  type StopRoomRow,
} from "./stopRemote";
import { isSupabaseConfigured } from "../../lib/supabase";
import "./stop.css";

type Screen = "menu" | "waiting" | "play";

export default function StopRemoteApp({ onExit }: { onExit: () => void }) {
  if (!isSupabaseConfigured) return <NotConfigured onExit={onExit} />;
  const linked = parseStopLink();
  return <StopInner onExit={onExit} initialCode={linked} />;
}

function NotConfigured({ onExit }: { onExit: () => void }) {
  return (
    <main className="stop setup">
      <header className="st-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Stop · Online</h1>
        <span />
      </header>
      <section className="st-hero">
        <Type size={56} />
        <h2>Modo online sin configurar</h2>
        <p>Falta conectar Supabase (igual que en Conecta 4 Online).</p>
      </section>
    </main>
  );
}

const storedName = (): string | null => {
  try { return localStorage.getItem("c4-name"); } catch { return null; }
};

const promptName = (): string | null => {
  const name = window.prompt("¿Cómo te llamás?")?.trim() || "";
  if (!name) return null;
  try { localStorage.setItem("c4-name", name); } catch { /* */ }
  return name;
};

function StopInner({ onExit, initialCode }: { onExit: () => void; initialCode: string | null }) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [room, setRoom] = useState<StopRoomRow | null>(null);
  const [role, setRole] = useState<StopRole>("host");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCreate = async () => {
    setBusy(true); setError(null);
    const name = storedName() ?? promptName();
    if (!name) { setBusy(false); return; }
    const created = await createStopRoom(name);
    if (!created) { setError("No pude crear la sala, probá de nuevo."); setBusy(false); return; }
    setRole("host");
    // Recién creada: la fila ya está disponible con rev 1.
    setRoom(await refresh(created.code));
    setScreen("waiting");
    setBusy(false);
  };

  const doJoin = async () => {
    setBusy(true); setError(null);
    const name = storedName() ?? promptName();
    if (!name) { setBusy(false); return; }
    const result = await joinStopRoom(joinCode.trim().toUpperCase(), name);
    if (result === "missing") { setError("No encontré esa sala. Revisá el código."); setBusy(false); return; }
    setRole(recallStopRole(result.code));
    setRoom(result);
    setScreen("play");
    setBusy(false);
  };

  if (screen === "menu") {
    return (
      <main className="stop setup">
        <header className="st-head">
          <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
          <h1>Stop · Online</h1>
          <span />
        </header>
        <section className="st-hero">
          <Type size={48} />
          <p className="eyebrow">CATEGORÍAS · CADA UNO EN SU CELULAR</p>
          <p>Misma letra, seis categorías. Quien repita palabra suma menos.</p>
        </section>
        <div className="st-form">
          <button className="primary" disabled={busy} onClick={() => void doCreate()}>Crear sala</button>
          <form onSubmit={(e) => { e.preventDefault(); void doJoin(); }} style={{ display: "contents" }}>
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
            <button className="primary" type="submit" disabled={busy || joinCode.length < 4}>Unirme</button>
          </form>
          {error && <p className="st-error">{error}</p>}
        </div>
      </main>
    );
  }

  if (screen === "waiting" && room) {
    return (
      <Waiting room={room} onExit={onExit} onStart={(row) => { setRoom(row); setScreen("play"); }} />
    );
  }

  if (screen === "play" && room) {
    return <Play room={room} role={role} onUpdate={setRoom} onExit={() => setScreen("menu")} />;
  }
  return null;
}

const refresh = async (code: string): Promise<StopRoomRow> => {
  // Sala recién creada: la leemos de la base para arrancar sincronizados.
  const row = await fetchStopRoom(code);
  if (row) return row;
  // Fallback local si la lectura tardó más que el insert.
  return {
    code,
    rev: 1,
    payload: { names: [storedName(), null], data: initialStopData() },
  };
};

function Waiting({
  room,
  onExit,
  onStart,
}: {
  room: StopRoomRow;
  onExit: () => void;
  onStart: (row: StopRoomRow) => void;
}) {
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stop = subscribeStopRoom(room.code, (row) => {
      if (row.payload.names[1]) onStart(row);
    });
    const poll = setInterval(async () => {
      const row = await fetchStopRoom(room.code);
      if (row?.payload.names[1]) {
        clearInterval(poll);
        stop();
        onStart(row);
      }
    }, 2500);
    return () => { clearInterval(poll); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  const share = async () => {
    const link = stopLink(room.code);
    if (navigator.share) {
      await navigator.share({ title: "Stop", text: `Unite a mi Stop con la letra ${room.payload.data.letter}: ${room.code}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <main className="stop setup">
      <header className="st-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Sala creada</h1>
        <span />
      </header>
      <section className="st-hero">
        <p className="eyebrow">COMPARTÍ ESTE CÓDIGO</p>
        <div className="st-code">{room.code}</div>
        <p>{room.payload.names[0]} espera a su rival…</p>
        <button className="primary" onClick={() => void share()}>
          {copied ? <><Check /> ¡Enlace copiado!</> : <><Copy /> Compartir invitación</>}
        </button>
      </section>
    </main>
  );
}

function Play({
  room,
  role,
  onUpdate,
  onExit,
}: {
  room: StopRoomRow;
  role: StopRole;
  onUpdate: (row: StopRoomRow) => void;
  onExit: () => void;
}) {
  const local = useRef(room);
  local.current = room;

  const myIndex = role === "host" ? 0 : 1;
  const names: [string, string] = [room.payload.names[0] ?? "Jugador 1", room.payload.names[1] ?? "Jugador 2"];
  const data = room.payload.data;
  const mine = data.entries[myIndex];
  const other = data.entries[myIndex === 0 ? 1 : 0];

  useEffect(() => {
    const stop = subscribeStopRoom(room.code, (incoming) => {
      if (incoming.rev > local.current.rev) {
        local.current = incoming;
        onUpdate(incoming);
      }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  // Guarda respuestas propias. El resolveIfReady lo dispara cada cliente:
  // el cálculo es determinista, así que ambos llegan al mismo resultado.
  const saveMine = async (words: string[], submitNow = false) => {
    const code = local.current.code;
    const updated = await updateStopRoom(code, local.current.rev, (p) => {
      if (p.data.phase !== "writing") return p;
      const entries: StopData["entries"] = [...p.data.entries];
      entries[myIndex] = words;
      let nextData: StopData = { ...p.data, entries };
      return { ...p, data: submitNow ? resolveIfReady(nextData) : nextData };
    });
    if (updated) {
      const fresh: StopRoomRow = { code, rev: updated.rev, payload: updated.payload };
      local.current = fresh;
      onUpdate(fresh);
    }
  };

  // Entrega automática al vencer el tiempo.
  const handleTimeUp = () => {
    if (!mine || data.phase !== "writing") void saveMine(mine ?? CATEGORIES.map(() => ""), true);
  };

  const handleNextRound = async () => {
    const updated = await updateStopRoom(local.current.code, local.current.rev, (p) => ({
      ...p,
      data: p.data.round >= ROUNDS_PER_GAME
        ? { ...p.data, phase: "final" }
        : nextRound(p.data),
    }));
    if (updated) {
      const fresh: StopRoomRow = { code: local.current.code, rev: updated.rev, payload: updated.payload };
      local.current = fresh;
      onUpdate(fresh);
    }
  };

  return (
    <main className="stop play">
      <header className="st-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Stop · Sala {room.code}</h1>
        <span />
      </header>

      <div className="st-score">
        {[0, 1].map((i) => (
          <div key={i} className={`score ${myIndex === i ? "me" : ""}`}>
            <b>{names[i]}</b>
            <span className={`pts pts-${i}`}>{data.scores[i]}</span>
          </div>
        ))}
      </div>

      {data.phase === "writing" && (
        <WritingPhase
          letter={data.letter}
          round={data.round}
          deadlineIso={data.deadlineIso}
          values={mine ?? ["", "", "", "", "", ""]}
          submitted={Boolean(mine)}
          waitingOther={Boolean(mine) && !other}
          onChange={(w) => void saveMine(w)}
          onSubmit={() => void saveMine(mine ?? CATEGORIES.map(() => ""), true)}
          onTimeUp={handleTimeUp}
        />
      )}

      {data.phase === "review" && other && mine && (
        <ReviewPhase
          data={data}
          myIndex={myIndex}
          names={names}
          onNext={() => void handleNextRound()}
        />
      )}

      {data.phase === "final" && other && mine && (
        <FinalPhase data={data} myIndex={myIndex} names={names} onAgain={() => void handleNextRound()} />
      )}
    </main>
  );
}

function WritingPhase({
  letter,
  round,
  deadlineIso,
  values,
  submitted,
  waitingOther,
  onChange,
  onSubmit,
  onTimeUp,
}: {
  letter: string;
  round: number;
  deadlineIso: string;
  values: string[];
  submitted: boolean;
  waitingOther: boolean;
  onChange: (words: string[]) => void;
  onSubmit: () => void;
  onTimeUp: () => void;
}) {
  const remaining = useCountdown(deadlineIso, onTimeUp);

  if (submitted) {
    return (
      <section className="st-waiting">
        <p className="eyebrow">¡ENTREGADO!</p>
        <p>{waitingOther ? "Esperando que termine tu rival…" : "Listo"}</p>
      </section>
    );
  }

  return (
    <section className="st-writing">
      <div className="st-letterbar">
        <span className="big-letter">{letter}</span>
        <span className="meta">
          Ronda {round}/{ROUNDS_PER_GAME}
          {remaining !== null && ` · ${remaining}s`}
        </span>
      </div>
      {CATEGORIES.map((cat, i) => {
        const value = values[i] ?? "";
        const bad = value.trim() !== "" && !value.trim().toUpperCase().startsWith(letter);
        return (
          <label key={cat} className={bad ? "warn" : ""}>
            <b>{cat}</b>
            <input
              value={value}
              placeholder={`${letter}…`}
              onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
              autoComplete="off"
              maxLength={30}
            />
          </label>
        );
      })}
      <button className="primary" onClick={onSubmit}>
        <Send /> ¡Stop!
      </button>
    </section>
  );
}

// Cuenta regresiva basada en el deadline de la sala. Devuelve null cuando
// no hay tiempo restante relevante; dispara onTimeUp al llegar a cero.
function useCountdown(deadlineIso: string, onTimeUp: () => void): number | null {
  const [left, setLeft] = useState(() => secsLeft(deadlineIso));
  const fired = useRef(false);
  const callback = useRef(onTimeUp);
  callback.current = onTimeUp;

  useEffect(() => {
    fired.current = false;
    setLeft(secsLeft(deadlineIso));
    const id = setInterval(() => {
      const s = secsLeft(deadlineIso);
      setLeft(s);
      if (s <= 0 && !fired.current) {
        fired.current = true;
        clearInterval(id);
        callback.current();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  return left > 0 ? left : 0;
}

const secsLeft = (iso: string): number =>
  Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

function ReviewPhase({
  data,
  myIndex,
  names,
  onNext,
}: {
  data: StopData;
  myIndex: number;
  names: [string, string];
  onNext: () => void;
}) {
  const mine = data.entries[myIndex] ?? [];
  const theirs = data.entries[myIndex === 0 ? 1 : 0] ?? [];
  const last = data.history[data.history.length - 1];
  const iWonRound = last ? (last.s1 === last.s2 ? null : (last.s1 > last.s2) === (myIndex === 0)) : null;

  return (
    <section className="st-review">
      <p className="eyebrow">RONDA {data.round} · LETRA {data.letter}</p>
      {last && (
        <div className="round-result">
          {iWonRound === null
            ? "Ronda empatada 🤝"
            : iWonRound ? `¡Ganaste la ronda, ${names[myIndex]}! 🎉` : `${names[myIndex === 0 ? 1 : 0]} ganó la ronda`}
          <small>{last.s1} a {last.s2} en esta ronda</small>
        </div>
      )}
      <table className="review-table">
        <thead>
          <tr><th>Categoría</th><th>{names[myIndex]}</th><th>{names[myIndex === 0 ? 1 : 0]}</th></tr>
        </thead>
        <tbody>
          {CATEGORIES.map((cat, i) => {
            const dup = sameWord(mine[i], theirs[i]);
            return (
              <tr key={cat}>
                <td>{cat}</td>
                <td className={dup ? "dup" : ""}>{mine[i]?.trim() || "—"}</td>
                <td className={dup ? "dup" : ""}>{theirs[i]?.trim() || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="primary" onClick={onNext}>
        {data.round >= ROUNDS_PER_GAME ? "Ver resultado final" : "Siguiente letra"}
      </button>
    </section>
  );
}

const normalize = (s: string): string =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const sameWord = (a?: string, b?: string): boolean =>
  Boolean(a && b && normalize(a) === normalize(b) && normalize(a) !== "");

function FinalPhase({
  data,
  myIndex,
  names,
  onAgain,
}: {
  data: StopData;
  myIndex: number;
  names: [string, string];
  onAgain: () => void;
}) {
  const [sMe, sOther] = myIndex === 0 ? data.scores : [data.scores[1], data.scores[0]];
  const otherName = names[myIndex === 0 ? 1 : 0];
  const verdict = sMe > sOther
    ? { title: `¡GANASTE, ${names[myIndex]}!`, sub: "Un genio de las palabras 🏆" }
    : sMe < sOther
      ? { title: `Ganó ${otherName}`, sub: "¡La revancha se viene!" }
      : { title: "Empate total", sub: "Mismo ingenio, mismos puntos" };

  return (
    <section className="st-final">
      <Trophy size={48} />
      <h2>{verdict.title}</h2>
      <p>{verdict.sub}</p>
      <div className="final-scores">
        <span className={`pts pts-${myIndex}`}>{sMe}</span> vs{" "}
        <span className="pts">{sOther}</span>
      </div>
      <p className="meta">{ROUNDS_PER_GAME} rondas jugadas</p>
      <button className="primary" onClick={onAgain}>Jugar de nuevo</button>
    </section>
  );
}




