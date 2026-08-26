import { useState } from "react";
import { ArrowLeft, Dice5, Eye, EyeOff, RotateCw, X } from "lucide-react";
import {
  DICE_PER_PLAYER,
  GameState,
  challenge,
  placeBid,
  reroll,
  startGame,
  type Bid,
  type Die,
  type Face,
} from "./engine";
import "./mentiroso.css";

type SetupState = { kind: "setup" };
type PlayState = { kind: "play"; state: GameState; meId: string };
type LocalState = SetupState | PlayState;

const faces: Face[] = [1, 2, 3, 4, 5, 6];

export const faceLabel = (face: Face) =>
  face === 1 ? "As (comodín)" : `${face}`;

export default function MentirosoApp({ onExit }: { onExit: () => void }) {
  const [local, setLocal] = useState<LocalState>({ kind: "setup" });
  if (local.kind === "setup") {
    return <Setup onStart={(names) => {
      const state = startGame(names);
      setLocal({ kind: "play", state, meId: state.players[0].id });
    }} onExit={onExit} />;
  }
  return <Play local={local} setLocal={setLocal} onExit={onExit} />;
}

function Setup({
  onStart,
  onExit,
}: {
  onStart: (names: [string, string]) => void;
  onExit: () => void;
}) {
  const [p1, setP1] = useState("Yo");
  const [p2, setP2] = useState("Pareja");
  return (
    <main className="mentiroso setup">
      <header className="mentiroso-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Mentiroso</h1>
        <span />
      </header>
      <section className="mentiroso-hero">
        <Dice5 size={56} />
        <p className="eyebrow">DOS JUGADORES · UN DISPOSITIVO</p>
        <h2>Apostá, mentí, o cantá "¡dudo!"</h2>
        <p>
          Cada turno tirás tus dados y apostás cuántos hay de un valor. El rival
          puede subirte la apuesta… o dudar. Los Ases cuentan como cualquier
          número.
        </p>
      </section>
      <form
        className="mentiroso-form"
        onSubmit={(event) => {
          event.preventDefault();
          onStart([p1.trim() || "Jugador 1", p2.trim() || "Jugador 2"]);
        }}
      >
        <label>
          <b>Jugador 1</b>
          <input value={p1} onChange={(event) => setP1(event.target.value)} maxLength={16} />
        </label>
        <label>
          <b>Jugador 2</b>
          <input value={p2} onChange={(event) => setP2(event.target.value)} maxLength={16} />
        </label>
        <button type="submit" className="primary">
          Tirar dados
        </button>
      </form>
    </main>
  );
}

