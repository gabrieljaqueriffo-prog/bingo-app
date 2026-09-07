// Playground de simulación del mundo co-op. Sin red: controlás a los DOS
// personajes con un teclado para diseñar y probar cada etapa una por una.
// Rojo: WASD + E (acción) · Azul: flechas + P (acción) · R reinicia
// I invencible · N/B etapa · Espacio pausa · C centrar · arrastrar mueve cámara.
import { useEffect, useRef, useState } from "react";
import {
  applyInput, applyGravity, attachCarried, aabbOverlap, collectCoins, collectHeart,
  collectPower, createInitialGameState, emote as setEmote, gateOpen, hitEnemy, latchGate, makeLevel,
  pushCrates, reachFlag, resetPlayer, resolveCollisions, startHook, stompEnemy, tickEmote, tickHook,
  cageExpired, putInCage, tickCage, tryCageRescue,
  tradeCoinsForLife, tryGrab, tryRescueBubble, tryThrow, updateBubble, updateEnemies,
  SCREEN_WIDTH, SCREEN_HEIGHT, storyStage, storyStageCount, storyStages,
  type BrosGameState, type BrosPlayer, type BrosTile, type Phase, type PlayerId,
} from "./engine";
import { drawBackground, drawTile, drawPlayer, drawEnemy } from "./sprites";
import "./stages"; // efecto lateral: registra las etapas del mundo en el motor

const stageCount = () => storyStageCount();

