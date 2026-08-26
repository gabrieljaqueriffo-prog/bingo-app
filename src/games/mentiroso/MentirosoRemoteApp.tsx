// Mentiroso online: cada jugador ve solo SUS dados; el rival se oculta hasta la duda.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Copy, Check, Dice5, RotateCw } from "lucide-react";
import {
  challenge,
  placeBid,
  reroll,
  startGame,
  type Face,
  type GameState,
} from "./engine";
import {
  BidForm,
  faceLabel,
  Log,
  PlayerBlock,
  Scoreboard,
  TurnBanner,
  WinnerBanner,
} from "./MentirosoApp";
import {
  createMentRoom,
  fetchMentRoom,
  joinMentRoom,
  mentLink,
  parseMentLink,
  recallMentRole,
  subscribeMentRoom,
  updateMentRoom,
  type MentRole,
  type MentRow,
} from "./mentRemote";
import { isSupabaseConfigured } from "../../lib/supabase";
import "./mentiroso.css";

type Screen = "menu" | "waiting" | "play";

export default function MentirosoRemoteApp({ onExit }: { onExit: () => void }) {
  if (!isSupabaseConfigured) return <NotConfigured onExit={onExit} />;
  const linked = parseMentLink();
  return <RemoteInner onExit={onExit} initialCode={linked} />;
}

