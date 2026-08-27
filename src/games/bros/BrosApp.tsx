import { useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import {
  applyInput,
  applyGravity,
  collectCoins,
  COIN_GOAL,
  BOSS_HP,
  MAX_LEVELS,
  createInitialGameState,
  hitEnemy,
  makeLevel,
  platePressed,
  reachFlag,
  resetPlayer,
  resolveCollisions,
  stompEnemy,
  updateEnemies,
  type Enemy,
  type BrosGameState,
  type BrosMode,
  type BrosPlayer,
  type Phase,
  type PlayerId,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from "./engine";
import {
  brosLink,
  createBrosRoom,
  fetchBrosRoom,
  joinBrosRoom,
  parseBrosLink,
  subscribeBrosRoom,
  updateBrosRoom,
  type BrosRoom,
} from "./remote";
import "./bros.css";
import { ChevronLeft, ChevronRight, ChevronUp, Share2 } from "lucide-react";

const jumpSound = new Howl({ src: ["/sounds/jump.mp3"], volume: 0.3 });
const coinSound = new Howl({ src: ["/sounds/coin.mp3"], volume: 0.4 });
const winSound = new Howl({ src: ["/sounds/win.mp3"], volume: 0.5 });

export default function BrosApp({ onExit }: { onExit: () => void }) {
  const urlCode = parseBrosLink();
  const [room, setRoom] = useState<BrosRoom | null>(null);
  const [game, setGame] = useState<BrosGameState>(createInitialGameState());
  const [selfId, setSelfId] = useState<"red" | "blue">("red");
  const [error, setError] = useState<string>("");
  const [mode, setMode] = useState<BrosMode>("race");
  const [joinCode, setJoinCode] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const revRef = useRef<number>(1);
  const gameRef = useRef(game);
  gameRef.current = game;
  const roomRef = useRef(room);
  roomRef.current = room;
  const keysRef = useRef<Set<"left" | "right">>(new Set());
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;

  const doJoin = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(clean)) return;
    void joinBrosRoom(clean).then((res) => {
      if (res === "missing") { setError("La sala no existe."); return; }
      revRef.current = res.rev;
      setRoom(res);
      setGame(res.state);
      setSelfId("blue");
      window.location.hash = `#sala=${clean}&juego=bros`;
    });
  };

  useEffect(() => {
    if (urlCode) doJoin(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

  const createRoom = async () => {
    const res = await createBrosRoom(mode);
    if (!res) { setError("No se pudo crear la sala."); return; }
    const row = await fetchBrosRoom(res.code);
    if (!row) return;
    revRef.current = row.rev;
    setRoom(row);
    setGame(row.state);
    setSelfId("red");
  };

  const commitGame = async (code: string, state: BrosGameState) => {
    const updated = await updateBrosRoom(code, revRef.current, state);
    if (updated) {
      revRef.current = updated.rev;
      setRoom(updated);
    }
  };

  // Salto: acción discreta al presionar la tecla
  const doJump = () => {
    const g = gameRef.current;
    const r = roomRef.current;
    if (!r || g.phase !== "playing" || g.winner) return;
    const me = g.players.find((p) => p.id === selfIdRef.current);
    if (!me) return;
    if (!(me.onGround || (me.jumped && Math.abs(me.vy) < 5))) return;
    const next: BrosGameState = {
      ...g,
      players: g.players.map((p) => (p.id === selfIdRef.current ? applyInput(p, "up") : p)),
    };
    setGame(next);
    void commitGame(r.code, next);
    jumpSound.play();
  };

  // Teclado: mantener presionado para correr, un toque para saltar
  useEffect(() => {
    const dirs: Record<string, "left" | "right"> = {
      ArrowLeft: "left", a: "left", A: "left",
      ArrowRight: "right", d: "right", D: "right",
    };
    const jumpKeys = new Set(["ArrowUp", "w", "W"]);
    const down = (e: KeyboardEvent) => {
      // No robar teclas mientras se escribe en un campo de texto.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const dir = dirs[e.key];
      if (dir) { keysRef.current.add(dir); e.preventDefault(); }
      if (jumpKeys.has(e.key)) { doJump(); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      const dir = dirs[e.key];
      if (dir) keysRef.current.delete(dir);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suscripción a cambios remotos: toma el estado de la sala pero
  // conserva SIEMPRE tu propio jugador (tu simulación local manda sobre vos).
  useEffect(() => {
    if (!room) return;
    const code = room.code;
    const stop = subscribeBrosRoom(code, (updated) => {
      if (updated.rev < revRef.current) return;
      revRef.current = updated.rev;
      setRoom(updated);
      setGame((g) => {
        const mine = g.players.find((p) => p.id === selfIdRef.current);
        // Si cambió de etapa, respete tu jugador al punto de partida del nivel nuevo.
        const levelChanged = updated.state.level !== g.level;
        const keep = mine && !levelChanged ? mine : updated.state.players.find((p) => p.id === selfIdRef.current);
        return {
          ...updated.state,
          players: updated.state.players.map((p) =>
            p.id === selfIdRef.current && keep ? keep : p,
          ),
        };
      });
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);

  // Física local (30fps): cada cliente simula SOLO a su propio jugador
  // (movimiento, gravedad, colisiones, monedas y meta) y lo publica ~4 veces/seg.
  useEffect(() => {
    if (!room) return;
    const tick = setInterval(() => {
      setGame((g) => {
        if (g.phase !== "playing" || g.winner) return g;
        const dir = keysRef.current.values().next().value ?? null;
        let enemies = updateEnemies(g.enemies);
        const eTick = g.eTick + 1;
        const players = g.players.map((p) => {
          if (p.id !== selfIdRef.current) return p; // el rival llega por red
          let np = dir ? applyInput(p, dir) : applyInput(p, "stop");
          np = applyGravity(np);
          np = resolveCollisions(np, g.tiles);
          np = { ...np, x: np.x + np.vx };
          // Saltar encima de un enemigo: lo destruye (o golpea al jefe) y rebotá.
          const stomp = stompEnemy(np, enemies);
          enemies = stomp.enemies;
          if (stomp.bounced) {
            np = { ...np, vy: -10, onGround: false, jumped: false };
          } else if (hitEnemy(np, enemies)) {
            // Choque lateral/abajo: perdés una vida y volvés a la salida.
            np = { ...resetPlayer(np), lives: np.lives - 1 };
          }
          const { player } = collectCoins(np, g.tiles);
          return player;
        });
        const me = players.find((p) => p.id === selfIdRef.current);
        const foe = players.find((p) => p.id !== selfIdRef.current);
        let winner: PlayerId | null = g.winner;
        let phase: Phase = g.phase;
        if (me) {
          const coopClear = g.mode === "coop" && foe && reachFlag(me, g.tiles) && reachFlag(foe, g.tiles);
          const templeClear = g.mode === "temple" && reachFlag(me, g.tiles);
          if (coopClear || templeClear) {
            if (g.level < MAX_LEVELS) {
              // Etapa superada → avanzar de nivel: mapa nuevo, enemigos nuevos, salimos los dos.
              return makeLevel(g.mode, g.level + 1, players);
            }
            phase = "finished"; // último etapa: ganan juntos (winner null → ¡GANARON!)
          } else if (g.mode === "race" && reachFlag(me, g.tiles)) {
            winner = me.id; phase = "finished";
          } else if (g.mode === "coins" && me.coins >= COIN_GOAL) {
            winner = me.id; phase = "finished";
          } else if (g.mode === "lives" && foe) {
            if (me.lives <= 0) { winner = foe.id; phase = "finished"; }
            if (foe.lives <= 0) { winner = me.id; phase = "finished"; }
          }
        }
        return { ...g, players, winner, phase, enemies, eTick };
      });
    }, 1000 / 30);
    const commit = setInterval(() => {
      void commitGame(room.code, gameRef.current);
    }, 250);
    return () => { clearInterval(tick); clearInterval(commit); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);

  // Sonidos de progreso
  const totalCoins = game.players.reduce((s, p) => s + p.coins, 0);
  const prevCoins = useRef(totalCoins);
  useEffect(() => {
    if (totalCoins > prevCoins.current) coinSound.play();
    prevCoins.current = totalCoins;
  }, [totalCoins]);
  useEffect(() => {
    if (game.winner) winSound.play();
  }, [game.winner]);


  // Render loop con canvas (lee gameRef para dibujar a 60fps sin re-crear el efecto)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const drawSprite = (p: BrosPlayer) => {
      ctx.fillStyle = p.id === "red" ? "#e63946" : "#3a86ff";
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x, p.y, p.width, p.height);
    };
    const render = () => {
      const g = gameRef.current;
      ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      // Fondo según el "mundo": cada modo y etapa tiene su propio cielo.
      const sky =
        g.mode === "temple" ? ["#0a1a2f", "#041020"]
        : g.mode === "coop"
          ? g.level >= 3 ? ["#2a1a3a", "#12082a"]
            : g.level === 2 ? ["#0f2740", "#081423"]
            : ["#0d1b2a", "#051424"]
        : ["#0d1b2a", "#051424"];
      const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
      grad.addColorStop(0, sky[0]);
      grad.addColorStop(1, sky[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      g.tiles.forEach((t) => {
        if (t.collected) return;
        if (t.type === "gate") {
          if (platePressed(g.tiles, t.pair ?? 0, g.players)) return; // abierta: no se dibuja
          ctx.fillStyle = "#8fa3b8";
          ctx.fillRect(t.x, t.y, t.w, t.h);
          ctx.fillStyle = "#5c6e80";
          for (let y = t.y + 6; y < t.y + t.h; y += 16) ctx.fillRect(t.x, y, t.w, 3);
          return;
        }
        ctx.fillStyle =
          t.type === "ground" || t.type === "platform" ? "#8B4513"
          : t.type === "coin" ? "#ffd700"
          : t.type === "plate" ? "#f2c14e"
          : t.type === "flag" ? "#22c55e"
          : "#fff";
        ctx.fillRect(t.x, t.y, t.w, t.h);
      });
      // Cartel de la meta y contador de monedas propias
      const flag = g.tiles.find((t) => t.type === "flag");
      if (flag) {
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("META", flag.x + flag.w / 2, flag.y - 8);
      }
      const meNow = g.players.find((p) => p.id === selfIdRef.current);
      if (meNow) {
        ctx.fillStyle = "#ffd700";
        ctx.font = "14px monospace";
        ctx.textAlign = "left";
        ctx.fillText(g.mode === "coins" ? `● ${meNow.coins}/${COIN_GOAL}` : `● ${meNow.coins}`, 10, 22);
        if (g.mode === "lives") {
          ctx.fillStyle = "#e63946";
          ctx.textAlign = "right";
          ctx.fillText("♥".repeat(Math.max(0, meNow.lives)) || "—", SCREEN_WIDTH - 10, 22);
        }
      }
      // Indicador de etapa en los modos con progresión
      if (g.mode === "coop" || g.mode === "temple") {
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`ETAPA ${g.level}/${MAX_LEVELS}`, SCREEN_WIDTH / 2, 22);
      }
      g.players.forEach(drawSprite);
      // Enemigos: patrullan de un lado a otro; el jefe (etapa 3) es más grande.
      g.enemies.forEach((e: Enemy) => {
        const baseY = e.y;
        const bobY = baseY + Math.sin((g.eTick + (parseInt(e.id.replace(/[^0-9]/g, "") || "0", 10) % 5)) / 6) * 2;
        ctx.fillStyle = e.boss ? "#7b2fbe" : "#d6418f";
        ctx.fillRect(e.x, bobY, e.w, e.h);
        ctx.strokeStyle = "#1b0a24";
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x, bobY, e.w, e.h);
        // ojos
        ctx.fillStyle = "#fff";
        const eyeY = bobY + e.h * 0.3;
        ctx.fillRect(e.x + e.w * 0.22, eyeY, 5, 6);
        ctx.fillRect(e.x + e.w * 0.62, eyeY, 5, 6);
        ctx.fillStyle = "#000";
        ctx.fillRect(e.x + e.w * 0.22 + (e.dir > 0 ? 2 : 0), eyeY, 2, 3);
        ctx.fillRect(e.x + e.w * 0.62 + (e.dir > 0 ? 2 : 0), eyeY, 2, 3);
        if (e.boss) {
          // Barra de vida del jefe
          const hp = e.hp ?? BOSS_HP;
          ctx.fillStyle = "#1b0a24";
          ctx.fillRect(e.x - 3, bobY - 12, e.w + 6, 6);
          ctx.fillStyle = hp > BOSS_HP / 2 ? "#ffd700" : hp > 1 ? "#ff9f2e" : "#e63946";
          ctx.fillRect(e.x - 1, bobY - 11, Math.max(0, (e.w + 2) * (hp / BOSS_HP)), 4);
          ctx.fillStyle = "#ffd700";
          ctx.font = "10px monospace";
          ctx.textAlign = "center";
          ctx.fillText("🎯 JEFE", e.x + e.w / 2, bobY + e.h + 12);
        }
      });
      if (g.mode === "temple") {
        // Etiquetas de sellos, runa y trofeo
        ctx.font = "10px monospace";
        ctx.fillStyle = "#8fd0ff";
        ctx.textAlign = "center";
        const plateByPair = (pair: number) => g.tiles.find((t) => t.type === "plate" && t.pair === pair);
        const sello = plateByPair(1);
        const espejo = plateByPair(2);
        const runa = plateByPair(3);
        if (sello) ctx.fillText("EL SELLO DEL SOL", sello.x + sello.w / 2, sello.y - 6);
        if (espejo) ctx.fillText("EL ESPEJO DE LA LUNA", espejo.x + espejo.w / 2, espejo.y - 6);
        if (runa) ctx.fillText("EL CANTO DE LA RUNA", runa.x + runa.w / 2, runa.y - 6);
        ctx.fillStyle = "#ffd700";
        ctx.textAlign = "right";
        ctx.fillText("EL TROFEO DORADO", 792, 376);
        // Penumbra de la cueva (zona derecha)
        ctx.fillStyle = "rgba(2, 8, 18, 0.45)";
        ctx.fillRect(446, 0, SCREEN_WIDTH - 446, SCREEN_HEIGHT);
        // Rótulos de zona, encima de la penumbra
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#e8c46a";
        ctx.fillText("AFUERA · LA MONTAÑA", 215, 40);
        ctx.fillStyle = "#9ac9e0";
        ctx.fillText("LA CUEVA DE LOS ECOS", 620, 40);
        ctx.font = "10px monospace";
        ctx.fillStyle = "#a9c5db";
        ctx.fillText("adentro: seguí el canto de las runas", 620, 58);
      }
      if (g.winner) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        ctx.fillStyle = "#fff";
        ctx.font = "28px monospace";
        ctx.textAlign = "center";
        ctx.fillText(
          g.winner === selfIdRef.current ? "¡GANASTE!" : "PERDISTE",
          SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2,
        );
      } else if (g.phase === "finished") {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
        ctx.fillStyle = "#22c55e";
        ctx.font = "26px monospace";
        ctx.textAlign = "center";
        ctx.fillText("¡GANARON!", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 12);
        ctx.fillStyle = "#fff";
        ctx.font = "12px monospace";
        ctx.fillText("Cooperación completada 🤝", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 18);
      }
      animRef.current = requestAnimationFrame(render);
    };
    render();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [room?.code]);

  if (error) return (
    <div className="bros-lobby">
      <div className="bros-error">{error}</div>
      <button onClick={onExit} className="bros-btn secondary">Volver</button>
    </div>
  );

  if (!room) {
    return (
      <div className="bros-lobby">
        <h2>Super Bros</h2>
        <p>¡Aventura de plataformas en pareja, con etapas, enemigos y un jefe final!</p>
        <div className="bros-modes">
          {([
            ["race", "🏁 Carrera", "Llegá primero a la meta"],
            ["coins", "🪙 Monedas", "Primero en juntar 8 gana"],
            ["lives", "❤️ Vidas", "Con huecos: último en pie gana"],
            ["coop", "🤝 Cooperación", "3 etapas: placas, uno abre para el otro"],
            ["temple", "🏛️ El Templo", "Cueva con historia · 3 cámaras"],
          ] as [BrosMode, string, string][]).map(([id, name, desc]) => (
            <button
              key={id}
              type="button"
              className={`bros-mode ${mode === id ? "sel" : ""}`}
              onClick={() => setMode(id)}
            >
              <b>{name}</b>
              <small>{desc}</small>
            </button>
          ))}
        </div>
        <p className="bros-note">El modo lo elige quien crea la sala</p>
        <button onClick={createRoom} className="bros-btn primary">Crear sala</button>
        <div style={{ display: "flex", flexDirection: "column", gap: ".5rem", width: "100%", maxWidth: 280 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span className="bros-note">Código de la sala</span>
            <input
              type="text"
              value={joinCode}
              placeholder="AB2CD"
              maxLength={6}
              autoCapitalize="characters"
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
          </label>
          <div style={{ display: "flex", gap: ".5rem" }}>
            <button
              className="bros-btn secondary"
              disabled={joinCode.length < 4}
              onClick={() => doJoin(joinCode)}
            >
              Unirme
            </button>
            <button
              className="bros-btn secondary"
              disabled={joinCode.length < 4}
              title="Compartir código"
              onClick={async () => {
                await navigator.clipboard.writeText(brosLink(joinCode));
                alert("¡Link copiado!");
              }}
            >
              <Share2 size={16} /> Compartir
            </button>
          </div>
        </div>
        <button onClick={() => { window.location.hash = ""; onExit(); }} className="bros-btn secondary">Volver al menú</button>
        <p className="bros-note">Cada uno juega desde su celu, con botones en pantalla</p>
      </div>
    );
  }

  return (
    <div className="bros-game">
      <header className="bros-topbar">
        <span className="bros-code">{room.code}</span>
        <span className="bros-you">{selfId === "red" ? "🔴 Vos: Rojo" : "🔵 Vos: Azul"}</span>
        <div className="bros-topbar-actions">
          <button
            className="bros-btn small"
            onClick={async () => {
              await navigator.clipboard.writeText(brosLink(room.code));
              alert("¡Link de invitación copiado!");
            }}
            aria-label="Copiar invitación"
          >
            <Share2 size={15} />
          </button>
          <button className="bros-btn small" onClick={() => { window.location.hash = ""; onExit(); }}>Salir</button>
        </div>
      </header>
      <div className="bros-stage">
        <canvas ref={canvasRef} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
        <div className="bros-rotate-hint">📱 Girá el celu en horizontal para jugar mejor</div>
        <div className="bros-controls-touch">
          <div className="bros-group">
            <button
              type="button"
              className="bros-pad"
              aria-label="Ir a la izquierda"
              onPointerDown={() => keysRef.current.add("left")}
              onPointerUp={() => keysRef.current.delete("left")}
              onPointerLeave={() => keysRef.current.delete("left")}
              onPointerCancel={() => keysRef.current.delete("left")}
            >
              <ChevronLeft size={34} />
            </button>
            <button
              type="button"
              className="bros-pad"
              aria-label="Ir a la derecha"
              onPointerDown={() => keysRef.current.add("right")}
              onPointerUp={() => keysRef.current.delete("right")}
              onPointerLeave={() => keysRef.current.delete("right")}
              onPointerCancel={() => keysRef.current.delete("right")}
            >
              <ChevronRight size={34} />
            </button>
          </div>
          <button
            type="button"
            className="bros-pad jump"
            aria-label="Saltar"
            onPointerDown={doJump}
          >
            <ChevronUp size={38} />
          </button>
        </div>
      </div>
    </div>
  );
}

