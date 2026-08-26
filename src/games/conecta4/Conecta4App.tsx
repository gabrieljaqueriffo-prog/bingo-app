import { useState } from "react";
import { ArrowLeft, CircleDot, RotateCw } from "lucide-react";
import { COLS, startGame, dropDisc, type GameState } from "./engine";
import { Board } from "./Board";
import "./conecta4.css";

type LocalState = { kind: "setup" } | { kind: "play"; state: GameState; names: [string, string] };

export default function Conecta4App({ onExit }: { onExit: () => void }) {
  const [local, setLocal] = useState<LocalState>({ kind: "setup" });
  if (local.kind === "setup") {
    return (
      <Setup
        onStart={(names) =>
          setLocal({ kind: "play", state: startGame(), names })
        }
        onExit={onExit}
      />
    );
  }
  const restart = () => setLocal({ kind: "play", state: startGame(), names: local.names });
  return <Play local={local} setLocal={setLocal} onExit={onExit} restart={restart} />;
}

function Setup({
  onStart,
  onExit,
}: {
  onStart: (names: [string, string]) => void;
  onExit: () => void;
}) {
  const [p1, setP1] = useState("Jugador 1");
  const [p2, setP2] = useState("Jugador 2");
  return (
    <main className="conecta4 setup">
      <header className="c4-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Conecta 4</h1>
        <span />
      </header>
      <section className="c4-hero">
        <CircleDot size={56} />
        <p className="eyebrow">DOS JUGADORES · UN DISPOSITIVO</p>
        <h2>Conectá cuatro fichas y ganás</h2>
        <p>
          Por turnos sueltan una ficha en la columna que elijan. Gana quien
          logre cuatro en línea: horizontal, vertical o diagonal.
        </p>
      </section>
      <form
        className="c4-form"
        onSubmit={(event) => {
          event.preventDefault();
          onStart([p1.trim() || "Jugador 1", p2.trim() || "Jugador 2"]);
        }}
      >
        <label>
          <b><span className="chip chip-1" /> Jugador 1</b>
          <input value={p1} onChange={(e) => setP1(e.target.value)} maxLength={16} />
        </label>
        <label>
          <b><span className="chip chip-2" /> Jugador 2</b>
          <input value={p2} onChange={(e) => setP2(e.target.value)} maxLength={16} />
        </label>
        <button type="submit" className="primary">Empezar a jugar</button>
      </form>
    </main>
  );
}

function Play({
  local,
  setLocal,
  onExit,
  restart,
}: {
  local: Extract<LocalState, { kind: "play" }>;
  setLocal: (next: LocalState) => void;
  onExit: () => void;
  restart: () => void;
}) {
  const { state, names } = local;
  const finished = state.phase === "finished";
  const winnerName =
    state.winner === null ? null : names[state.winner - 1];

  const handleDrop = (col: number) => {
    if (!finished) setLocal({ ...local, state: dropDisc(state, col) });
  };

  return (
    <main className="conecta4 play">
      <header className="c4-head">
        <button aria-label="Volver" onClick={onExit}><ArrowLeft /></button>
        <h1>Conecta 4</h1>
        <button aria-label="Reiniciar" onClick={restart}><RotateCw /></button>
      </header>

      <div className="scoreboard">
        {names.map((name, i) => (
          <div
            key={i}
            className={`score ${!finished && state.current === i + 1 ? "turn" : ""}`}
          >
            <b><span className={`chip chip-${i + 1}`} /> {name}</b>
            <small>{!finished && state.current === i + 1 ? "Tu turno" : "\u00A0"}</small>
          </div>
        ))}
      </div>

      {!finished && (
        <div className={`turn-banner phase-${state.current}`}>
          Turno de <b>{names[state.current - 1]}</b>: tocá una columna para soltar tu ficha.
        </div>
      )}

      <Board state={state} onDrop={handleDrop} />

      {finished && (
        <div className="winner-banner">
          <CircleDot size={48} />
          {winnerName ? (
            <>
              <p className="eyebrow">¡CUATRO EN LÍNEA!</p>
              <h2>{winnerName}</h2>
            </>
          ) : (
            <>
              <p className="eyebrow">TABLERO LLENO</p>
              <h2>¡Empate!</h2>
            </>
          )}
          <button className="primary" onClick={restart}>Revancha</button>
        </div>
      )}
    </main>
  );
}
