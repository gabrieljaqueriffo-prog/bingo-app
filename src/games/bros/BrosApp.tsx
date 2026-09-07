import { useEffect, useRef, useState } from "react";
import { Howl } from "howler";
import {
  applyInput,
  applyGravity,
  collectCoins,
  collectPower,
  collectHeart,
  COIN_GOAL,
  COINS_PER_LIFE,
  tradeCoinsForLife,
  BOSS_HP,
  MAX_LEVELS,
  createInitialGameState,
  hitEnemy,
  makeLevel,
  cageExpired,
  putInCage,
  pushCrates,
  gateOpen,
  latchGate,
  reachFlag,
  resetPlayer,
  resolveCollisions,
  stompEnemy,
  tickCage,
  tryCageRescue,
  updateEnemies,
  aabbOverlap,
  attachCarried,
  tryGrab,
  tryThrow,
  startHook,
  tickHook,
    updateBubble,
  tryRescueBubble,
  tickEmote,
  leverHeld,
  emote as setEmote,
  ANIM_FPS,
  BUBBLE_TOP,
  GRAB_CD,
  type Enemy,
  type BrosGameState,
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
  setupPlayerBroadcast,
  updateBrosRoom,
  type BrosRoom,
} from "./remote";
import { SnapshotBuffer } from "./interpolate";
import type { PlayerSnapshot } from "./interpolate";
import { isSupabaseConfigured, supabaseKeyError } from "../../lib/supabase";
import { storyStage, storyStageCount, storyStages } from "./engine";
import "./stages"; // registra las etapas del mundo en el motor
import BrosWorldMap from "./WorldMap";
import { getWorldProgress, setWorldProgress } from "./progress";
import "./bros.css";
import { ChevronLeft, ChevronRight, ChevronUp, Share2 } from "lucide-react";

// Las rutas deben incluir el base de Vite ("/bingo-app/" en producción).
const asset = (p: string): string => `${import.meta.env.BASE_URL}sounds/${p}.mp3`;
const jumpSound = new Howl({ src: [asset("jump")], volume: 0.3 });
const coinSound = new Howl({ src: [asset("coin")], volume: 0.4 });
const winSound = new Howl({ src: [asset("win")], volume: 0.5 });