function NotConfigured({ onExit }: { onExit: () => void }) {
  return (
    <main className="mentiroso setup">
      <header className="mentiroso-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Mentiroso · Online</h1>
        <span />
      </header>
      <section className="mentiroso-hero">
        <Dice5 size={56} />
        <h2>Modo online sin configurar</h2>
        <p>Falta conectar Supabase (igual que en Conecta 4 y Stop).</p>
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

function RemoteInner({ onExit, initialCode }: { onExit: () => void; initialCode: string | null }) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [room, setRoom] = useState<MentRow | null>(null);
  const [role, setRole] = useState<MentRole>("host");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doCreate = async () => {
    setBusy(true); setError(null);
    const name = storedName() ?? promptName();
    if (!name) { setBusy(false); return; }
    const created = await createMentRoom(name);
    if (!created) { setError("No pude crear la sala, probá de nuevo."); setBusy(false); return; }
    setRole("host");
    const row = await fetchMentRoom(created.code);
    if (!row) { setError("La sala no respondió. Intentá de nuevo."); setBusy(false); return; }
    setRoom(row);
    setScreen("waiting");
    setBusy(false);
  };

  const doJoin = async () => {
    setBusy(true); setError(null);
    const name = storedName() ?? promptName();
    if (!name) { setBusy(false); return; }
    const result = await joinMentRoom(joinCode.trim().toUpperCase(), name);
    if (result === "missing") { setError("No encontré esa sala. Revisá el código."); setBusy(false); return; }
    setRole(recallMentRole(result.code));
    setRoom(result);
    setScreen("play");
    setBusy(false);
  };

  if (screen === "menu") {
    return (
      <main className="mentiroso setup">
        <header className="mentiroso-head">
          <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
          <h1>Mentiroso · Online</h1>
          <span />
        </header>
        <section className="mentiroso-hero">
          <Dice5 size={48} />
          <p className="eyebrow">CADA UNO DESDE SU CELULAR · DADOS OCULTOS</p>
          <p>Cada quien tira y apuesta desde su teléfono. Los ases cuentan como cualquier número.</p>
        </section>
        <div className="mentiroso-form">
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
          {error && <p className="hint">{error}</p>}
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
    return <PlayOnline room={room} role={role} onUpdate={setRoom} onExit={() => setScreen("menu")} />;
  }
  return null;
}

function Waiting({
  room,
  onExit,
  onStart,
}: {
  room: MentRow;
  onExit: () => void;
  onStart: (row: MentRow) => void;
}) {
  const [copied, setCopied] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stop = subscribeMentRoom(room.code, (row) => {
      if (row.state.players[1].name !== "Jugador 2") onStart(row);
    });
    const poll = setInterval(async () => {
      const row = await fetchMentRoom(room.code);
      if (row && row.state.players[1].name !== "Jugador 2") {
        clearInterval(poll);
        stop();
        onStart(row);
      }
    }, 2500);
    return () => { clearInterval(poll); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  const share = async () => {
    const link = mentLink(room.code);
    if (navigator.share) {
      await navigator.share({ title: "Mentiroso", text: `Unite a mi partida de Mentiroso: ${room.code}`, url: link });
    } else {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hostName = room.state.players[0].name;
  return (
    <main className="mentiroso setup">
      <header className="mentiroso-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Sala creada</h1>
        <span />
      </header>
      <section className="mentiroso-hero">
        <Dice5 size={44} />
        <p className="eyebrow">COMPARTÍ ESTE CÓDIGO</p>
        <div className="room-code room-code-ment">{room.code}</div>
        <p>{hostName} espera a su rival…</p>
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
  room: MentRow;
  role: MentRole;
  onUpdate: (row: MentRow) => void;
  onExit: () => void;
}) {
  const local = useRef(room);
  local.current = room;
  const state = room.state;
  const meId = role === "host" ? "p1" : "p2";
  const me = state.players.find((p) => p.id === meId)!;
  const rival = state.players.find((p) => p.id !== meId)!;
  const myTurn = state.currentPlayerId === meId;
  const rivalTurn = state.currentPlayerId === rival.id;
  const isFinished = state.phase === "finished";

  useEffect(() => {
    const stop = subscribeMentRoom(room.code, (incoming) => {
      if (incoming.rev > local.current.rev) {
        local.current = incoming;
        onUpdate(incoming);
      }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code]);

  const commit = async (next: GameState) => {
    const code = local.current.code;
    const updated = await updateMentRoom(code, local.current.rev, next);
    if (updated) {
      local.current = updated;
      onUpdate(updated);
    }
  };

  const handleReroll = () => { if (myTurn) void commit(reroll(state, meId)); };
  const handleBid = (quantity: number, face: Face) => {
    if (!myTurn || state.phase !== "bidding") return;
    void commit(placeBid(state, { playerId: meId, quantity, face }));
  };
  const handleChallenge = () => { if (myTurn) void commit(challenge(state, meId)); };
  const restart = () => {
    const reset = startGame([me.name, rival.name]);
    void commit(reset);
  };

  return (
    <main className="mentiroso play">
      <header className="mentiroso-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Mentiroso · {room.code}</h1>
        <button aria-label="Reiniciar" onClick={restart}><RotateCw /></button>
      </header>
      <Scoreboard state={state} meId={meId} />
      <TurnBanner state={state} me={me} rival={rival} />

      <div className="dice-area">
        {/* Rival: nunca mostramos sus dados hasta la revelación de una duda */}
        <PlayerBlock
          name={rival.name}
          dice={null}
          isCurrentTurn={rivalTurn}
          isRevealed={false}
          lastChallenge={state.lastChallenge}
          playerId={rival.id}
        />
        {/* Yo: mis dados son siempre visibles para mí */}
        <PlayerBlock
          name={me.name}
          dice={me.dice}
          isCurrentTurn={myTurn}
          isRevealed
          lastChallenge={state.lastChallenge}
          playerId={me.id}
        />
      </div>

      {state.currentBid && (
        <div className="current-bid">
          <small>APUESTA ACTUAL</small>
          <b>Hay al menos {state.currentBid.quantity} dado{state.currentBid.quantity === 1 ? "" : "s"} de {faceLabel(state.currentBid.face as Face)}</b>
          <span>— {state.players.find((p) => p.id === state.currentBid!.playerId)?.name}</span>
        </div>
      )}

      <OnlineActions
        state={state}
        meId={meId}
        onReroll={handleReroll}
        onBid={handleBid}
        onChallenge={handleChallenge}
      />

      {isFinished && state.winnerId && (
        <WinnerBanner
          name={state.players.find((p) => p.id === state.winnerId)!.name}
          onAgain={restart}
        />
      )}
      <Log entries={state.log} />
    </main>
  );
}

function OnlineActions({
  state,
  meId,
  onReroll,
  onBid,
  onChallenge,
}: {
  state: GameState;
  meId: string;
  onReroll: () => void;
  onBid: (q: number, face: Face) => void;
  onChallenge: () => void;
}) {
  if (state.phase === "finished") return null;
  const myTurn = state.currentPlayerId === meId;
  const currentName = state.players.find((p) => p.id === state.currentPlayerId)?.name;
  if (state.phase === "rolling") {
    return (
      <div className="actions">
        <button className="primary" disabled={!myTurn} onClick={onReroll}>
          <RotateCw /> Tirar mis dados
        </button>
        {!myTurn && (
          <small className="hint">Esperando a que {currentName} tire sus dados…</small>
        )}
      </div>
    );
  }
  if (!myTurn) {
    return (
      <div className="actions">
        <p className="hint">Esperando la apuesta de {currentName}…</p>
      </div>
    );
  }
  return <BidForm current={state.currentBid} onBid={onBid} onChallenge={onChallenge} />;
}