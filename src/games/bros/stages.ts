// Etapas del mundo co-op ("story"). Cada etapa es DATA declarativa: tiles,
// enemigos y una intro que enseña la mecánica. Se diseñan una por una y se
// prueban en el playground (#brosdev). Añadir una etapa acá la suma al mundo.
import {
  GROUND_Y,
  groundSegment,
  platform,
  coin,
  crate,
  flagAtGround,
  registerStoryStages,
  type BrosTile,
  type Enemy,
  type StoryStage,
  SCREEN_WIDTH,
} from "./engine";

const coinRow = (x: number, y: number, n: number, step = 30): BrosTile[] =>
  Array.from({ length: n }, (_, i) => coin(x + i * step, y));

const walker = (id: string, x: number, minX: number, maxX: number, speed = 2): Enemy => ({
  id, x, y: GROUND_Y - 40, w: 28, h: 40, minX, maxX, dir: -1, speed, boss: false,
});

// ---------------------------------------------------------------------------
// ETAPA 1 · "Juntos al inicio" (tutorial co-op)
// Enseña: la placa doble (2P) necesita DOS pesos — y la caja empujable SOLO se
// mueve si los dos empujan juntos. Además: enemigos, un hueco, plataformas y
// monedas para que haya acción. Después: palanca que uno mantiene para el otro.
// ---------------------------------------------------------------------------
function etapa1(): StoryStage {
  const width = SCREEN_WIDTH * 4; // 3200px, cuatro pantallas
  const tiles: BrosTile[] = [
    // Suelo por tramos: 3 huecos de distinta dificultad a lo largo del nivel.
    ...groundSegment(0, 810),
    ...groundSegment(880, 1560),
    ...groundSegment(1700, 2420),
    ...groundSegment(2560, width),
  ];

  // --- Seccion 1 (0-800): calentamiento. Enemigos + plataformas con premio.
  tiles.push(platform(230, GROUND_Y - 120, 110));
  tiles.push(...coinRow(255, GROUND_Y - 165, 3));
  tiles.push(platform(600, GROUND_Y - 135, 100));
  tiles.push(...coinRow(622, GROUND_Y - 180, 3));

  // --- Seccion 2 (880-1560): puzzle de la caja + reja.
  tiles.push(crate(1120, GROUND_Y - 36));
  tiles.push({ type: "plate", x: 1290, y: GROUND_Y - 12, w: 90, h: 12, pair: 1, both: true });
  tiles.push({ type: "gate", x: 1470, y: 240, w: 16, h: GROUND_Y - 240, pair: 1 });

  // --- Seccion 3 (1700-2420): escalada vertical hacia monedas premium
  // (arriesgado, hay un volador guardia), abajo es seguro. Doble reja al final.
  tiles.push(platform(1750, GROUND_Y - 100, 90));
  tiles.push(platform(1900, GROUND_Y - 200, 90));
  tiles.push(platform(2060, GROUND_Y - 300, 90));
  tiles.push(platform(2220, GROUND_Y - 200, 90));
  tiles.push(...coinRow(2085, GROUND_Y - 345, 4)); // premio arriba
  tiles.push({ type: "plate", x: 2320, y: GROUND_Y - 12, w: 56, h: 12, pair: 2 });
  tiles.push({ type: "gate", x: 2380, y: 240, w: 16, h: GROUND_Y - 240, pair: 2 });
  tiles.push({ type: "plate", x: 2450, y: GROUND_Y - 12, w: 56, h: 12, pair: 2 });

  // --- Seccion 4 (2560-3200): escalera con monedas de premio y meta.
  tiles.push(platform(2650, GROUND_Y - 110, 100));
  tiles.push(platform(2810, GROUND_Y - 190, 100));
  tiles.push(platform(2970, GROUND_Y - 270, 100));
  tiles.push(...coinRow(2675, GROUND_Y - 155, 3));
  tiles.push(...coinRow(2835, GROUND_Y - 235, 3));
  tiles.push(...coinRow(2995, GROUND_Y - 315, 4)); // corona de monedas arriba
  tiles.push(platform(3080, GROUND_Y - 180, 80)); // bajada hacia la meta

  tiles.push(...coinRow(180, GROUND_Y - 60, 3));
  tiles.push(...coinRow(900, GROUND_Y - 60, 3));
  tiles.push(...coinRow(1720, GROUND_Y - 60, 3));
  tiles.push(...coinRow(2600, GROUND_Y - 60, 3));
  tiles.push(flagAtGround(width - 60));

  const enemies: Enemy[] = [
    // Seccion 1: calentamiento, dos caminantes.
    { id: "e1", x: 300, y: GROUND_Y - 36, w: 26, h: 36, minX: 200, maxX: 410, dir: 1, speed: 1.8 },
    { id: "e2", x: 520, y: GROUND_Y - 36, w: 26, h: 36, minX: 460, maxX: 780, dir: -1, speed: 2 },
    // Hueco 1: volador que patrulla el salto.
    { id: "f1", x: 760, y: 300, w: 24, h: 24, minX: 700, maxX: 900, dir: 1, speed: 2.2, flyer: true, baseY: 300, phase: 0 },
    // Seccion 2: guardia de la caja.
    { id: "e3", x: 1180, y: GROUND_Y - 36, w: 26, h: 36, minX: 1080, maxX: 1400, dir: 1, speed: 2.2 },
    // Hueco 2: dos voladores en alturas distintas.
    { id: "f2", x: 1580, y: 330, w: 24, h: 24, minX: 1520, maxX: 1700, dir: 1, speed: 2.4, flyer: true, baseY: 330, phase: 0 },
    { id: "f3", x: 1640, y: 260, w: 24, h: 24, minX: 1520, maxX: 1700, dir: -1, speed: 2, flyer: true, baseY: 260, phase: 2 },
    // Seccion 3: volador guardia de las monedas premium + caminante abajo.
    { id: "f4", x: 2100, y: GROUND_Y - 260, w: 24, h: 24, minX: 1980, maxX: 2260, dir: 1, speed: 2.6, flyer: true, baseY: GROUND_Y - 260, phase: 0 },
    { id: "e4", x: 2300, y: GROUND_Y - 36, w: 26, h: 36, minX: 2220, maxX: 2400, dir: -1, speed: 2.2 },
    // Seccion 4: LADRÓN DE GORROS como jefe final, antes de la meta.
    { id: "t1", x: 2760, y: GROUND_Y - 36, w: 26, h: 36, minX: 2580, maxX: 3040, dir: -1, speed: 2.6, thief: true },
    { id: "e5", x: 2900, y: GROUND_Y - 36, w: 26, h: 36, minX: 2620, maxX: 3060, dir: 1, speed: 2.6 },
  ];

  return {
    id: "juntos",
    name: "Juntos al inicio",
    intro: "4 zonas: calentamiento → CAJA a la placa 2P → escalada con monedas de premio → doble reja (ida y vuelta) → ¡cuidado con el LADRÓN antes de la meta!",
    width,
    tiles,
    enemies,
  };
}

