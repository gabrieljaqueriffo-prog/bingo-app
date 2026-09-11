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
  stageCoinsLeft,
  tickCage,
  tryCageRescue,
  updateEnemies,
  tickThief,
  returnStolenHats,
  aabbOverlap,
  attachCarried,
  tryGrab,
  tryThrow,
  startHook,
  tickHook,
    updateBubble,
  tryRescueBubble,
  tickEmote,
  tickSpeech,
  hitBlock, collectFeather, tickFly,
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
import { drawBackground, drawTile, drawPlayer, drawEnemy } from "./sprites";
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
  const keysRef = useRef<Set<"left" | "right" | "up">>(new Set());
  // Premio "todas las monedas": se da UNA vez por etapa (+1 vida a cada uno).
  const perfectGivenRef = useRef(false);
  const [bonusMsg, setBonusMsg] = useState<string>("");
  const bonusMsgStartRef = useRef(0);
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
      // El creador es rojo: congela una línea base de tick para no RE-sincronizar
      // sus primeros segundos hacia atrás cuando el invitado (azul) haga su
      // primer commit con una copia vieja heredada del spawn.
      lastRemoteRevApplied.current = row.rev;
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

  // Salto: acción discreta al presionar la tecla. Blindado contra disparos
  // fantasma/duplicados del navegador o del toque (doble evento, tap espurio):
  // solo se permite UN salto por ventana corta. Esto evita el "salta solo"
  // que aparecía al crear la sala (doble disparo fantasma del botón/tecla).
  const lastJumpRef = useRef(0);
  const doJump = () => {
    const now = performance.now();
    if (now - lastJumpRef.current < 120) return; // ignora doble disparo fantasma
    const g = gameRef.current;
    const r = roomRef.current;
    if (!r || g.phase !== "playing" || g.winner) return;
    const me = g.players.find((p) => p.id === selfIdRef.current);
    if (!me) return;
    if (me.carriedBy) return; // te están cargando: no podés saltar
    if (!(me.onGround || me.coyote > 0 || me.hooking)) return;
    lastJumpRef.current = now;
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
      if (jumpKeys.has(e.key)) { if (!e.repeat) { doJump(); keysRef.current.add("up"); } e.preventDefault(); }
      if (e.key === "e" || e.key === "E") { doAction(); e.preventDefault(); }
      if (e.key === "q" || e.key === "Q") { doEmote(); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      const dir = dirs[e.key];
      if (dir) keysRef.current.delete(dir);
      if (jumpKeys.has(e.key)) { doJumpCut(); keysRef.current.delete("up"); }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reconciliación remota segura (online): preserva tu input local como
  //    autoridad, salvo cuando la pareja te carga/lanza (decisiones que
  //    afectan tu físico = vienen del otro, hay que obedecerlas).
  //    Todo se aplica en un solo setGame para evitar race con el intervalo tick.
  const lastRemoteRevApplied = useRef<number>(-1);
  const ownedInputVersionRef = useRef<number>(0);

  useEffect(() => {
    if (!room) return;
    const code = room.code;
    const stop = subscribeBrosRoom(code, (updated) => {
      if (updated.rev <= lastRemoteRevApplied.current) return;
      lastRemoteRevApplied.current = updated.rev;
      setRoom(updated); // UI de la sala

      // Reconciliación: aplicamos en UN solo setGame, determinista, para
      // evitar races con el intervalo tick local.
      setGame((g) => {
        const meId = selfIdRef.current;
        const gMe = g.players.find((p) => p.id === meId);
        const upMe = updated.state.players.find((p) => p.id === meId);
        const upOther = updated.state.players.find((p) => p.id !== meId);

        // Si cambié de nivel, arranco desde el spawn del servidor (nuevo mapa).
        const levelChanged = updated.state.level !== g.level;
        const base =
          !levelChanged && gMe ? gMe :
          upMe ?? gMe ?? g.players[0] ?? g.players[0];

        // ── Tu jugador (local): AUTORIDAD TOTAL de tu física. El reconciler del
        //    canal trae la BD pero NUNCA te pisa x/y/vx/vy: tu tick local es la
        //    fuente de verdad de tu movimiento (así no te quedás pegado ni
        //    saltás atrás). La BD solo aporta estado no-físico (vidas, jaula,
        //    burbuja, emotes, gorro) + decisiones del otro sobre vos
        //    (cargar/soltar) y el impulso de lanzamiento confirmado.
        let mine: BrosPlayer = base;
        if (!levelChanged && upMe) {
          const nonPhys: Partial<BrosPlayer> = {};
          if (upMe.lives != null) nonPhys.lives = upMe.lives;
          if (upMe.coins != null && upMe.coins > base.coins) nonPhys.coins = upMe.coins;
          if (upMe.shields != null) nonPhys.shields = upMe.shields;
          if (upMe.emote !== undefined) { nonPhys.emote = upMe.emote; nonPhys.emoteT = upMe.emoteT ?? base.emoteT; }
          if (upMe.say !== undefined) nonPhys.say = upMe.say;
          if (upMe.hatLost !== undefined) nonPhys.hatLost = upMe.hatLost;
          if (upMe.caged !== undefined) { nonPhys.caged = upMe.caged; if (upMe.cageT != null) nonPhys.cageT = upMe.cageT; }
          if (upMe.isBubble !== undefined) { nonPhys.isBubble = upMe.isBubble; if (upMe.bubbleT != null) nonPhys.bubbleT = upMe.bubbleT; }
          // El otro te cargó / te soltó: los flags sí vienen de él.
          if (upOther && upOther.carrying === meId && !base.carriedBy && !base.isBubble) {
            nonPhys.carriedBy = upOther.id as PlayerId;
            nonPhys.carrying = null;
          } else if (upOther && !upOther.carrying && base.carriedBy === upOther.id) {
            nonPhys.carriedBy = null;
          }
          mine = { ...base, ...nonPhys };
        }

        // ── El otro jugador (remoto): SU snapshot de la BD manda para TODO
        //    (posición, velocidad, flags). Tu copia local del rival NO manda:
        //    el portador te mueve en su tick y el broadcast te lo dibuja suave.
        //    Así el agarrar/cargar funciona porque el cargado obedece al otro.
        const otherState = upOther ?? g.players.find((p) => p.id !== meId) ?? {
          id: (meId === "red" ? "blue" : "red") as PlayerId,
          x: 160,
          y: 300,
          vx: 0,
          vy: 0,
          onGround: false,
          facing: "right",
          lives: 3,
          coins: 0,
          width: 30,
          height: 48,
          jumped: false,
          anim: 0,
          coyote: 0,
          shields: 0,
          isBubble: false,
          carrying: null,
          carriedBy: null,
          interactCd: 0,
          emote: null,
          emoteT: 0,
        };
        const other: BrosPlayer = { ...(otherState as BrosPlayer) };

        // Tiles: si yo ya recolecté algo, que no renazca aunque el servidor venga
        // con una copia vieja/exterior.
        const tiles = updated.state.tiles.map((rt) => {
          const lt = g.tiles.find((t) => t.type === rt.type && t.x === rt.x && t.y === rt.y);
          return lt?.collected ? { ...rt, collected: true } : rt;
        });

        // Si nos lanzaron por DB y el broadcast se perdió, asegurar impulso.
        const lt = updated.state.lastThrow;
        const hasLB = lt && lt.seq > (lastThrowSeq.current ?? 0) && lt.target === meId;
        if (hasLB) lastThrowSeq.current = lt.seq;

        return {
          ...updated.state,
          players: [
            { ...mine, ...(hasLB ? { vx: lt!.vx, vy: lt!.vy, carriedBy: null, hooking: null, onGround: false, jumped: false } : {}) },
            other,
          ],
          tiles,
          // Autoridad de enemigos: el anfitrión (rojo) conserva su simulación
          // local pero adopta las MUERTES (ids que la BD ya no trae, pisados por
          // el invitado); el invitado (azul) adopta los enemigos frescos del
          // anfitrión pero preserva sus kills locales hasta que viajen a la BD.
          enemies:
            selfIdRef.current === "red"
              ? g.enemies.filter((e) =>
                  updated.state.enemies.some((ue) => ue.id === e.id),
                )
              : (updated.state.enemies ?? g.enemies).filter(
                (ue) => !ue.dead && g.enemies.some((e) => e.id === ue.id),
              ),
          eTick:
            selfIdRef.current === "red"
              ? g.eTick
              : (updated.state.eTick ?? g.eTick),
        } satisfies BrosGameState;
      });
    });
    return stop;
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
        let enemies = g.enemies;
        // El anfitrión (red) es la únic autoridad de enemigos: él los avanza con
        // updateEnemies y los publica. El invitado (blue) NO debe re-simularlos;
        // recibe el estado del anfitrión vía reconciliación y los conserva, para
        // evitar que dos clientes peleen por las posiciones y los enemigos se
        // "reseteen" en loop.
        let thiefTick = { enemies, players: g.players };
        if (selfIdRef.current === "red") {
          enemies = updateEnemies(g.enemies);
          thiefTick = tickThief(enemies, g.players);
          enemies = thiefTick.enemies;
        }
        const preStompEnemies = enemies;
        const eTick = g.eTick + 1;
        const coop = g.mode === "coop" || g.mode === "temple" || g.mode === "story";
        const collectedCoins: { x: number; y: number }[] = [];
        const collectedPowers: { x: number; y: number }[] = [];
        const collectedHearts: { x: number; y: number }[] = [];
        const collectedFeathers: { x: number; y: number }[] = [];
        const hitBlocks: { x: number; y: number }[] = [];
        const jumpHeld = keysRef.current.has("up");
        const players = g.players.map((p) => {
          if (p.id !== selfIdRef.current) return p; // el rival llega por red
          let np: BrosPlayer = { ...p, anim: p.anim + 1 / ANIM_FPS };
          np = tickEmote(np);
          np = tickSpeech(np);
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
            // Nos están cargando: obedecemos al portador con SU copia local
            // (tick del portador), no con un snapshot viejo de red: así no
            // quedamos pegados/colgados cuando hay latencia.
            np = { ...np, interactCd: Math.max(0, (np.interactCd ?? 0) - 1) };
            const carrierLocal = g.players.find((q) => q.id === np.carriedBy);
            if (carrierLocal) {
              np = attachCarried(np, carrierLocal);
            } else {
              const carrierId = np.carriedBy ?? null;
              const cs = carrierId ? snapBufRef.current.sample(carrierId, performance.now()) : null;
              if (cs) {
                np = attachCarried(np, { ...np, id: np.carriedBy as PlayerId, x: cs.x, y: cs.y, width: 30, height: 48 });
              }
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
            const prevHeadY = np.y; // cabeza antes de moverse (para bloques "?")
            np = { ...np, x: np.x + np.vx, y: np.y + np.vy };
            // Poder de vuelo: mientras haya pluma, mantener el salto sube.
            np = tickFly(np, jumpHeld);
            // Golpear un bloque "?" desde abajo otorga el poder de volar.
            const hb = hitBlock(np, g.tiles, prevHeadY);
            if (hb.hit) { np = hb.player; const bl = hb.tiles.find((t) => t.type === "block" && t.collected); if (bl) hitBlocks.push({ x: bl.x, y: bl.y }); }
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
          const fth = collectFeather(hrt.player, g.tiles);
          if (fth.collected.length) collectedFeathers.push(...fth.collected);
          return fth.player;
        });
        // Rescate de jaula: si caigo sobre la jaula de mi pareja, reboto, gano
        // monedas y ella se libera (su simulación ve mi snapshot y se suelta).
        const meP = players.find((p) => p.id === selfIdRef.current);
        const foeP = g.players.find((q) => q.id !== selfIdRef.current);
        if (meP && foeP?.caged) {
          const r = tryCageRescue(meP, foeP);
          if (r.rescued) players[players.findIndex((p) => p.id === meP.id)] = r.rescuer;
        }
        // El gorro robado vuelve si estamparon al ladrón este frame.
        const hatPlayers = returnStolenHats(preStompEnemies, enemies, players);
        // Empuje de cajas: caminar contra una caja la mueve (y puede dejarla
        // sobre una placa para dejarla presionada).
        const dirs: Partial<Record<PlayerId, number>> = {};
        for (const p of players) {
          if (p.id === selfIdRef.current) {
            // Yo: mis flechas mandan (salvo que me estén cargando: ahí mi
            // movimiento viene del portador, no de mis teclas).
            const beingCarried = !!p.carriedBy;
            dirs[p.id] = !beingCarried
              ? keysRef.current.has("left") ? -1 : keysRef.current.has("right") ? 1 : 0
              : 0;
          } else {
            // El rival NO se simula localmente para empujar cajas: su copia de
            // la BD manda y mi render/broadcast lo mueve. Empujarlo aquí con
            // una vx vieja lo "pegaba" contra la caja.
            dirs[p.id] = 0;
          }
        }
        const pushed = pushCrates(hatPlayers, g.tiles, dirs);
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
        markCollected("feather", collectedFeathers);
        markCollected("block", hitBlocks);
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
        // Premio "todas las monedas": si no queda ninguna y no se dio aún,
        // otorgamos +1 vida a cada uno y mostramos celebración.
        let finalPlayers = pushed.players;
        if (stageCoinsLeft(tiles) === 0 && !perfectGivenRef.current) {
          perfectGivenRef.current = true;
          finalPlayers = finalPlayers.map((pl) => ({ ...pl, lives: Math.min(6, pl.lives + 1) }));
          setBonusMsg("¡PERFECTO! Todas las monedas + ❤");
          bonusMsgStartRef.current = Date.now();
          window.setTimeout(() => setBonusMsg(""), 2600);
        }
        return { ...g, tiles, players: finalPlayers, winner, phase, enemies, eTick };
      });
    }, 1000 / 30);
    const commit = setInterval(() => {
      if (selfIdRef.current !== "red") return; // solo el host publica el mundo
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
    if (game.level !== prevLevel.current) perfectGivenRef.current = false;
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
      // Personaje dibujado bonito (mismo estilo que el playground).
      drawPlayer(ctx, p, gameRef.current.eTick);
      // Escudo de estrella: anillo dorado pulsante.
      if ((p.shields ?? 0) > 0) {
        ctx.strokeStyle = "rgba(255, 200, 60, 0.9)";
        ctx.lineWidth = 3;
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
      // Fondo bonito con cielo, sol, nubes y colinas (atardecer en etapas altas).
      drawBackground(ctx, camX, { dusk: g.mode === "coop" && g.level >= 3 });

      // Geometría del juego en coordenadas del mundo, desplazada por la cámara.
      ctx.save();
      ctx.translate(-camX, 0);

      g.tiles.forEach((t) => {
        if (t.collected) return;
        const isOpen =
          t.type === "gate" ? gateOpen(g.tiles, t.pair ?? 0, g.players)
          : t.type === "lever" ? leverHeld(g.tiles, t.pair ?? 0, g.players)
          : false;
        drawTile(ctx, t, g.eTick, isOpen);
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
        if (p.say) {
          ctx.font = "bold 8px system-ui,sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = "#ffcc00";
          ctx.fillText(p.say.text, p.x + p.width / 2, p.y - (8+8));
        }
      });
      // Enemigos dibujados bonito: caminantes, voladores, ladrón y jefe.
      g.enemies.forEach((e: Enemy) => { if (!e.dead) drawEnemy(ctx, e, g.eTick); });
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
      // Premio "todas las monedas": aviso que se desvanece.
      if (bonusMsg) {
        const fade = Math.min(1, (3500 - (Date.now() - bonusMsgStartRef.current)) / 600);
        ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${0.6})`;
        ctx.fillRect(SCREEN_WIDTH / 2 - 170, 84, 340, 46);
        ctx.fillStyle = `rgba(255,210,80,${Math.max(0, fade)})`;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.fillText(bonusMsg, SCREEN_WIDTH / 2, 113);
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
                onPointerDown={() => { doJump(); keysRef.current.add("up"); }}
                onPointerUp={() => { doJumpCut(); keysRef.current.delete("up"); }}
                onPointerCancel={() => { doJumpCut(); keysRef.current.delete("up"); }}
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