export default function BrosApp({ onExit }: { onExit: () => void }) {
  const urlCode = parseBrosLink();
  const [room, setRoom] = useState<BrosRoom | null>(null);
  const [game, setGame] = useState<BrosGameState>(createInitialGameState());
  const [selfId, setSelfId] = useState<"red" | "blue">("red");
  const [error, setError] = useState<string>("");
  const [selectedStage, setSelectedStage] = useState(0);
  const [progress, setProgress] = useState(() => getWorldProgress());
  const [joinCode, setJoinCode] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const revRef = useRef<number>(1);
  const gameRef = useRef(game);
  gameRef.current = game;
  const roomRef = useRef(room);
  roomRef.current = room;
  const keysRef = useRef<Set<"left" | "right">>(new Set());
  // Buffer de snapshots del rival para interpolar su posición (reduce saltos).
  const snapBufRef = useRef<SnapshotBuffer>(new SnapshotBuffer());
  // Banner de transición de etapa: guarda el nivel mostrado y hasta cuándo.
  const stageLevelRef = useRef<number>(0);
  const stageUntilRef = useRef<number>(0);
  const selfIdRef = useRef(selfId);
  selfIdRef.current = selfId;
  // Pulso de lanzamiento: cuando cargo y lanzo a la pareja, envío el impulso
  // por broadcast unos 800ms para que su dispositivo lo reciba aunque se
  // pierda algún paquete. lastThrowSeq evita aplicar el mismo lanzamiento dos veces.
  const throwPulseRef = useRef<{ seq: number; target: PlayerId; vx: number; vy: number; until: number } | null>(null);
  const throwSeqSend = useRef(0);
  const lastThrowSeq = useRef(0);

  const doJoin = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(clean)) return;
    if (!isSupabaseConfigured) {
      setError(supabaseKeyError ?? "Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en un archivo .env.");
      return;
    }
    void joinBrosRoom(clean)
      .then((res) => {
        if (res === "missing") { setError("La sala no existe."); return; }
        revRef.current = res.rev;
        setRoom(res);
        setGame(res.state);
        setSelfId("blue");
        window.location.hash = `#sala=${clean}&juego=bros`;
      })
      .catch(() => setError("No se pudo conectar con la sala. Revisa la configuración de Supabase."));
  };

  useEffect(() => {
    if (urlCode) doJoin(urlCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCode]);

  const createRoom = async () => {
    if (!isSupabaseConfigured) {
      setError(supabaseKeyError ?? "Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en un archivo .env.");
      return;
    }
    try {
      const res = await createBrosRoom("story", selectedStage + 1);
      if (res.code === null) {
        setError(`No se pudo crear la sala: ${res.error}. Verificá que ejecutaste supabase-rooms.sql en el SQL Editor.`);
        return;
      }
      const row = await fetchBrosRoom(res.code);
      if (!row) { setError("La sala se creó, pero no se pudo leer. Revisa las políticas de Supabase."); return; }
      revRef.current = row.rev;
      setRoom(row);
      setGame(row.state);
      setSelfId("red");
    } catch {
      setError("No se pudo conectar con Supabase. Revisa tu archivo .env y la configuración del proyecto.");
    }
  };

  const commitGame = async (code: string, state: BrosGameState) => {
    const updated = await updateBrosRoom(code, revRef.current, state, selfIdRef.current);
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
    if (me.carriedBy) return; // te están cargando: no podés saltar
    if (!(me.onGround || me.coyote > 0 || me.hooking)) return;
    const next: BrosGameState = {
      ...g,
      players: g.players.map((p) => (p.id === selfIdRef.current ? applyInput(p, "up") : p)),
    };
    setGame(next);
    void commitGame(r.code, next);
    jumpSound.play();
  };

  // Soltar el botón de salto: corta el impulso para saltar a altura variable.
  const doJumpCut = () => {
    const g = gameRef.current;
    const r = roomRef.current;
    if (!r || g.phase !== "playing" || g.winner) return;
    const next: BrosGameState = {
      ...g,
      players: g.players.map((p) =>
        p.id === selfIdRef.current ? applyInput(p, "jumpcut") : p,
      ),
    };
    setGame(next);
    void commitGame(r.code, next);
  };

  // Acción cooperativa: un toque CARGA a la pareja sobre la cabeza; el segundo
  // toque la LANZA hacia la dirección de la mirada. Si no hay pareja a mano,
  // el mismo botón usa el GANCHO: lanza la cuerda al anillo más cercano (o
  // corta la cuerda si ya estás colgado).
  const doAction = () => {
    const g = gameRef.current;
    const r = roomRef.current;
    if (!r || g.phase !== "playing" || g.winner) return;
    const me = g.players.find((p) => p.id === selfIdRef.current);
    const foe = g.players.find((p) => p.id !== selfIdRef.current);
    if (!me || !foe || me.isBubble) return;
    if (me.carriedBy) return; // te están cargando a vos
    let nextMe = me;
    let nextFoe = foe;
    if (me.carrying === foe.id) {
      const th = tryThrow(me, foe);
      if (!th) return;
      nextMe = th.actor; nextFoe = th.partner;
      // Avisamos por broadcast que lanzamos a la pareja, con el impulso exacto.
      throwPulseRef.current = {
        seq: ++throwSeqSend.current,
        target: th.partner.id,
        vx: th.partner.vx,
        vy: th.partner.vy,
        until: Date.now() + 800,
      };
    } else {
      const gr = tryGrab(me, foe);
      if (gr) {
        nextMe = gr.actor; nextFoe = gr.partner;
      } else {
        // Sin pareja a rango → probamos el gancho.
        const hk = me.hooking ? { ...me, hooking: null } : startHook(me, g.tiles);
        if (!hk) {
          // Nada a mano: feedback visual de que la acción no encontró objetivo.
          nextMe = setEmote(me, "❓");
          nextFoe = foe;
        } else {
          nextMe = hk;
        }
      }
    }
    const next: BrosGameState = {
      ...g,
      ...(me.carrying === foe.id && nextMe.carrying === null && nextFoe.vx !== foe.vx
        ? {
            // Registramos el lanzamiento también en el estado (viaja por la DB
            // como respaldo por si el broadcast se pierde).
            lastThrow: {
              seq: throwSeqSend.current,
              target: nextFoe.id,
              vx: nextFoe.vx,
              vy: nextFoe.vy,
            },
          }
        : {}),
      players: g.players.map((p) =>
        p.id === me.id ? nextMe : p.id === foe.id ? nextFoe : p,
      ),
    };
    setGame(next);
    void commitGame(r.code, next);
  };

  // Emote rápido: se muestra encima del jugador unos frames para celebrar.
  const doEmote = (face = "🙌") => {
    const g = gameRef.current;
    const r = roomRef.current;
    if (!r || g.phase !== "playing" || g.winner) return;
    const next: BrosGameState = {
      ...g,
      players: g.players.map((p) => (p.id === selfIdRef.current ? setEmote(p, face) : p)),
    };
    setGame(next);
    void commitGame(r.code, next);
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
      if (jumpKeys.has(e.key)) { if (!e.repeat) doJump(); e.preventDefault(); }
      if (e.key === "e" || e.key === "E") { doAction(); e.preventDefault(); }
      if (e.key === "q" || e.key === "Q") { doEmote(); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      const dir = dirs[e.key];
      if (dir) keysRef.current.delete(dir);
      if (jumpKeys.has(e.key)) doJumpCut();
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
        const other = updated.state.players.find((p) => p.id !== selfIdRef.current);
        return {
          ...updated.state,
          players: updated.state.players.map((p) => {
            if (p.id !== selfIdRef.current || !keep) return p;
            // Reconciliación de carga por la ruta de la DB (respaldo del
            // broadcast): si la pareja nos carga, obedecemos; si soltó, soltamos.
            if (other?.carrying === p.id && !p.carriedBy && !p.isBubble) {
              return { ...p, carriedBy: other.id, carrying: null, jumped: false };
            }
            if (!other?.carrying && p.carriedBy === other?.id) {
              return { ...p, carriedBy: null, jumped: false };
            }
            return p;
          }),
          // Las monedas/items que YO ya marqué como recolectados no renacen
          // aunque el estado remoto venga con la copia vieja de los tiles.
          tiles: updated.state.tiles.map((rt) => {
            const lt = g.tiles.find((t) => t.type === rt.type && t.x === rt.x && t.y === rt.y);
            return lt?.collected ? { ...rt, collected: true } : rt;
          }),
        };
      });
      // Respaldo del lanzamiento por la DB (por si el broadcast se perdió).
      const lt = updated.state.lastThrow;
      if (lt && lt.seq > lastThrowSeq.current && lt.target === selfIdRef.current) {
        lastThrowSeq.current = lt.seq;
        setGame((g) => ({
          ...g,
          players: g.players.map((p) =>
            p.id === selfIdRef.current
              ? { ...p, carriedBy: null, hooking: null, onGround: false, jumped: false, vx: lt.vx, vy: lt.vy }
              : p,
          ),
        }));
      }
    });
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);

  // Broadcast Realtime: difundimos nuestro estado ~10 veces/seg para que el
  // rival interpole nuestra posición y reduzca los saltos por latencia.
  useEffect(() => {
    if (!room) return;
    const buf = snapBufRef.current;
    buf.clear();
    // Al recibir un snapshot del rival, además de guardarlo para interpolar,
    // reconciliamos las mecánicas que dependen de SU decisión sobre NOSOTROS:
    // si nos carga, nos llevamos (nuestra simulación obedece); si nos lanza,
    // recibimos el impulso exacto.
    const onRemoteSnapshot = (s: PlayerSnapshot) => {
      buf.push(s);
      const meId = selfIdRef.current;
      if (s.carrying === meId) {
        // La pareja nos está cargando: pasamos a obedecer su posición.
        setGame((g) => ({
          ...g,
          players: g.players.map((p) =>
            p.id === meId && !p.carriedBy && !p.isBubble
              ? { ...p, carriedBy: s.id as PlayerId, carrying: null, jumped: false }
              : p,
          ),
        }));
      } else if (s.throwSeq && s.throwSeq > lastThrowSeq.current && s.throwTarget === meId) {
        // ¡Nos lanzó! Aplicamos el impulso (permite doble salto a mitad de vuelo).
        lastThrowSeq.current = s.throwSeq;
        throwPulseRef.current = null;
        setGame((g) => ({
          ...g,
          players: g.players.map((p) =>
            p.id === meId
              ? {
                  ...p,
                  carriedBy: null,
                  hooking: null,
                  onGround: false,
                  jumped: false,
                  vx: s.throwVx ?? 0,
                  vy: s.throwVy ?? 0,
                }
              : p,
          ),
        }));
      } else if (!s.carrying) {
        // Dejó de cargar (o soltó a otra): cortamos nuestro carriedBy con él.
        setGame((g) => ({
          ...g,
          players: g.players.map((p) =>
            p.id === meId && p.carriedBy === s.id ? { ...p, carriedBy: null, jumped: false } : p,
          ),
        }));
      }
    };
    const bc = setupPlayerBroadcast(room.code, selfIdRef.current, onRemoteSnapshot);
    const sendTimer = window.setInterval(() => {
      const g = gameRef.current;
      const me = g.players.find((p) => p.id === selfIdRef.current);
      if (!me) return;
      const pulse =
        throwPulseRef.current && throwPulseRef.current.until > Date.now()
          ? throwPulseRef.current
          : null;
      if (throwPulseRef.current && !pulse) throwPulseRef.current = null;
      bc.send({
        id: me.id,
        x: me.x,
        y: me.y,
        vx: me.vx,
        vy: me.vy,
        state: g.phase,
        isBubble: !!me.isBubble,
        caged: !!me.caged,
        carrying: me.carrying ?? null,
        carriedBy: me.carriedBy ?? null,
        emote: me.emote ?? null,
        t: Date.now(),
        throwSeq: pulse?.seq,
        throwTarget: pulse?.target ?? null,
        throwVx: pulse?.vx,
        throwVy: pulse?.vy,
      });
    }, 100);
    return () => { window.clearInterval(sendTimer); bc.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);
  // (movimiento, gravedad, colisiones, mecánicas cooperativas, monedas y meta)
  // y lo publica ~4 veces/seg como fuente de verdad.
  useEffect(() => {
    if (!room) return;
    const tick = setInterval(() => {
      setGame((g) => {
        if (g.phase !== "playing" || g.winner) return g;
        const dir = keysRef.current.values().next().value ?? null;
        let enemies = updateEnemies(g.enemies);
        const eTick = g.eTick + 1;
        const coop = g.mode === "coop" || g.mode === "temple" || g.mode === "story";
        const collectedCoins: { x: number; y: number }[] = [];
        const collectedPowers: { x: number; y: number }[] = [];
        const collectedHearts: { x: number; y: number }[] = [];
        const players = g.players.map((p) => {
          if (p.id !== selfIdRef.current) return p; // el rival llega por red
          let np: BrosPlayer = { ...p, anim: p.anim + 1 / ANIM_FPS };
          np = tickEmote(np);
          if (np.caged) {
            // Jaula estilo Donkey Kong: flotas congelado hasta que tu pareja
            // cae ENCIMA de la jaula y la rompe (o te suelta sola a los ~5s).
            np = tickCage(np);
            const foe = g.players.find((q) => q.id !== selfIdRef.current);
            if (foe) {
              const r = tryCageRescue(foe, np);
              if (r.rescued) np = r.caged;
            }
            np = cageExpired(np);
          } else if (np.isBubble) {
            // Burbuja de rescate: flota y, si la pareja toca tu caja, te liberás.
                                    const foe = g.players.find((q) => q.id !== selfIdRef.current);
            np = updateBubble(np, foe);
            if (foe && aabbOverlap(np, foe)) {
              const r = tryRescueBubble(np, foe);
              np = r.a;
            }
          } else if (np.carriedBy) {
            // Nos están cargando: nuestra simulación obedece al portador.
            // La posición sale del último snapshot de él (interpolado);
            // seguimos recolectando items al vuelo pero sin física propia.
            np = { ...np, interactCd: Math.max(0, (np.interactCd ?? 0) - 1) };
            const carrierId = np.carriedBy ?? null;
            const cs = carrierId ? snapBufRef.current.sample(carrierId, performance.now()) : null;
            if (cs) {
              np = attachCarried(np, { ...np, id: np.carriedBy as PlayerId, x: cs.x, y: cs.y, width: 30, height: 48 });
            }
            np = { ...np, vx: 0, vy: 0, onGround: false };
          } else {
            np = { ...np, interactCd: Math.max(0, (np.interactCd ?? 0) - 1) };
            if (np.hooking) {
              // Deslizándonos por la cuerda: velocidad fija hacia el anillo.
              np = tickHook(np);
            } else {
              np = dir ? applyInput(np, dir) : applyInput(np, "stop");
              np = applyGravity(np);
            }
            // Pasamos TODOS los jugadores: las placas dobles y palancas exigen
            // saber dónde está el compañero; en coop, caer = burbuja (opts.coop).
            np = resolveCollisions(np, g.tiles, g.players, { coop });
            const prevFeetY = np.y + np.height; // para stomp "swept" anti-tunneling
            np = { ...np, x: np.x + np.vx, y: np.y + np.vy };
            // Si aterrizamos mientras estábamos deslizándonos por la cuerda,
            // la soltamos (ya llegamos).
            if (np.onGround && np.hooking) np = { ...np, hooking: null };
            // Saltar encima de un enemigo: lo destruye (o golpea al jefe), rebotá
            // y ganás monedas. Pero si lo pisaste (bounced) no te puede golpear.
            const stomp = stompEnemy(np, enemies, prevFeetY);
            enemies = stomp.enemies;
            if (stomp.bounced) {
              np = { ...np, vy: -10, onGround: false, jumped: false };
              if (stomp.coins > 0) np = { ...np, coins: np.coins + stomp.coins };
            } else if (hitEnemy(np, enemies)) {
              // Un escudo aguanta el golpe (te devuelve a la salida) sin perder vida.
              if ((np.shields ?? 0) > 0) {
                np = { ...resetPlayer(np), shields: np.shields - 1 };
              } else if (coop && np.lives - 1 <= 0) {
                // Muerte en cooperativo → burbuja de rescate, no fin de partida.
                np = { ...np, lives: np.lives - 1, isBubble: true, carrying: null, carriedBy: null, vx: 0, vy: 0, y: BUBBLE_TOP };
              } else {
                // ¡Jaula estilo Donkey Kong! Aparecés enjaulado cerca de tu
                // pareja: ella te libera saltando encima de la jaula.
                const foe = g.players.find((q) => q.id !== selfIdRef.current);
                np = { ...putInCage(np, foe ?? np), lives: np.lives - 1 };
              }
            }
          }
          // Cuidado: guardamos las monedas recolectadas para marcarlas en el
          // estado; si solo tomáramos `player` quedarían infinitas.
          const { player, collected } = collectCoins(np, g.tiles);
          if (collected.length) collectedCoins.push(...collected);
          // Economía: 10 monedas se convierten solas en una vida extra.
          const withLife = tradeCoinsForLife(player);
          const pw = collectPower(withLife, g.tiles);
          if (pw.collected.length) collectedPowers.push(...pw.collected);
          const hrt = collectHeart(pw.player, g.tiles);
          if (hrt.collected.length) collectedHearts.push(...hrt.collected);
          return hrt.player;
        });
        // Rescate de jaula: si caigo sobre la jaula de mi pareja, reboto, gano
        // monedas y ella se libera (su simulación ve mi snapshot y se suelta).
        const meP = players.find((p) => p.id === selfIdRef.current);
        const foeP = g.players.find((q) => q.id !== selfIdRef.current);
        if (meP && foeP?.caged) {
          const r = tryCageRescue(meP, foeP);
          if (r.rescued) players[players.findIndex((p) => p.id === meP.id)] = r.rescuer;
        }
        // Empuje de cajas: caminar contra una caja la mueve (y puede dejarla
        // sobre una placa para dejarla presionada).
        const dirs: Partial<Record<PlayerId, number>> = {};
        for (const p of players) {
          if (p.id === selfIdRef.current) {
            dirs[p.id] = keysRef.current.has("left") ? -1 : keysRef.current.has("right") ? 1 : 0;
          } else {
            // El rival: usamos su vx sincronizada; si está quieto, hacia dónde mira.
            dirs[p.id] = p.vx !== 0 ? Math.sign(p.vx) : p.facing === "left" ? -1 : p.facing === "right" ? 1 : 0;
          }
        }
        const pushed = pushCrates(players, g.tiles, dirs);
        // Latch de rejas: si una reja se abrió (alguien pisó la placa), queda
        // trabada para siempre. Así nadie queda encerrado del otro lado.
        const opened = new Set<number>();
        for (const t of pushed.tiles) {
          if (t.type === "gate" && !t.latched && gateOpen(pushed.tiles, t.pair ?? 0, pushed.players)) {
            opened.add(t.pair ?? 0);
          }
        }
        const tilesWithLatch = opened.size > 0
          ? [...pushed.tiles].map((t) => opened.has(t.pair ?? -1) ? { ...t, latched: true } : t)
          : pushed.tiles;
        // Marca como recolectadas las monedas/estrellas tocadas este frame para
        // que no vuelvan a aparecer ni se cuenten de nuevo.
        let tiles = tilesWithLatch;
        const markCollected = (type: string, list: { x: number; y: number }[]) => {
          if (!list.length) return;
          const keys = new Set(list.map((c) => `${c.x},${c.y}`));
          tiles = tiles.map((t) =>
            t.type === type && keys.has(`${t.x},${t.y}`) ? { ...t, collected: true } : t,
          );
        };
        markCollected("coin", collectedCoins);
        markCollected("power", collectedPowers);
        markCollected("heart", collectedHearts);
        const me = players.find((p) => p.id === selfIdRef.current);
        const foe = players.find((p) => p.id !== selfIdRef.current);
        let winner: PlayerId | null = g.winner;
        let phase: Phase = g.phase;
        if (me) {
          const coopClear = (g.mode === "coop" || g.mode === "story") && foe && reachFlag(me, g.tiles) && reachFlag(foe, g.tiles);
          const templeClear = g.mode === "temple" && reachFlag(me, g.tiles);
          if (coopClear || templeClear) {
            const maxLevel = g.mode === "story" ? storyStageCount() : MAX_LEVELS;
            if (g.level < maxLevel) {
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
        return { ...g, tiles, players: pushed.players, winner, phase, enemies, eTick };
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

  // Al avanzar de etapa mostramos un banner transitorio ("ETAPA N") y
  // guardamos el progreso del mundo (desbloqueamos la siguiente etapa).
  const prevLevel = useRef(0);
  useEffect(() => {
    if (game.level > 1 && game.level > prevLevel.current) {
      stageLevelRef.current = game.level;
      stageUntilRef.current = Date.now() + 2200;
    }
    if (game.mode === "story" && game.level > getWorldProgress()) {
      setWorldProgress(game.level);
      setProgress(getWorldProgress());
    }
    prevLevel.current = game.level;
  }, [game.level]);

  // Al terminar la última etapa del mundo guardamos el progreso final.
  useEffect(() => {
    if (game.mode === "story" && game.phase === "finished" && game.level >= getWorldProgress()) {
      setWorldProgress(game.level + 1);
      setProgress(getWorldProgress());
    }
  }, [game.phase, game.level, game.mode]);


  // Render loop con canvas (lee gameRef para dibujar a 60fps sin re-crear el efecto)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const drawSprite = (p: BrosPlayer) => {
      const base = p.id === "red" ? "#e63946" : "#3a86ff";
      const dark = p.id === "red" ? "#8f1620" : "#1f56a8";
      const s = 0.8 + Math.sin((p.anim + p.id.length) * Math.PI * 2) * 0.06;
      const walk = p.onGround && Math.abs(p.vx) > 0;
      const legSwing = walk ? Math.sin(p.anim * Math.PI * 2 * 2) : 0;
      const jumpPose = !p.onGround ? 0.5 : 0;
      // Sombras / contorno del cuerpo.
      const bodyH = p.height * 0.72;
      const bodyTop = p.y + p.height - bodyH;
      ctx.fillStyle = dark;
      ctx.fillRect(p.x + 1, bodyTop + 2, p.width - 2, bodyH - 2);
      ctx.fillStyle = base;
      ctx.fillRect(p.x, bodyTop, p.width - 4, bodyH - 4);
      // Piernas: alternan al caminar, se recogen al saltar.
      const legH = p.height * 0.22;
      const legY = bodyTop + bodyH;
      const off1 = (1 - legSwing) * 3 * (1 - jumpPose);
      const off2 = (1 + legSwing) * 3 * (1 - jumpPose);
      ctx.fillStyle = base;
      ctx.fillRect(p.x + 3 + off1, legY, 7, legH + (jumpPose ? 4 : 0));
      ctx.fillRect(p.x + p.width - 3 - 7 + off2, legY, 7, legH + (jumpPose ? 4 : 0));
      // Cabeza (ojos según hacia dónde mira).
      const eyeX = p.facing === "right" ? p.x + p.width - 10 : p.x + 8;
      ctx.fillStyle = "#fff";
      ctx.fillRect(eyeX, bodyTop + 4, 6, 7);
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(p.facing === "right" ? eyeX + 3 : eyeX, bodyTop + 6, 3, 4);
      // Escudo de estrella: anillo dorado pulsante.
      if ((p.shields ?? 0) > 0) {
        ctx.strokeStyle = "rgba(255, 200, 60, 0.9)";
        ctx.lineWidth = s - 0.5 > 0.4 ? 3 : 2;
        ctx.strokeRect(p.x - 4, p.y - 4, p.width + 8, p.height + 8);
        ctx.fillStyle = "rgba(255, 210, 80, 0.25)";
        ctx.fillRect(p.x - 4, p.y - 4, p.width + 8, p.height + 8);
      }
    };
    const render = () => {
      const g = gameRef.current;
      ctx.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
      // Mundo ancho con scroll: la cámara sigue al jugador local.
      const worldW = g.worldW ?? SCREEN_WIDTH;
      const meNow = g.players.find((p) => p.id === selfIdRef.current);
      const camX = meNow
        ? Math.max(0, Math.min(meNow.x - SCREEN_WIDTH * 0.35, worldW - SCREEN_WIDTH))
        : 0;
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

      // Geometría del juego en coordenadas del mundo, desplazada por la cámara.
      ctx.save();
      ctx.translate(-camX, 0);

      g.tiles.forEach((t) => {
        if (t.collected) return;
        if (t.type === "gate") {
          if (gateOpen(g.tiles, t.pair ?? 0, g.players)) return;
          ctx.fillStyle = "#8fa3b8";
          ctx.fillRect(t.x, t.y, t.w, t.h);
          ctx.fillStyle = "#5c6e80";
          for (let y = t.y + 6; y < t.y + t.h; y += 16) ctx.fillRect(t.x, y, t.w, 3);
          return;
        }
        if (t.type === "lever") {
          // Palanca: se mantiene presionada para abrir su portón.
          const held = leverHeld(g.tiles, t.pair ?? 0, g.players);
          ctx.fillStyle = held ? "#22c55e" : "#7d97ab";
          ctx.fillRect(t.x, t.y, t.w, 10); // base
          ctx.fillStyle = held ? "#a3e635" : "#f2c14e";
          ctx.fillRect(t.x + t.w / 2 - 4, t.y - 16, 8, 16); // mango
          ctx.fillStyle = held ? "#ecfccb" : "#fff";
          ctx.beginPath();
          ctx.arc(t.x + t.w / 2, t.y - 18, 4, 0, Math.PI * 2);
          ctx.fill();
          return;
        }
        if (t.type === "crate") {
          // Caja empujable: tablones y cruz de refuerzo.
          ctx.fillStyle = "#b5793a"; ctx.fillRect(t.x, t.y, t.w, t.h);
          ctx.fillStyle = "#8f5a26";
          ctx.fillRect(t.x, t.y, t.w, 4); ctx.fillRect(t.x, t.y + t.h - 4, t.w, 4);
          ctx.fillRect(t.x, t.y, 4, t.h); ctx.fillRect(t.x + t.w - 4, t.y, 4, t.h);
          ctx.strokeStyle = "#8f5a26"; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(t.x + 4, t.y + 4); ctx.lineTo(t.x + t.w - 4, t.y + t.h - 4);
          ctx.moveTo(t.x + t.w - 4, t.y + 4); ctx.lineTo(t.x + 4, t.y + t.h - 4);
          ctx.stroke();
          return;
        }
        if (t.type === "hook") {
          // Anillo de gancho: acercate y tocá CARGA para lanzar la cuerda.
          ctx.strokeStyle = "#cbd5e1";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#64748b";
          ctx.beginPath();
          ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
          // Destello suave para que se note que es interactuable.
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + Math.sin(g.eTick * 0.08) * 0.2})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(t.x + t.w / 2, t.y + t.h / 2, 11, 0, Math.PI * 2);
          ctx.stroke();
          return;
        }
        ctx.fillStyle =
          t.type === "ground" || t.type === "platform" ? "#8B4513"
          : t.type === "coin" ? "#ffd700"
          : t.type === "plate" ? (t.both ? "#b387ff" : "#f2c14e")
          : t.type === "flag" ? "#22c55e"
          : t.type === "power" ? "#ff9f2e"
          : t.type === "heart" ? "#e63946"
          : "#fff";
        ctx.fillRect(t.x, t.y, t.w, t.h);
        if (t.type === "power") {
          // Estrella: power-up que da un escudo.
          ctx.fillStyle = "#ffd700";
          ctx.font = "13px monospace";
          ctx.textAlign = "center";
          ctx.fillText("★", t.x + t.w / 2, t.y + t.h - 1);
        } else if (t.type === "heart") {
          // Corazón: 1UP (vida extra).
          ctx.fillStyle = "#fff";
          ctx.font = "13px monospace";
          ctx.textAlign = "center";
          ctx.fillText("♥", t.x + t.w / 2, t.y + t.h - 1);
        } else if (t.type === "plate" && t.both) {
          // Placa doble: exige el peso de los dos jugadores.
          ctx.fillStyle = "#fff";
          ctx.fillText("2P", t.x + t.w / 2, t.y + t.h - 1);
        }
      });
      const flag = g.tiles.find((t) => t.type === "flag");
      if (flag) {
        ctx.fillStyle = "rgba(255,255,255,.85)";
        ctx.font = "11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("META", flag.x + flag.w / 2, flag.y - 8);
      }
      // Jugadores: interpolamos al rival (para suavizar latencia) y colocamos
      // sobre la cabeza al que esté siendo llevado.
      const now = performance.now();
      const remoteId = selfIdRef.current === "red" ? "blue" : "red";
      const basePlayers = g.players.map((p) => {
        if (p.id !== remoteId) return p;
        const s = snapBufRef.current.sample(remoteId, now);
        if (!s) return p;
        return {
          ...p,
          x: s.x,
          y: s.y,
          vx: s.vx,
          vy: s.vy,
          isBubble: s.isBubble,
          caged: s.caged,
          carrying: s.carrying as PlayerId | null,
          carriedBy: s.carriedBy as PlayerId | null,
          emote: s.emote,
        } as BrosPlayer;
      });
      const renderPlayers = basePlayers.map((p) => {
        const carrier = basePlayers.find((q) => q.id === p.carriedBy);
        return carrier ? attachCarried(p, carrier) : p;
      });
      // Cuerdas: línea del jugador al anillo mientras esté enganchado.
      renderPlayers.forEach((p) => {
        if (!p.hooking) return;
        ctx.strokeStyle = "#d9b98a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + p.width / 2, p.y + p.height * 0.3);
        ctx.lineTo(p.hooking.x, p.hooking.y);
        ctx.stroke();
        ctx.fillStyle = "#d9b98a";
        ctx.beginPath();
        ctx.arc(p.hooking.x, p.hooking.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
      renderPlayers.forEach(drawSprite);
      // Burbuja de rescate y emotes encima de cada jugador.
      renderPlayers.forEach((p) => {
        if (p.caged) {
          // Jaula: barras verticales + techo, con parpadeo pidiendo rescate.
          const wob = Math.sin(g.eTick * 0.15) * 2;
          ctx.strokeStyle = "rgba(255,210,80,.95)";
          ctx.lineWidth = 3;
          ctx.strokeRect(p.x - 6 + wob * 0.2, p.y - 10, p.width + 12, p.height + 16);
          for (let bx = p.x + p.width / 4; bx < p.x + p.width; bx += p.width / 4) {
            ctx.beginPath(); ctx.moveTo(bx, p.y - 10); ctx.lineTo(bx, p.y + p.height + 6); ctx.stroke();
          }
          ctx.fillStyle = "rgba(255,210,80,.25)";
          ctx.fillRect(p.x - 6 + wob * 0.2, p.y - 10, p.width + 12, 5);
          ctx.fillStyle = "#ffd24f";
          ctx.font = "10px monospace"; ctx.textAlign = "center";
          ctx.fillText("¡RESCATE!", p.x + p.width / 2, p.y - 16);
        }
        if (p.isBubble) {
          ctx.strokeStyle = "rgba(150,220,255,.9)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.height * 0.8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "rgba(150,220,255,.18)";
          ctx.fill();
        }
        if (p.emote) {
          ctx.font = "14px monospace";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(0,0,0,.4)";
          ctx.fillText(p.emote, p.x + p.width / 2 + 1, p.y - 16);
          ctx.fillText(p.emote, p.x + p.width / 2, p.y - 17);
        }
      });
      g.enemies.forEach((e: Enemy) => {
        const baseY = e.y;
        const bobY = baseY + Math.sin((g.eTick + (parseInt(e.id.replace(/[^0-9]/g, "") || "0", 10) % 5)) / 6) * 2;
        ctx.fillStyle = e.boss ? "#7b2fbe" : e.flyer ? "#22c55e" : "#d6418f";
        ctx.fillRect(e.x, bobY, e.w, e.h);
        ctx.strokeStyle = "#1b0a24";
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x, bobY, e.w, e.h);
        ctx.fillStyle = "#fff";
        const eyeY = bobY + e.h * 0.3;
        ctx.fillRect(e.x + e.w * 0.22, eyeY, 5, 6);
        ctx.fillRect(e.x + e.w * 0.62, eyeY, 5, 6);
        ctx.fillStyle = "#000";
        ctx.fillRect(e.x + e.w * 0.22 + (e.dir > 0 ? 2 : 0), eyeY, 2, 3);
        ctx.fillRect(e.x + e.w * 0.62 + (e.dir > 0 ? 2 : 0), eyeY, 2, 3);
        if (e.boss) {
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
        const plates = g.tiles.filter((t) => t.type === "plate");
        const plateByPair = (pair: number) => plates.find((t) => t.pair === pair);
        const maxPair = plates.reduce((m, t) => Math.max(m, t.pair ?? 0), 0);
        const sello = plateByPair(1);
        const espejo = plateByPair(2);
        const runa = plates.length ? plateByPair(maxPair) : undefined;
        ctx.font = "10px monospace";
        ctx.fillStyle = "#8fd0ff";
        ctx.textAlign = "center";
        if (sello) ctx.fillText("EL SELLO DEL SOL", sello.x + sello.w / 2, sello.y - 6);
        if (espejo) ctx.fillText("EL ESPEJO DE LA LUNA", espejo.x + espejo.w / 2, espejo.y - 6);
        if (runa) {
          ctx.fillStyle = "#ffd700";
          ctx.fillText("EL CANTO DE LA RUNA", runa.x + runa.w / 2, runa.y - 6);
        }
        if (flag) {
          ctx.fillStyle = "#ffd700";
          ctx.textAlign = "right";
          ctx.fillText("EL TROFEO DORADO", flag.x + flag.w - 6, flag.y - 6);
        }
        const caveX = 430;
        ctx.fillStyle = "rgba(2, 8, 18, 0.45)";
        ctx.fillRect(caveX, 0, worldW - caveX, SCREEN_HEIGHT);
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#e8c46a";
        ctx.fillText("AFUERA · LA MONTAÑA", caveX - 180, 40);
        ctx.fillStyle = "#9ac9e0";
        ctx.fillText("LA CUEVA DE LOS ECOS", caveX + 180, 40);
        ctx.font = "10px monospace";
        ctx.fillStyle = "#a9c5db";
        ctx.fillText("adentro: seguí el canto de las runas", caveX + 180, 58);
      }
      ctx.restore();

      // Banner de transición de etapa (aparece y se desvanece).
      const bannerNow = Date.now();
      if (stageUntilRef.current > bannerNow && stageLevelRef.current > 1) {
        const fade = Math.min(1, (stageUntilRef.current - bannerNow) / 600);
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${0.55 * fade})`;
        ctx.fillRect(0, SCREEN_HEIGHT / 2 - 46, SCREEN_WIDTH, 92);
        ctx.fillStyle = `rgba(255,210,80,${fade})`;
        ctx.font = "26px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`ETAPA ${stageLevelRef.current}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 2);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.font = "12px monospace";
        ctx.fillText(
          g.mode === "story" ? (storyStage(stageLevelRef.current - 1)?.name ?? "") : "¡Adelante, bros!",
          SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 28,
        );
        ctx.restore();
      }

      // HUD fijo en pantalla.
      if (meNow) {
        const coinsLabel =
          g.mode === "coins"
            ? `● ${meNow.coins}/${COIN_GOAL}`
            : `● ${meNow.coins}/${COINS_PER_LIFE} → ♥`; // 10 monedas = 1 vida extra
        ctx.fillStyle = "#ffd700";
        ctx.font = "14px monospace";
        ctx.textAlign = "left";
        ctx.fillText(coinsLabel, 10, 22);
        if ((meNow.shields ?? 0) > 0) {
          ctx.fillStyle = "#ff9f2e";
          ctx.fillText(`★ ${meNow.shields}`, 10, 40);
        }
        ctx.fillStyle = "#e63946";
        ctx.textAlign = "right";
        ctx.fillText("♥".repeat(Math.max(0, meNow.lives)) || "—", SCREEN_WIDTH - 10, 22);
      }
      if (g.mode === "coop" || g.mode === "temple" || g.mode === "story") {
        const total = g.mode === "story" ? storyStageCount() : MAX_LEVELS;
        ctx.fillStyle = "rgba(255,255,255,.75)";
        ctx.font = "12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`ETAPA ${g.level}/${total}`, SCREEN_WIDTH / 2, 22);
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
        const redC = g.players.find((p) => p.id === "red")?.coins ?? 0;
        const blueC = g.players.find((p) => p.id === "blue")?.coins ?? 0;
        ctx.fillStyle = "#ffd700";
        ctx.font = "14px monospace";
        ctx.fillText(`🔴 ${redC}  vs  ${blueC} 🔵`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 34);
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.font = "10px monospace";
        ctx.fillText(
          g.mode === "lives" ? "Último en pie" : g.mode === "coins" ? "¡Monedas objetivo!" : "¡A la meta!",
          SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 54,
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
        const redC = g.players.find((p) => p.id === "red")?.coins ?? 0;
        const blueC = g.players.find((p) => p.id === "blue")?.coins ?? 0;
        ctx.fillStyle = "#ffd700";
        ctx.font = "13px monospace";
        ctx.fillText(`Total: 🔴 ${redC} / 🔵 ${blueC}`, SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 42);
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.font = "10px monospace";
        ctx.fillText(
          g.mode === "temple" ? "El templo quedó liberado 🏛️" : `Etapa ${g.level} superada`,
          SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 + 58,
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
    console.log("🎮 Super Bros v2.0609d — lobby cargado");
    return (
      <div className="bros-lobby" style={{ background: "linear-gradient(135deg, #ff006e, #8338ec, #3a86ff)", minHeight: "100vh" }}>
        <div style={{ background: "#ffbe0b", color: "#000", padding: "14px 24px", fontSize: "20px", fontWeight: "bold", textAlign: "center", borderBottom: "4px solid #ff006e", letterSpacing: "1px" }}>
          🎮 VERSIÓN NUEVA v2.0609d — CON CAJA Y JULIA 🎮
        </div>
        <h2 style={{ color: "#fff", textShadow: "2px 2px 0 #000" }}>Super Bros</h2>
        <p>¡El mundo co-op de plataformas! Etapas diseñadas a mano donde se
        necesitan el uno al otro para avanzar.</p>
        <div className="world-map-wrap">
          <BrosWorldMap
            stages={storyStages()}
            progress={progress}
            selected={selectedStage}
            onSelect={(i) => setSelectedStage(Math.min(i, progress - 1))}
          />
        </div>
        <p className="bros-note">
          {selectedStage > 0
            ? `Arrancan desde la etapa ${selectedStage + 1} de ${storyStageCount()}`
            : `Arrancan desde el comienzo (${storyStageCount()} etapas en el mundo)`}
        </p>
        <button onClick={createRoom} className="bros-btn primary">Crear sala 🎮</button>
        <button
          className="bros-btn secondary"
          onClick={() => { window.location.hash = "#brosdev"; }}
        >
          🧪 Probar etapas (playground)
        </button>
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
          <div className="bros-pad-zone">
            {/* D-Pad táctil a la izquierda */}
            <div className="bros-pad-directions">
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
          </div>
          <div className="bros-pad-zone">
            {/* Botones táctiles a la derecha: Salto, Acción/Cargar, Emote */}
            <div className="bros-pad-buttons">
              <button
                type="button"
                className="bros-pad emote"
                aria-label="Emote rápido"
                onPointerDown={() => doEmote("💪")}
              >
                💪
              </button>
              <button
                type="button"
                className="bros-pad action"
                aria-label="Acción: cargar, lanzar a la pareja o usar el gancho"
                onPointerDown={doAction}
              >
                <span className="bros-pad-label">CARGA</span>
              </button>
              <button
                type="button"
                className="bros-pad jump"
                aria-label="Saltar"
                onPointerDown={doJump}
                onPointerUp={doJumpCut}
                onPointerCancel={doJumpCut}
                onPointerLeave={doJumpCut}
              >
                <ChevronUp size={38} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

