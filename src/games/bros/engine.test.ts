import { describe, it, expect } from "vitest";
import "./stages"; // registra las etapas del modo historia (efecto secundario)
import {
  BrosPlayer,
  createInitialGameState,
  applyInput,
  applyGravity,
  resolveCollisions,
  reachFlag,
  collectCoins,
  collectPower,
  collectHeart,
  makeLevel,
  crate,
  CAGE_AUTOFREE_FRAMES,
  CAGE_REWARD,
  CAGE_Y,
  cageExpired,
  putInCage,
  pushCrates,
  PUSH_SPEED,
  tickCage,
  tryCageRescue,
  updateEnemies,
  hitEnemy,
  stompEnemy,
  tradeCoinsForLife,
  BOSS_HP,
  COYOTE_FRAMES,
  type Enemy,
  type BrosMode,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  MOVE_SPEED,
  JUMP_FORCE,
  GRAVITY,
  tryGrab,
  tryThrow,
  startHook,
  tickHook,
  findHook,
  type BrosTile,
  type PlayerId,
  registerStoryStages,
  storyStageCount,
  storyStage,
  gateOpen,
  platePressed,
  groundSegment,
  defaultPlayers,
  flagAtGround,
} from "./engine";
describe("Super Bros Engine", () => {
  const basePlayer: BrosPlayer = {
    id: "red",
    x: 100,
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
  };

  describe("gancho con cuerda", () => {
    const hookTile: BrosTile = { type: "hook", x: 200, y: 220, w: 14, h: 14 };
    const pNear = (): BrosPlayer => ({ ...basePlayer, x: 150, y: 300 }); // centro (165,324)

    it("encuentra el anillo dentro del rango", () => {
      const t = findHook(pNear(), [hookTile]);
      expect(t).toEqual({ x: 207, y: 227 });
    });

    it("no encuentra anillos fuera de rango", () => {
      const far: BrosTile = { type: "hook", x: 800, y: 220, w: 14, h: 14 };
      expect(findHook(pNear(), [far])).toBeNull();
    });

    it("startHook engancha al anillo más cercano", () => {
      const p = startHook(pNear(), [hookTile])!;
      expect(p.hooking).toEqual({ x: 207, y: 227 });
      expect(p.onGround).toBe(false);
    });

    it("startHook falla sin anillos o si te están cargando", () => {
      expect(startHook(pNear(), [])).toBeNull();
      const carried = { ...pNear(), carriedBy: "blue" as const };
      expect(startHook(carried, [hookTile])).toBeNull();
    });

    it("tickHook acerca al jugador al anillo y al llegar lo suelta hacia arriba", () => {
      let p = startHook(pNear(), [hookTile])!;
      const d0 = Math.hypot(p.hooking!.x - (p.x + 15), p.hooking!.y - (p.y + 24));
      const v = tickHook(p); // fija la velocidad hacia el anillo
      p = { ...v, x: v.x + v.vx, y: v.y + v.vy }; // el tick integra la posición
      const d1 = Math.hypot(p.hooking!.x - (p.x + 15), p.hooking!.y - (p.y + 24));
      expect(d1).toBeLessThan(d0);
      // Forzamos llegada: al estar encima del anillo, corta y da impulso ascendente.
      const at = { ...p, x: p.hooking!.x - 15, y: p.hooking!.y - 24 };
      const released = tickHook(at);
      expect(released.hooking).toBeNull();
      expect(released.vy).toBeLessThan(0);
    });

    it("el salto corta la cuerda con impulso", () => {
      let p = startHook(pNear(), [hookTile])!;
      p = applyInput(p, "up");
      expect(p.hooking).toBeNull();
      expect(p.vy).toBeLessThan(0);
    });
  });

  describe("cargar y lanzar a la pareja", () => {
    const partner: BrosPlayer = { ...basePlayer, id: "blue", x: 134, y: 300 };

    it("carga a la pareja cercana y de frente", () => {
      const me = { ...basePlayer, onGround: true, facing: "right" as const };
      const res = tryGrab(me, partner)!;
      expect(res.actor.carrying).toBe("blue");
      expect(res.partner.carriedBy).toBe("red");
    });

    it("no carga si está en el aire o fuera de rango", () => {
      const airborne = { ...basePlayer, onGround: false };
      expect(tryGrab(airborne, partner)).toBeNull();
      const far = { ...partner, x: 100 + 60 + 200 };
      expect(tryGrab({ ...basePlayer, onGround: true }, far)).toBeNull();
    });

    it("lanza a la pareja cargada con impulso", () => {
      const me = { ...basePlayer, onGround: true, carrying: "blue" as const };
      const res = tryThrow(me, { ...partner, carriedBy: "red" })!;
      expect(res.actor.carrying).toBeNull();
      expect(res.partner.vx).toBeGreaterThan(0); // mirando a la derecha
      expect(res.partner.vy).toBeLessThan(0); // sale hacia arriba
    });
  });

  it("should start with two players and valid dimensions", () => {
    const state = createInitialGameState();
    expect(state.players.length).toBe(2);
    expect(state.players[0].id).toBe("red");
    expect(state.players[1].id).toBe("blue");
    expect(state.phase).toBe("playing");
  });

  it("should move left/right", () => {
    const p = applyInput(basePlayer, "left");
    expect(p.vx).toBe(-MOVE_SPEED);
    expect(p.facing).toBe("left");

    const r = applyInput(basePlayer, "right");
    expect(r.vx).toBe(MOVE_SPEED);
    expect(r.facing).toBe("right");
  });

  it("should stop moving", () => {
    const p = { ...basePlayer, vx: 5 };
    const stopped = applyInput(p, "stop");
    expect(stopped.vx).toBe(0);
  });

  it("should jump when on ground", () => {
    const p = { ...basePlayer, onGround: true, jumped: false };
    const jumped = applyInput(p, "up");
    expect(jumped.vy).toBe(JUMP_FORCE);
    expect(jumped.onGround).toBe(false);
    expect(jumped.jumped).toBe(true);
  });

  it("no permite saltar en el aire (sin doble salto encadenable)", () => {
    const p = { ...basePlayer, onGround: false, jumped: true, vy: 2 };
    const jumped = applyInput(p, "up");
    expect(jumped.vy).toBe(2); // vy intacto: NO vuelve a saltar en el aire
  });

  it("should apply gravity when not on ground", () => {
    const p = applyGravity({ ...basePlayer, onGround: false, vy: 0 });
    expect(p.vy).toBeCloseTo(GRAVITY);
  });

  it("should cap fall speed", () => {
    let p = applyGravity({ ...basePlayer, vy: 20, onGround: false });
    expect(p.vy).toBeLessThanOrEqual(20);
  });

  it("should lose a life when falling below the screen", () => {
    const p = { ...basePlayer, y: SCREEN_HEIGHT + 10, vy: 5, onGround: false, jumped: false };
    const fallen = resolveCollisions(p, createInitialGameState().tiles);
    expect(fallen.lives).toBe(2);
    expect(fallen.y).toBe(300); // respawn
  });

  it("should land on the ground", () => {
    const p = { ...basePlayer, y: SCREEN_HEIGHT - 85, vy: 8, onGround: false };
    const tiles = createInitialGameState().tiles;
    const landed = resolveCollisions(p, tiles);
    expect(landed.onGround).toBe(true);
    expect(landed.vy).toBe(0);
  });

  it("should collect a coin when overlapping", () => {
    const tiles = createInitialGameState().tiles;
    const coin = tiles.find((t) => t.type === "coin")!;
    const p = { ...basePlayer, x: coin.x - 5, y: coin.y - 5 };
    const { player, collected } = collectCoins(p, tiles);
    expect(collected.length).toBe(1);
    expect(player.coins).toBe(1);
  });

  it("should win when reaching the flag", () => {
    const tiles = createInitialGameState().tiles;
    const flag = tiles.find((t) => t.type === "flag")!;
    const p = { ...basePlayer, x: flag.x, y: flag.y - 40 };
    expect(reachFlag(p, tiles)).toBe(true);
  });

  it("should respawn with correct position after falling", () => {
    const p: BrosPlayer = { ...basePlayer, id: "blue", y: 1000, vy: 10, onGround: false, jumped: false };
    const tiles = createInitialGameState().tiles;
    const respawned = resolveCollisions(p, tiles);
    expect(respawned.lives).toBe(2);
    expect(respawned.x).toBe(160);
    expect(respawned.y).toBe(300);
  });

  it("should spawn enemies, a flyer and a final boss in temple level 3", () => {
    const level3 = makeLevel("temple", 3, [basePlayer, { ...basePlayer, id: "blue", x: 160 }]);
    expect(level3.enemies.length).toBe(4);
    expect(level3.enemies.some((e) => e.boss)).toBe(true);
    expect(level3.enemies.some((e) => e.flyer)).toBe(true);
    expect(level3.level).toBe(3);
  });

  it("should have multi-screen worlds (scroll) with the flag far to the right", () => {
    const modes: BrosMode[] = ["race", "coins", "lives", "coop", "temple"];
    for (const mode of modes) {
      const state = createInitialGameState(mode);
      // El mundo es más ancho que una pantalla.
      expect(state.worldW).toBeGreaterThan(SCREEN_WIDTH);
      // La meta queda fuera de la primera pantalla: hay que recorrer el mundo.
      const flag = state.tiles.find((t) => t.type === "flag");
      expect(flag).toBeDefined();
      expect(flag!.x).toBeGreaterThan(SCREEN_WIDTH);
      // Todas las compuertas quedan antes de la meta.
      for (const gate of state.tiles.filter((t) => t.type === "gate")) {
        expect(gate.x).toBeLessThan(flag!.x);
      }
    }
  });

  it("should not walk off the left edge of the world", () => {
    const p = { ...basePlayer, x: 2, vx: -MOVE_SPEED, onGround: true };
    const clamped = resolveCollisions(p, createInitialGameState().tiles);
    expect(clamped.x).toBeGreaterThanOrEqual(0);
  });

  it("should bounce enemies between their patrol limits", () => {
    const enemies = updateEnemies([
      { id: "x", x: 280, y: 0, w: 28, h: 40, minX: 280, maxX: 600, dir: 1, speed: 2, boss: false },
      { id: "y", x: 598, y: 0, w: 28, h: 40, minX: 280, maxX: 600, dir: -1, speed: 2, boss: false },
    ] as Enemy[]);
    expect(enemies[0].x).toBeGreaterThan(280);
    expect(enemies[1].x).toBeLessThan(598);
  });

  it("should detect a player hitting an enemy", () => {
    const enemy = [
      { id: "e", x: 300, y: 300, w: 28, h: 40, minX: 0, maxX: 800, dir: 1, speed: 2, boss: false },
    ] as Enemy[];
    const hit = { ...basePlayer, x: 305, y: 300 };
    expect(hitEnemy(hit, enemy)).toBe(true);
    const miss = { ...basePlayer, x: 500, y: 300 };
    expect(hitEnemy(miss, enemy)).toBe(false);
  });

  it("should let the boss be stomped to reduce HP and die after BOSS_HP hits", () => {
    const boss = { id: "boss", x: 300, y: 300, w: 46, h: 66, minX: 0, maxX: 800, dir: 1, speed: 2, boss: true, hp: BOSS_HP };
    let enemies = [boss] as Enemy[];
    const stomper = { ...basePlayer, x: 315, y: 270, vy: 6 };
    const r1 = stompEnemy(stomper, enemies);
    expect(r1.bounced).toBe(true);
    expect(r1.enemies[0].hp).toBe(BOSS_HP - 1);
    enemies = r1.enemies;
    // golpes repetidos (sin stun) lo matan tras BOSS_HP golpes
    let hits = BOSS_HP - 1;
    while (hits-- > 0) {
      const r = stompEnemy(stomper, enemies.map((e) => ({ ...e, stun: 0 })));
      enemies = r.enemies;
    }
    expect(enemies.length).toBe(0);
  });

  it("should stomp via swept detection when falling fast (anti-tunneling)", () => {
    const enemy = { id: "e", x: 300, y: 320, w: 28, h: 40, minX: 0, maxX: 800, dir: 1, speed: 2, boss: false } as Enemy;
    // Cayendo a MAX_FALL_SPEED: los pies pasan de estar ENCIMA del enemigo a
    // atravesarlo en un solo tick; la ventana estática no alcanza, el cruce sí.
    const prevFeetY = 315; // por encima de e.y = 320
    const now = { ...basePlayer, x: 305, y: 340, vy: 15 }; // pies = 388 (fuera de ventana)
    const r = stompEnemy(now, [enemy], prevFeetY);
    expect(r.bounced).toBe(true);
    expect(r.enemies.length).toBe(0);
    expect(r.coins).toBe(1);
    // Sin prevFeetY (comportamiento anterior): NO hay stomp.
    const r2 = stompEnemy(now, [{ ...enemy }]);
    expect(r2.bounced).toBe(false);
    // Cruce desde abajo (subiendo) NO cuenta como stomp.
    const rising = { ...basePlayer, x: 305, y: 340, vy: -8 };
    const r3 = stompEnemy(rising, [{ ...enemy }], 388);
    expect(r3.bounced).toBe(false);
  });

  it("should give coins when stomping enemies (1 for normal, 3 for the boss)", () => {
    const normal = { id: "e", x: 300, y: 320, w: 28, h: 40, minX: 0, maxX: 800, dir: 1, speed: 2, boss: false };
    const stomper = { ...basePlayer, x: 305, y: 290, vy: 6 };
    const rn = stompEnemy(stomper, [normal] as Enemy[]);
    expect(rn.enemies.length).toBe(0);
    expect(rn.coins).toBe(1);

    const boss = { id: "boss", x: 300, y: 300, w: 46, h: 66, minX: 0, maxX: 800, dir: 1, speed: 2, boss: true, hp: 1 };
    const rb = stompEnemy(stomper, [boss] as Enemy[]);
    expect(rb.enemies.length).toBe(0);
    expect(rb.coins).toBe(3);
  });

  it("should trade 10 coins for an extra life automatically", () => {
    const p = { ...basePlayer, coins: 9, lives: 2 };
    expect(tradeCoinsForLife(p).lives).toBe(2); // aún no alcanza
    const traded = tradeCoinsForLife({ ...basePlayer, coins: 10, lives: 2 });
    expect(traded.coins).toBe(0);
    expect(traded.lives).toBe(3);
  });

  it("should cut the jump when released (variable jump height)", () => {
    const p = { ...basePlayer, vy: JUMP_FORCE, jumped: true };
    const cut = applyInput(p, "jumpcut");
    expect(cut.vy).toBeLessThan(0); // sigue subiendo, pero más despacio
    expect(Math.abs(cut.vy)).toBeLessThan(Math.abs(JUMP_FORCE));
  });

  it("should allow a coyote-time jump right after leaving a ledge", () => {
    const p = { ...basePlayer, onGround: false, jumped: false, coyote: 6, vy: 4 };
    const jumped = applyInput(p, "up");
    expect(jumped.vy).toBe(JUMP_FORCE);
    expect(jumped.coyote).toBe(0); // la ventana se consume al saltar
  });

  it("should refresh coyote frames while standing and drain them off a ledge", () => {
    const tiles = createInitialGameState().tiles;
    let p = { ...basePlayer, y: SCREEN_HEIGHT - 85, vy: 8, onGround: false, coyote: 0 };
    p = resolveCollisions(p, tiles);
    expect(p.onGround).toBe(true);
    expect(p.coyote).toBe(COYOTE_FRAMES);
    // En el aire (sin tiles sólidos), la ventana se agota gradualmente.
    const air = resolveCollisions({ ...p, onGround: false, y: p.y - 2, coyote: p.coyote }, []);
    expect(air.coyote).toBeLessThan(COYOTE_FRAMES);
  });

  it("should give a shield when collecting a power star", () => {
    const tiles = createInitialGameState().tiles;
    const star = tiles.find((t) => t.type === "power")!;
    expect(star).toBeDefined();
    const p = { ...basePlayer, x: star.x - 5, y: star.y - 5 };
    const { player, collected } = collectPower(p, tiles);
    expect(collected.length).toBe(1);
    expect(player.shields).toBe(1);
    // No se pueden acumular más de 3 escudos.
    const capped = collectPower({ ...player, x: star.x - 5, y: star.y - 5, shields: 3 }, tiles);
    expect(capped.player.shields).toBe(3);
  });

  it("should give an extra life when collecting a heart (1UP)", () => {
    const tiles = createInitialGameState().tiles;
    const heart = tiles.find((t) => t.type === "heart")!;
    expect(heart).toBeDefined();
    const p = { ...basePlayer, x: heart.x - 5, y: heart.y - 5, lives: 2 };
    const { player, collected } = collectHeart(p, tiles);
    expect(collected.length).toBe(1);
    expect(player.lives).toBe(3);
    // Tope de vidas: no pasa de MAX_LIVES (9).
    const capped = collectHeart({ ...player, x: heart.x - 5, y: heart.y - 5, lives: 9 }, tiles);
    expect(capped.player.lives).toBe(9);
    // Si el corazón ya se recogió, no vuelve a sumar.
    const again = collectHeart({ ...player, x: heart.x - 5, y: heart.y - 5, lives: 3 }, [
      { ...heart, collected: true },
    ]);
    expect(again.collected.length).toBe(0);
    expect(again.player.lives).toBe(3);
  });

  it("should place power stars and a heart in every stage", () => {
    const modes: BrosMode[] = ["race", "coins", "lives", "coop", "temple"];
    for (const mode of modes) {
      const state = createInitialGameState(mode);
      expect(state.tiles.some((t) => t.type === "power")).toBe(true);
      expect(state.tiles.some((t) => t.type === "heart")).toBe(true);
    }
  });

  it("should make flyer enemies bob vertically while patrolling", () => {
    const flyer = { id: "f", x: 400, y: 300, baseY: 300, w: 24, h: 24, minX: 300, maxX: 700, dir: 1, speed: 2, flyer: true, phase: 0 } as Enemy;
    const moved = updateEnemies([flyer])[0];
    expect(moved.y).not.toBe(300); // cambió la altura por el aleteo
    expect(moved.phase).toBeGreaterThan(0);
  });
});
describe("mundo historia (story)", () => {
    registerStoryStages([
      {
        id: "test",
        name: "Etapa de prueba",
        intro: "Pisá la placa doble con ambos.",
        width: SCREEN_WIDTH * 2,
        tiles: [
          ...groundSegment(0, SCREEN_WIDTH * 2),
          crate(200, SCREEN_HEIGHT - 32 - 36),
          { type: "plate", x: 400, y: SCREEN_HEIGHT - 44, w: 90, h: 12, pair: 1, both: true },
          { type: "gate", x: 600, y: 240, w: 16, h: SCREEN_HEIGHT - 240, pair: 1 },
          flagAtGround(SCREEN_WIDTH * 2 - 60),
        ],
        enemies: [],
      },
    ]);

    it("registra y expone las etapas", () => {
      expect(storyStageCount()).toBe(1);
      expect(storyStage(0)?.name).toBe("Etapa de prueba");
    });
    it("worldWidthForLevel y makeLevel usan la etapa registrada", () => {
      const state = makeLevel("story", 1, createInitialGameState("story").players);
      expect(state.worldW).toBe(SCREEN_WIDTH * 2);
      expect(state.tiles.some((t) => t.type === "plate" && t.both)).toBe(true);
      expect(state.tiles.some((t) => t.type === "flag")).toBe(true);
    });

    it("la reja se abre con DOS pesos: dos jugadores, o jugador + caja", () => {
      const state = makeLevel("story", 1, createInitialGameState("story").players);
      const p1 = { ...state.players[0], x: 410, y: 400 };
      const p2 = { ...state.players[1], x: 440, y: 400 };
      expect(platePressed(state.tiles, 1, [p1])).toBe(false);
      expect(platePressed(state.tiles, 1, [p1, p2])).toBe(true);
      expect(gateOpen(state.tiles, 1, [p1, p2])).toBe(true);
      // Un jugador solo NO alcanza... salvo que la caja esté sobre la placa.
      const crateTile = state.tiles.find((t) => t.type === "crate")!;
      const conCaja = state.tiles.map((t) =>
        t === crateTile ? { ...t, x: 415, y: t.y } : t,
      );
      expect(platePressed(conCaja, 1, [p1])).toBe(true);
      expect(gateOpen(conCaja, 1, [p1])).toBe(true);
    });

    it("pushCrates: la caja se empuja caminando contra ella (estilo Mario)", () => {
      // Escenario propio (sin depender de etapas registradas): suelo + caja.
      const tiles: BrosTile[] = [...groundSegment(0, 800), crate(430, 380)];
      const startX = 430;
      const py = 380 + 36 - 48; // parado sobre el piso, a la altura de la caja
      const mk = (id: PlayerId, x: number): BrosPlayer => ({
        ...defaultPlayers.find((p) => p.id === id)!,
        x, y: py, onGround: true, vx: 0,
      });
      // Caminar contra la caja la empuja (con un solo jugador alcanza).
      const a = mk("red", startX - 30);
      const r1 = pushCrates([a, mk("blue", 700)], tiles, { red: 1, blue: 0 });
      expect(r1.tiles.find((t) => t.type === "crate")!.x).toBe(startX + PUSH_SPEED);
      expect(r1.players[0].x).toBe(startX + PUSH_SPEED - a.width); // pegado a la caja
      // Sin dirección no hay empuje.
      const r2 = pushCrates([a, mk("blue", 700)], tiles, { red: 0, blue: 0 });
      expect(r2.tiles.find((t) => t.type === "crate")!.x).toBe(startX);
      // Empujar en direcciones opuestas: el que la toca gana (empuja y queda pegado).
      const r3 = pushCrates([a, mk("blue", startX + 56)], tiles, { red: 1, blue: -1 });
      expect(r3.tiles.find((t) => t.type === "crate")!.x).toBe(startX + PUSH_SPEED);
      // Contra una reja cerrada la caja no puede avanzar.
      const conReja: BrosTile[] = [
        ...tiles,
        { type: "gate", x: startX + 10, y: 180, w: 16, h: 236, pair: 99 },
      ];
      const r4 = pushCrates([a, mk("blue", 700)], conReja, { red: 1, blue: 0 });
      expect(r4.tiles.find((t) => t.type === "crate")!.x).toBe(startX);
    });
    it("jaula: al morir quedás enjaulado y tu pareja te libera saltando encima", () => {
      const state = makeLevel("story", 1, createInitialGameState("story").players);
      const red = state.players[0], blue = { ...state.players[1], x: 400, y: 400 };
      const jaula = putInCage(red, blue);
      expect(jaula.caged).toBe(true);
      expect(jaula.y).toBe(CAGE_Y); // flota a altura de salto
      // El rescatador cae sobre la jaula → la rompe, rebota y gana monedas.
      const cayendo = { ...blue, x: jaula.x, y: CAGE_Y - 40, vy: 6 };
      const r = tryCageRescue(cayendo, jaula);
      expect(r.rescued).toBe(true);
      expect(r.caged.caged).toBe(false);
      expect(r.caged.onGround).toBe(true);
      expect(r.rescuer.coins).toBe(blue.coins + CAGE_REWARD);
      expect(r.rescuer.vy).toBeLessThan(0); // rebote
      // Si nadie rescata, la jaula se abre sola (anti-encierro).
      const viejo = { ...jaula, cageT: CAGE_AUTOFREE_FRAMES - 1 };
      expect(cageExpired(viejo).caged).toBe(true);
      expect(cageExpired(tickCage(viejo)).caged).toBe(false);
    });

    it("se gana cuando AMBOS llegan a la meta", () => {
      const state = makeLevel("story", 1, createInitialGameState("story").players);
      const far = SCREEN_WIDTH * 2 - 40;
      const a = { ...state.players[0], x: far, y: 400 };
      const b = { ...state.players[1], x: far, y: 400 };
      expect(reachFlag(a, state.tiles) && reachFlag(b, state.tiles)).toBe(true);
    });
  });
