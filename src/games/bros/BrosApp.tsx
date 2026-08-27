import { useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import {
  applyInput,
  createInitialGameState,
  type BrosGameState,
  type BrosPlayer,
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
} from "./engine";
import {
  brosLink,
  createBrosRoom,
  fetchBrosRoom,
  joinBrosRoom,
  parseBrosLink,
  processInputs,
  subscribeBrosRoom,
  updateBrosRoom,
  type BrosRoom,
} from "./remote";
import "./bros.css";
import { Copy, Share2 } from "lucide-react";

const jumpSound = new Howl({ src: ["/sounds/jump.mp3"], volume: 0.3 });
const coinSound = new Howl({ src: ["/sounds/coin.mp3"], volume: 0.4 });
const winSound = new Howl({ src: ["/sounds/win.mp3"], volume: 0.5 });

export default function BrosApp({ onExit }: { onExit: () => void }) {
  const urlCode = parseBrosLink();
  const [room, setRoom] = useState<BrosRoom | null>(null);
  const [game, setGame] = useState<BrosGameState>(createInitialGameState());
  const [selfId, setSelfId] = useState<"red" | "blue">("red");
  const [error, setError] = useState<string>("");
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

  useEffect(() => {
    if (urlCode) {
      void joinBrosRoom(urlCode).then((res) => {
        if (res === "missing") { setError("La sala no existe."); return; }
        revRef.current = res.rev;
        setRoom(res);
        setGame(res.state);
        setSelfId("blue");
      });
    }
  }, [urlCode]);

  const createRoom = async () => {
    const res = await createBrosRoom();
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

  // Suscripción a cambios remotos
  useEffect(() => {
    if (!room) return;
    const code = room.code;
    const stop = subscribeBrosRoom(code, (updated) => {
      if (updated.rev >= revRef.current) {
        revRef.current = updated.rev;
        setRoom(updated);
        setGame(updated.state);
      }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);

  // Física local: gravedad, colisiones, monedas y bandera (30fps).
  // El anfitrión comitea el estado a la sala; el invitado simula y recibe el estado remoto.
  useEffect(() => {
    if (!room) return;
    const tick = setInterval(() => {
      setGame((g) => {
        if (g.phase !== "playing" || g.winner) return g;
        const dir = keysRef.current.values().next().value ?? null;
        const players = g.players.map((p) => {
          if (p.id !== selfIdRef.current) return p;
          return dir ? applyInput(p, dir) : applyInput(p, "stop");
        });
        return processInputs({ ...g, players }, {});
      });
    }, 1000 / 30);
    const commit = setInterval(() => {
      if (selfIdRef.current !== "red") return;
      void commitGame(room.code, gameRef.current);
    }, 300);
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
      const grad = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
      grad.addColorStop(0, "#0d1b2a");
      grad.addColorStop(1, "#051424");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      g.tiles.forEach((t) => {
        if (t.collected) return;
        ctx.fillStyle =
          t.type === "ground" || t.type === "platform" ? "#8B4513"
          : t.type === "coin" ? "#ffd700"
          : t.type === "flag" ? "#22c55e"
          : "#fff";
        ctx.fillRect(t.x, t.y, t.w, t.h);
      });
      g.players.forEach(drawSprite);
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
        <h2>Super Bros Online</h2>
        <p>¡Desafía a un amigo en este clásico juego de plataformas!</p>
        <button onClick={createRoom} className="bros-btn primary">Crear sala</button>
        <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Código de sala"
            value={urlCode ?? ""}
            onChange={(e) => {
              const code = e.target.value.toUpperCase();
              if (/^[A-Z0-9]{2,8}$/.test(code)) window.location.hash = `#sala=${code}&juego=bros`;
            }}
          />
          <button onClick={async () => {
            if (!urlCode) return;
            await navigator.clipboard.writeText(brosLink(urlCode));
            alert("¡Link copiado!");
          }} disabled={!urlCode} title="Compartir"><Share2 size={20} /></button>
        </div>
        <button onClick={() => { window.location.hash = ""; onExit(); }} className="bros-btn secondary">Volver al menú</button>
        <kbd className="bros-controls">{selfId === "red" ? "🔴 Rojo: A / D / W" : "🔵 Azul: Flechas"}</kbd>
      </div>
    );
  }

  return (
    <div className="bros-game">
      <canvas ref={canvasRef} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      <div className="bros-overlay">
        <h3>Sala: <span className="bros-code">{room.code}</span> — {selfId === "red" ? "🔴 Rojo" : "🔵 Azul"}</h3>
        <div style={{ display: "flex", gap: ".5rem" }}>
          <button onClick={() => navigator.clipboard.writeText(room.code)} className="bros-btn secondary"><Copy size={16} /> Copiar</button>
          <button onClick={async () => { await navigator.clipboard.writeText(brosLink(room.code)); alert("¡Link copiado!"); }} className="bros-btn secondary">Compartir link</button>
        </div>
        <button onClick={() => { window.location.hash = ""; onExit(); }} className="bros-btn secondary" style={{ position: "absolute", top: "1rem", right: "1rem", zIndex: 10 }}>Salir</button>
        <kbd className="bros-controls">{selfId === "red" ? "🔴 Usa A / D / W" : "🔵 Usa las flechas"}</kbd>
      </div>
    </div>
  );
}