function Play({
  local,
  setLocal,
  onExit,
}: {
  local: PlayState;
  setLocal: (next: LocalState) => void;
  onExit: () => void;
}) {
  const { state, meId } = local;
  const me = state.players.find((p) => p.id === meId)!;
  const rival = state.players.find((p) => p.id !== meId)!;
  const myTurn = state.currentPlayerId === meId;
  const rivalTurn = state.currentPlayerId === rival.id;
  const isFinished = state.phase === "finished";

  const advance = (next: GameState) => setLocal({ kind: "play", state: next, meId });

  const handleReroll = () => advance(reroll(state, state.currentPlayerId));
  const handleBid = (quantity: number, face: Face) => {
    if (!myTurn || state.phase !== "bidding") return;
    const bid: Bid = { playerId: meId, quantity, face };
    advance(placeBid(state, bid));
  };
  const handleChallenge = () => advance(challenge(state, state.currentPlayerId));
  const restart = () => setLocal({ kind: "setup" });

  return (
    <main className="mentiroso play">
      <header className="mentiroso-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Mentiroso</h1>
        <button aria-label="Reiniciar" onClick={restart}><RotateCw /></button>
      </header>
      <Scoreboard state={state} meId={meId} />
      <TurnBanner state={state} me={me} rival={rival} />
      <div className="dice-area">
        <PlayerBlock
          name={rival.name}
          dice={state.phase === "rolling" || state.phase === "bidding" ? null : rival.dice}
          isCurrentTurn={rivalTurn}
          isRevealed={state.phase === "rolling" && state.currentPlayerId === rival.id}
          lastChallenge={state.lastChallenge}
          playerId={rival.id}
        />
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
      <ActionPanel
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

export function Scoreboard({ state, meId }: { state: GameState; meId: string }) {
  return (
    <div className="scoreboard">
      {state.players.map((p) => (
        <div key={p.id} className={`score ${p.id === meId ? "me" : "rival"} ${p.id === state.currentPlayerId ? "turn" : ""}`}>
          <b>{p.name}</b>
          <div className="dice-pips">
            {Array.from({ length: DICE_PER_PLAYER }, (_, i) => (
              <span key={i} className={`pip ${i < p.dice.length ? "alive" : "dead"}`} />
            ))}
          </div>
          <small>{p.dice.length} dado{p.dice.length === 1 ? "" : "s"}</small>
        </div>
      ))}
    </div>
  );
}

export function TurnBanner({
  state,
  me,
  rival,
}: {
  state: GameState;
  me: { name: string };
  rival: { name: string };
}) {
  const current = state.players.find((p) => p.id === state.currentPlayerId)!;
  if (state.phase === "finished") return null;
  const message =
    state.phase === "rolling"
      ? `Le toca tirar a ${current.name}.`
      : `Le toca apostar a ${current.name}.`;
  return (
    <div className={`turn-banner ${state.phase}`}>
      <span>Turno de <b>{current.name}</b></span>
      <small>{message}</small>
    </div>
  );
}

export function PlayerBlock({
  name,
  dice,
  isCurrentTurn,
  isRevealed,
  lastChallenge,
  playerId,
}: {
  name: string;
  dice: Die[] | null;
  isCurrentTurn: boolean;
  isRevealed: boolean;
  lastChallenge: GameState["lastChallenge"];
  playerId: string;
}) {
  const revealDice = lastChallenge?.reveal[playerId];
  const visible = revealDice ?? (isRevealed && dice ? dice : null);
  return (
    <section className={`player-block ${isCurrentTurn ? "active" : ""}`}>
      <header>
        <b>{name}</b>
        {dice && <small>{dice.length} dados</small>}
        {!dice && <small><EyeOff size={14} /> ocultos</small>}
      </header>
      <div className="dice-row">
        {visible
          ? visible.map((die, index) => <Die3D key={index} face={die} highlight={isCurrentTurn} />)
          : Array.from({ length: 5 }, (_, index) => <Die3D key={index} face={null} highlight={isCurrentTurn} />)}
      </div>
    </section>
  );
}

function ActionPanel({
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
  if (state.phase === "rolling") {
    return (
      <div className="actions">
        <button className="primary" disabled={!myTurn} onClick={onReroll}>
          <RotateCw /> Tirar mis dados
        </button>
        {!myTurn && <small className="hint">Pasale el celu a {state.players.find((p) => p.id === state.currentPlayerId)?.name}.</small>}
      </div>
    );
  }
  if (!myTurn) {
    return (
      <div className="actions">
        <p className="hint">Esperando la apuesta de {state.players.find((p) => p.id === state.currentPlayerId)?.name}…</p>
      </div>
    );
  }
  return <BidForm current={state.currentBid} onBid={onBid} onChallenge={onChallenge} />;
}

export function BidForm({
  current,
  onBid,
  onChallenge,
}: {
  current: Bid | null;
  onBid: (q: number, face: Face) => void;
  onChallenge: () => void;
}) {
  const [quantity, setQuantity] = useState<number>(current ? current.quantity + 1 : 1);
  const [face, setFace] = useState<Face>((current?.face ?? 2) as Face);
  const minQty = current ? current.quantity : 1;
  const sameFaceHigherQty = current ? quantity > current.quantity : true;
  const sameQtyHigherFace = current ? quantity === current.quantity && face > current.face : true;
  const valid = quantity >= 1 && quantity <= 30 && (sameFaceHigherQty || sameQtyHigherFace);
  return (
    <div className="bid-form">
      <p className="hint">Apostá que hay al menos…</p>
      <div className="bid-controls">
        <label>
          <small>Cantidad</small>
          <input
            type="number"
            min={minQty}
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <div className="face-picker">
          <small>Cara</small>
          <div>
            {faces.map((f) => (
              <button
                key={f}
                type="button"
                className={face === f ? "active" : ""}
                onClick={() => setFace(f)}
                aria-label={`Cara ${f}`}
              >
                {f === 1 ? "As" : f}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="actions">
        <button className="primary" disabled={!valid} onClick={() => onBid(quantity, face)}>
          Apostar
        </button>
        {current && (
          <button className="doubt" onClick={onChallenge}>
            <X /> ¡Dudo!
          </button>
        )}
      </div>
    </div>
  );
}

export function WinnerBanner({ name, onAgain }: { name: string; onAgain: () => void }) {
  return (
    <div className="winner-banner">
      <Dice5 size={48} />
      <p className="eyebrow">¡TENEMOS GANADOR!</p>
      <h2>{name}</h2>
      <button className="primary" onClick={onAgain}>
        Jugar otra partida
      </button>
    </div>
  );
}

export function Log({ entries }: { entries: string[] }) {
  if (entries.length < 2) return null;
  return (
    <details className="log">
      <summary>
        <Eye size={14} /> Historial ({entries.length})
      </summary>
      <ol>
        {entries.slice().reverse().map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ol>
    </details>
  );
}

function Die3D({ face, highlight }: { face: Die | null; highlight: boolean }) {
  // Layout de pips: posiciones en grilla 3x3 (1=top-left, 2=top-right, 3=mid-left, etc.)
  const pipMap: Record<number, number[]> = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9],
  };
  const pips = face ? pipMap[face] ?? [] : [];
  return (
    <div className={`die ${highlight ? "active" : ""} ${face ? "" : "hidden"}`} aria-label={face ? `Dado ${face}` : "Dado oculto"}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`pip-slot ${pips.includes(i + 1) ? "on" : ""}`} />
      ))}
    </div>
  );
}
