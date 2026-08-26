// Tablero visual de Conecta 4, compartido entre el modo local (hot-seat) y online.
import { COLS, type GameState } from "./engine";

export function Board({ state, onDrop }: { state: GameState; onDrop: (col: number) => void }) {
  const winning = new Set(
    (state.winningLine ?? []).map(([r, c]) => `${r}-${c}`),
  );
  return (
    <section className="board-wrap">
      <div className="drop-row">
        {Array.from({ length: COLS }, (_, col) => (
          <button
            key={col}
            aria-label={`Soltar en columna ${col + 1}`}
            disabled={state.phase !== "playing"}
            onClick={() => onDrop(col)}
          >
            ▼
          </button>
        ))}
      </div>
      <div className="board-grid">
        {state.board.map((row, r) =>
          row.map((cell, c) => (
            <span
              key={`${r}-${c}`}
              className={`cell ${cell ? `disc-${cell}` : ""} ${
                winning.has(`${r}-${c}`) ? "win" : ""
              }`}
            >
              {cell !== 0 && <span className="disc" />}
            </span>
          )),
        )}
      </div>
    </section>
  );
}