function etapa2(): StoryStage {
  const width = SCREEN_WIDTH * 2 + 400;
  const tiles: BrosTile[] = [];

  // Suelo con dos huecos anchos (imposibles de saltar solo).
  tiles.push(...groundSegment(0, 520));
  tiles.push(...groundSegment(760, 1180));
  tiles.push(...groundSegment(1420, width));

  // Isla intermedia entre los huecos para reordenarse.
  tiles.push(platform(620, GROUND_Y - 60, 110));

  // Repaso co-op: placa simple ANTES de la reja y palanca DESPUÉS. Uno pisa la
  // placa para que el otro cruce; el que cruzó mantiene la palanca para abrir
  // de nuevo y que pase el primero. Sin caja: se usa el peso del compañero.
  tiles.push({ type: "plate", x: 1560, y: GROUND_Y - 12, w: 70, h: 12, pair: 1 });
  tiles.push({ type: "gate", x: 1760, y: 240, w: 16, h: GROUND_Y - 240, pair: 1 });
  tiles.push({ type: "lever", x: 1860, y: GROUND_Y - 22, w: 28, h: 22, pair: 1 });

  tiles.push(...coinRow(220, GROUND_Y - 60, 4));
  tiles.push(...coinRow(880, GROUND_Y - 60, 4));
  tiles.push(platform(1240, GROUND_Y - 140, 130));

  tiles.push(flagAtGround(width - 60));

  return {
    id: "abismo",
    name: "El abismo",
    intro: "Cargá a tu pareja (E o P) y lanzala al otro lado del hueco. Última reja: uno pisa la placa, el otro cruza y lo abre con la palanca.",
    width,
    tiles,
    enemies: [walker("e1", 980, 780, 1160, 1.8)],
  };
}

// El orden de esta lista ES el camino del mundo. Nueva etapa = nuevo elemento.
registerStoryStages([etapa1(), etapa2()]);