export default function BrosDevApp({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [invincible, setInvincible] = useState(false);
  const [paused, setPaused] = useState(false);
  const gameRef = useRef<BrosGameState>(makeLevel("story", 1, createInitialGameState("story").players));
  const keysRef = useRef<Set<string>>(new Set());
  const touchKeys = useRef<Set<string>>(new Set());
  const camRef = useRef<{ x: number; drag: boolean; lastX: number }>({ x: 0, drag: false, lastX: 0 });
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const invRef = useRef(invincible); invRef.current = invincible;

  const loadStage = (idx: number) => {
    const i = Math.max(0, Math.min(idx, stageCount() - 1));
    setStageIdx(i);
    gameRef.current = makeLevel("story", i + 1, createInitialGameState("story").players);
    camRef.current.x = 0;
  };
  useEffect(() => { loadStage(0); }, []);
const doJump = (id: PlayerId) => {
    const g = gameRef.current;
    if (g.phase !== "playing" || g.winner) return;
    const me = g.players.find((p) => p.id === id);
    if (!me || me.carriedBy || me.isBubble) return;
    if (me.onGround || me.coyote > 0 || me.hooking)
      gameRef.current = { ...g, players: g.players.map((p) => (p.id === id ? applyInput(p, "up") : p)) };
  };
  const doJumpCut = (id: PlayerId) => {
    const g = gameRef.current;
    if (g.phase !== "playing" || g.winner) return;
    gameRef.current = { ...g, players: g.players.map((p) => (p.id === id ? applyInput(p, "jumpcut") : p)) };
  };
  const doAction = (id: PlayerId) => {
    const g = gameRef.current;
    if (g.phase !== "playing" || g.winner) return;
    const me = g.players.find((p) => p.id === id);
    const foe = g.players.find((p) => p.id !== id);
    if (!me || !foe || me.isBubble || me.carriedBy) return;
    let nm = me, nf = foe;
    if (me.carrying === foe.id) { const th = tryThrow(me, foe); if (th) { nm = th.actor; nf = th.partner; } }
    else { const gr = tryGrab(me, foe); if (gr) { nm = gr.actor; nf = gr.partner; } else { const hk = me.hooking ? { ...me, hooking: null } : startHook(me, g.tiles); nm = hk ?? setEmote(me, "❓"); nf = foe; } }
    gameRef.current = { ...g, players: g.players.map((p) => (p.id === id ? nm : p.id === foe.id ? nf : p)) };
  };
  const doEmote = (id: PlayerId) => {
    const g = gameRef.current;
    if (g.phase !== "playing" || g.winner) return;
    gameRef.current = { ...g, players: g.players.map((p) => (p.id === id ? setEmote(p, "🙌") : p)) };
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp"].includes(k)) e.preventDefault();
      if (k === "w" || k === "W") doJump("red");
      if (k === "ArrowUp") doJump("blue");
      if (k === "e" || k === "E") doAction("red");
      if (k === "p" || k === "P") doAction("blue");
      if (k === "r" || k === "R") loadStage(stageIdx);
      if (k === "i" || k === "I") setInvincible((v) => !v);
      if (k === "n" || k === "N") loadStage(stageIdx + 1);
      if (k === "b" || k === "B") loadStage(stageIdx - 1);
      if (k === "c" || k === "C") camRef.current.x = 0;
      if (k === " ") setPaused((p) => !p);
      keysRef.current.add(k.length === 1 ? k.toLowerCase() : k);
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current.delete(k);
      if (e.key === "w" || e.key === "W") doJumpCut("red");
      if (e.key === "ArrowUp") doJumpCut("blue");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIdx]);
const step = (g: BrosGameState): BrosGameState => {
    if (g.phase !== "playing" || g.winner) return g;
    // Teclado + botones táctiles: se unen en un solo set para el input.
    const keys = new Set([...keysRef.current, ...touchKeys.current]);
    const dirFor = (id: PlayerId) => {
      if (id === "red") { if (keys.has("a")) return "left" as const; if (keys.has("d")) return "right" as const; }
      else { if (keys.has("ArrowLeft")) return "left" as const; if (keys.has("ArrowRight")) return "right" as const; }
      return "stop" as const;
    };
    let enemies = updateEnemies(g.enemies);
    const eTick = g.eTick + 1;
    const collectedCoins: string[] = [];
    const collectedPowers: string[] = [];
    const collectedHearts: string[] = [];
    let players = g.players.map((p) => {
      let np: BrosPlayer = { ...p, anim: p.anim + 1 / 8 };
      np = tickEmote(np);
      if (np.caged) {
        // Jaula DK: congelado hasta que la pareja cae encima (o auto-liberación).
        np = tickCage(np);
        const foe = g.players.find((q) => q.id !== p.id);
        if (foe) { const r = tryCageRescue(foe, np); if (r.rescued) np = r.caged; }
        np = cageExpired(np);
      }
             else if (np.isBubble) { const foe = g.players.find((q) => q.id !== p.id); np = updateBubble(np, foe); if (foe && aabbOverlap(np, foe)) np = tryRescueBubble(np, foe).a; }
      else if (np.carriedBy) { const cs = g.players.find((q) => q.id === np.carriedBy); np = cs ? attachCarried(np, cs) : np; np = { ...np, vx: 0, vy: 0, onGround: false, interactCd: Math.max(0, (np.interactCd ?? 0) - 1) }; }
      else { np = { ...np, interactCd: Math.max(0, (np.interactCd ?? 0) - 1) }; if (np.hooking) np = tickHook(np); else { np = applyInput(np, dirFor(p.id)); np = applyGravity(np); np = resolveCollisions(np, np.hooking ? [] : g.tiles, g.players); } }
      // Integrar la posición DESPUÉS de resolver colisiones (igual que BrosApp):
      // resolveCollisions decide aterrizajes/bloqueos con posición previa + v.
      np = { ...np, x: np.x + np.vx, y: np.y + np.vy };
      if (np.onGround && np.hooking) np = { ...np, hooking: null };
      // Tope derecho del mundo de la etapa.
      if (np.x > (g.worldW ?? SCREEN_WIDTH) - np.width) np = { ...np, x: (g.worldW ?? SCREEN_WIDTH) - np.width };
      if (np.y > SCREEN_HEIGHT + 200) { if (np.lives - 1 > 0) { const foe = players.find((q) => q.id !== np.id)!; np = { ...putInCage(np, foe), lives: np.lives - 1 }; } else np = { ...resetPlayer(np), lives: 0, isBubble: true, y: 130 }; }
      const prevFeet = p.y + p.height;
      const stomp = stompEnemy(np, enemies, prevFeet);
      if (stomp.bounced) { enemies = stomp.enemies; np = { ...np, vy: -8, coins: np.coins + stomp.coins }; }
      else if (!invRef.current && hitEnemy(np, enemies)) { if ((np.shields ?? 0) > 0) np = { ...resetPlayer(np), shields: np.shields - 1 }; else if (np.lives - 1 > 0) { const foe = g.players.find((q) => q.id !== p.id)!; np = { ...putInCage(np, foe), lives: np.lives - 1 }; } else np = { ...resetPlayer(np), lives: 0, isBubble: true, y: 130 }; }
      const c = collectCoins(np, g.tiles); if (c.collected.length) c.collected.forEach((t) => collectedCoins.push(`${t.x},${t.y}`));
      const wl = tradeCoinsForLife(c.player);
      const pw = collectPower(wl, g.tiles); if (pw.collected.length) pw.collected.forEach((t) => collectedPowers.push(`${t.x},${t.y}`));
      const hrt = collectHeart(pw.player, g.tiles); if (hrt.collected.length) hrt.collected.forEach((t) => collectedHearts.push(`${t.x},${t.y}`));
      return hrt.player;
    });
players = players.map((p) => { const carrier = players.find((q) => q.id === p.carriedBy); return carrier ? attachCarried(p, carrier) : p; });
    // Rescate: caer sobre la jaula de tu pareja la rompe (rebote + monedas).
    for (let i = 0; i < players.length; i++) {
      const foe = players.find((q) => q.id !== players[i].id);
      if (foe?.caged) { const r = tryCageRescue(players[i], foe); if (r.rescued) { players[i] = r.rescuer; players[players.indexOf(foe)] = r.caged; } }
    }
    let tiles: BrosTile[];
    {
      // Direcciones de input por jugador (para el empuje cooperativo de cajas):
    // se toman del teclado/botones, no de vx (que se anula al chocar).
    const dirNum = (id: PlayerId) => {
      const s = dirFor(id);
      return s === "left" ? -1 : s === "right" ? 1 : 0;
    };
    const dirs: Partial<Record<PlayerId, number>> = { red: dirNum("red"), blue: dirNum("blue") };
    const pushed = pushCrates(players, g.tiles, dirs);
    players = pushed.players;
    tiles = pushed.tiles;
    // Latch de rejas: si una reja se abrió (alguien pisó la placa), queda
    // trabada para siempre. Así nadie queda encerrado del otro lado.
    const opened = new Set<number>();
    for (const t of tiles) {
      if (t.type === "gate" && !t.latched && gateOpen(tiles, t.pair ?? 0, players)) {
        opened.add(t.pair ?? 0);
      }
    }
    if (opened.size > 0) {
      for (const pair of opened) tiles = latchGate(tiles, pair);
    }
    }
    const mark = (type: string, list: string[]) => { if (!list.length) return; const ks = new Set(list); tiles = tiles.map((t) => (t.type === type && ks.has(`${t.x},${t.y}`) ? { ...t, collected: true } : t)); };
    mark("coin", collectedCoins); mark("power", collectedPowers); mark("heart", collectedHearts);
    const me = players.find((p) => p.id === "red"); const foe = players.find((p) => p.id === "blue");
    let winner: PlayerId | null = g.winner, phase: Phase = g.phase;
    if (me && foe && reachFlag(me, tiles) && reachFlag(foe, tiles)) { phase = "finished"; winner = null; }
    return { ...g, tiles, players, winner, phase, enemies, eTick };
  };

  useEffect(() => { const tick = setInterval(() => { if (!pausedRef.current) gameRef.current = step(gameRef.current); }, 1000 / 30); return () => clearInterval(tick); }, [stageIdx, invincible]);

  useEffect(() => {
const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d")!; let raf = 0;
    const render = () => {
      const g = gameRef.current;
      ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      const a = g.players[0], b = g.players[1];
      const mid = (a.x + b.x) / 2;
      let camX = Math.max(0, Math.min(mid - SCREEN_WIDTH * 0.4, g.worldW - SCREEN_WIDTH));
      if (!camRef.current.drag) camRef.current.x = camX; camX = camRef.current.x;
      drawBackground(ctx, camX);
      ctx.save(); ctx.translate(-camX, 0);
      g.tiles.forEach((t) => {
        if (t.collected) return;
        const isOpen =
          t.type === "gate" ? gateOpen(g.tiles, t.pair ?? 0, g.players)
          : t.type === "lever" ? g.players.some((p) => p.x < t.x + t.w && p.x + p.width > t.x && p.y < t.y + t.h && p.y + p.height > t.y)
          : false;
        drawTile(ctx, t, g.eTick, isOpen);
      });
      const flag = g.tiles.find((t) => t.type === "flag");
      if (flag) { ctx.fillStyle = "#fff"; ctx.font = "11px monospace"; ctx.textAlign = "center"; ctx.fillText("META", flag.x + flag.w / 2, flag.y - 8); }
      g.enemies.forEach((e) => drawEnemy(ctx, e, g.eTick));
      g.players.forEach((p) => {
        drawPlayer(ctx, p, g.eTick);
        if (p.caged) {
          // Jaula: barras doradas + cartel de rescate.
          const wob = Math.sin(g.eTick * 0.15) * 2;
          ctx.strokeStyle = "rgba(255,210,80,.95)";
          ctx.lineWidth = 3;
          ctx.strokeRect(p.x - 6 + wob * 0.2, p.y - 10, p.width + 12, p.height + 16);
          for (let bx = p.x + p.width / 4; bx < p.x + p.width; bx += p.width / 4) {
            ctx.beginPath(); ctx.moveTo(bx, p.y - 10); ctx.lineTo(bx, p.y + p.height + 6); ctx.stroke();
          }
          ctx.fillStyle = "#ffd24f"; ctx.font = "10px monospace"; ctx.textAlign = "center";
          ctx.fillText("¡RESCATE!", p.x + p.width / 2, p.y - 16);
        }
        if (p.isBubble) { ctx.strokeStyle = "rgba(150,220,255,.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.height * 0.8, 0, Math.PI * 2); ctx.stroke(); }
        if (p.emote) { ctx.font = "14px monospace"; ctx.textAlign = "center"; ctx.fillText(p.emote, p.x + p.width / 2, p.y - 16); }
      });
      ctx.restore();
      ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(6, 6, 250, 92); ctx.fillStyle = "#ffd700"; ctx.font = "12px monospace"; ctx.textAlign = "left";
      ctx.fillText(`ETAPA ${stageIdx + 1}/${stageCount()}: ${storyStage(stageIdx)?.name ?? ""}`, 12, 22);
      ctx.fillStyle = "#fff";
      ctx.fillText(`Rojo  x:${Math.round(a.x)} y:${Math.round(a.y)} v:${a.lives}♥ ${a.coins}🪙`, 12, 38);
      ctx.fillText(`Azul  x:${Math.round(b.x)} y:${Math.round(b.y)} v:${b.lives}♥ ${b.coins}🪙`, 12, 54);
      const gates = g.tiles.filter((t) => t.type === "gate"); const open = gates.filter((gt) => gateOpen(g.tiles, gt.pair ?? 0, g.players)).length;
      ctx.fillText(`Rejas: ${open}/${gates.length} abiertas · placas:${g.tiles.filter((t) => t.type === "plate" || t.type === "lever").length}`, 12, 70);
      ctx.fillText(`inv:${invRef.current ? "SÍ" : "no"} · pausa:${pausedRef.current ? "SÍ" : "no"}`, 12, 86);
      if (g.phase === "finished") { ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(0, SCREEN_HEIGHT / 2 - 50, SCREEN_WIDTH, 100); ctx.fillStyle = "#ffd700"; ctx.font = "28px monospace"; ctx.textAlign = "center"; ctx.fillText("¡ETAPA SUPERADA! 🏆", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 6); ctx.fillStyle = "#fff"; ctx.font = "13px monospace"; ctx.fillText("N = siguiente · R = repetir", SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 24); }
      raf = requestAnimationFrame(render);
    };
    render(); return () => cancelAnimationFrame(raf);
  }, [stageIdx]);
  console.log("🎮 Super Bros v2.0609d cargado");
  const st = storyStage(stageIdx);
  return (
    <div className="bros-game">
      <header className="bros-topbar">
        <span className="bros-code">🧪 PLAYGROUND</span>
        <span className="bros-you">Etapa {stageIdx + 1}/{stageCount()}: {st?.name}</span>
        <span className="bros-version" style={{ fontSize: "10px", color: "#8fa3b8", margin: "0 8px" }}>v2.0609d</span>
        <div className="bros-topbar-actions">
          <button className="bros-btn small" onClick={() => loadStage(stageIdx - 1)}>◀</button>
          <select value={stageIdx} onChange={(e) => loadStage(Number(e.target.value))} className="bros-btn small">
            {storyStages().map((s, i) => <option key={s.id} value={i}>{i + 1}. {s.name}</option>)}
          </select>
          <button className="bros-btn small" onClick={() => loadStage(stageIdx + 1)}>▶</button>
          <button className="bros-btn small" onClick={() => setInvincible((v) => !v)} title="Invencible (I)">🛡️</button>
          <button className="bros-btn small" onClick={() => setPaused((p) => !p)} title="Pausa (espacio)">⏸️</button>
          <button className="bros-btn small" onClick={() => loadStage(stageIdx)} title="Reiniciar (R)">↻</button>
          <button className="bros-btn small" onClick={onExit}>Salir</button>
        </div>
      </header>
      <div className="bros-stage">
        <canvas ref={canvasRef} width={SCREEN_WIDTH} height={SCREEN_HEIGHT}
          onMouseDown={(e) => { camRef.current.drag = true; camRef.current.lastX = e.clientX; }}
          onMouseMove={(e) => { if (camRef.current.drag) { camRef.current.x = Math.max(0, camRef.current.x - (e.clientX - camRef.current.lastX)); camRef.current.lastX = e.clientX; } }}
          onMouseUp={() => { camRef.current.drag = false; }} onMouseLeave={() => { camRef.current.drag = false; }} />
        {/* Controles táctiles (rojo): D-pad + acción + salto, para probar en celu/tablet */}
        <div className="bros-controls-touch">
          <div className="bros-pad-zone">
            <div className="bros-pad-directions">
              <button type="button" className="bros-pad" aria-label="Rojo izquierda"
                onPointerDown={() => touchKeys.current.add("a")} onPointerUp={() => touchKeys.current.delete("a")}
                onPointerLeave={() => touchKeys.current.delete("a")} onPointerCancel={() => touchKeys.current.delete("a")}>◀</button>
              <button type="button" className="bros-pad" aria-label="Rojo derecha"
                onPointerDown={() => touchKeys.current.add("d")} onPointerUp={() => touchKeys.current.delete("d")}
                onPointerLeave={() => touchKeys.current.delete("d")} onPointerCancel={() => touchKeys.current.delete("d")}>▶</button>
            </div>
          </div>
          <div className="bros-pad-zone">
            <div className="bros-pad-buttons">
              <button type="button" className="bros-pad action" aria-label="Acción rojo"
                onPointerDown={() => doAction("red")}><span className="bros-pad-label">🔴 E</span></button>
              <button type="button" className="bros-pad jump" aria-label="Salto rojo"
                onPointerDown={() => doJump("red")} onPointerUp={() => doJumpCut("red")}
                onPointerCancel={() => doJumpCut("red")} onPointerLeave={() => doJumpCut("red")}>⬆️</button>
            </div>
          </div>
        </div>
        {/* Controles táctiles (azul), un poco más arriba para no tapar los del rojo */}
        <div className="bros-controls-touch bros-controls-blue">
          <div className="bros-pad-zone">
            <div className="bros-pad-directions">
              <button type="button" className="bros-pad" aria-label="Azul izquierda"
                onPointerDown={() => touchKeys.current.add("ArrowLeft")} onPointerUp={() => touchKeys.current.delete("ArrowLeft")}
                onPointerLeave={() => touchKeys.current.delete("ArrowLeft")} onPointerCancel={() => touchKeys.current.delete("ArrowLeft")}>◀</button>
              <button type="button" className="bros-pad" aria-label="Azul derecha"
                onPointerDown={() => touchKeys.current.add("ArrowRight")} onPointerUp={() => touchKeys.current.delete("ArrowRight")}
                onPointerLeave={() => touchKeys.current.delete("ArrowRight")} onPointerCancel={() => touchKeys.current.delete("ArrowRight")}>▶</button>
            </div>
          </div>
          <div className="bros-pad-zone">
            <div className="bros-pad-buttons">
              <button type="button" className="bros-pad action" aria-label="Acción azul"
                onPointerDown={() => doAction("blue")}><span className="bros-pad-label">🔵 P</span></button>
              <button type="button" className="bros-pad jump" aria-label="Salto azul"
                onPointerDown={() => doJump("blue")} onPointerUp={() => doJumpCut("blue")}
                onPointerCancel={() => doJumpCut("blue")} onPointerLeave={() => doJumpCut("blue")}>⬆️</button>
            </div>
          </div>
        </div>
        <div className="bros-devhelp"><b>Rojo:</b> WASD + E acción · <b>Azul:</b> flechas + P acción · <b>R</b> reiniciar · <b>I</b> invencible · <b>N/B</b> etapa · <b>Espacio</b> pausa · <b>C</b> centrar · <b>arrastrar</b> mover cámara</div>
        {st && <div className="bros-intro">💡 {st.intro}</div>}
      </div>
    </div>
  );
}