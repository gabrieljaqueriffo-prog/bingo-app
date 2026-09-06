// Mapa de mundo estilo Mario: un camino con nodos de etapa. Muestra cuáles
// están completadas, cuál es la actual y cuáles siguen bloqueadas. Tocando un
// nodo desbloqueado se elige el punto de partida del mundo (modo historia).
import { type StoryStage } from "./engine";

export interface WorldNodeState {
  index: number; // 0-based
  name: string;
  intro: string;
  completed: boolean;
  unlocked: boolean;
  selected: boolean;
}

interface Props {
  stages: StoryStage[];
  progress: number; // cuántas etapas desbloqueadas
  selected: number; // índice de la etapa elegida (0-based)
  onSelect: (index: number) => void;
}

export default function BrosWorldMap({ stages, progress, selected, onSelect }: Props) {
  const nodes: WorldNodeState[] = stages.map((s, i) => ({
    index: i,
    name: s.name,
    intro: s.intro,
    completed: i < progress - 1,
    unlocked: i < progress,
    selected: i === selected,
  }));

  return (
    <div className="world-map">
      <div className="world-map-path" style={{ width: Math.max(2, nodes.length) * 190 }}>
        {/* suelo del mapa */}
        <div className="world-map-ground" />
        {nodes.map((n) => {
          const row = n.index % 2 === 0; // zigzag: filas alternas
          const left = 20 + n.index * 190;
          const top = row ? 96 : 160;
          return (
            <div key={n.index}>
              {/* tramo de camino entre nodos */}
              <div
                className="world-map-road"
                style={{
                  left: n.index === 0 ? left : left - 95,
                  top: row ? 132 : 196,
                }}
              />
              <button
                type="button"
                className={`world-node ${n.completed ? "done" : ""} ${n.unlocked ? "open" : "locked"} ${n.selected ? "sel" : ""}`}
                style={{ left, top }}
                disabled={!n.unlocked}
                onClick={() => onSelect(n.index)}
                title={n.unlocked ? n.intro : "🔒 Completá la etapa anterior para desbloquear"}
              >
                <span className="world-node-orb">{n.completed ? "✓" : n.index === progress - 1 ? "★" : n.index + 1}</span>
                <span className="world-node-name">{n.name}</span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="world-map-note">
        Elegí la etapa por donde van a arrancar. Las <b>verdes ✓</b> ya se superaron,
        la <b>dorada ★</b> es la próxima. A medida que juegan se desbloquean las siguientes.
      </p>
    </div>
  );
}