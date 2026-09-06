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
  const width = SCREEN_WIDTH * 2; // 1600px, dos pantallas
  const tiles: BrosTile[] = [
    ...groundSegment(0, 810),
    ...groundSegment(880, width),
  ];

  // Plataformas con monedas arriba: premio por saltar.
  tiles.push(platform(230, GROUND_Y - 120, 110));
  tiles.push(...coinRow(255, GROUND_Y - 165, 3));
  tiles.push(platform(600, GROUND_Y - 135, 100));
  tiles.push(...coinRow(622, GROUND_Y - 180, 3));
  tiles.push(platform(1240, GROUND_Y - 120, 110));
  tiles.push(...coinRow(1265, GROUND_Y - 165, 3));

  // Seccion A: caja empujable + placa DOBLE (2P) + reja. La caja pesa 1 y vos
  // 1: con la caja sobre la placa la reja se abre y cruzan los dos.
  tiles.push(crate(430, GROUND_Y - 36));
  tiles.push({ type: "plate", x: 560, y: GROUND_Y - 12, w: 90, h: 12, pair: 1, both: true });
  tiles.push({ type: "gate", x: 730, y: 240, w: 16, h: GROUND_Y - 240, pair: 1 });

  // Seccion B: placa a cada lado de la reja (cooperacion ida y vuelta).
  tiles.push({ type: "plate", x: 950, y: GROUND_Y - 12, w: 56, h: 12, pair: 2 });
  tiles.push({ type: "gate", x: 1060, y: 240, w: 16, h: GROUND_Y - 240, pair: 2 });
  tiles.push({ type: "plate", x: 1120, y: GROUND_Y - 12, w: 56, h: 12, pair: 2 });

  tiles.push(...coinRow(180, GROUND_Y - 60, 3));
  tiles.push(...coinRow(880, GROUND_Y - 60, 3));
  tiles.push(...coinRow(1400, GROUND_Y - 60, 3));
  tiles.push(flagAtGround(width - 60));

  const enemies: Enemy[] = [
    { id: "e1", x: 300, y: GROUND_Y - 36, w: 26, h: 36, minX: 200, maxX: 410, dir: 1, speed: 1.8 },
    { id: "f1", x: 760, y: 300, w: 24, h: 24, minX: 700, maxX: 900, dir: 1, speed: 2.2, flyer: true, baseY: 300, phase: 0 },
    { id: "e2", x: 1000, y: GROUND_Y - 36, w: 26, h: 36, minX: 940, maxX: 1110, dir: -1, speed: 2 },
    { id: "e3", x: 1330, y: GROUND_Y - 36, w: 26, h: 36, minX: 1250, maxX: 1470, dir: 1, speed: 2.4 },
  ];

  return {
    id: "juntos",
    name: "Juntos al inicio",
    intro: "Empuja la CAJA hasta la placa 2P (caja + vos = 2 pesos, cruzan los dos). En la 2a reja: uno pisa la placa, el otro cruza y pisa la del otro lado para abrir de nuevo.",
    width,
    tiles,
    enemies,
  };
}
// ---------------------------------------------------------------------------
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
