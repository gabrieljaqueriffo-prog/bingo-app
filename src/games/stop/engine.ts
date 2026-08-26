// Motor puro del Stop (Categorías / Tutti Frutti).
// Sin dependencias de React ni DOM para poder testearlo en aislamiento.

export const CATEGORIES = [
  "Nombre",
  "Animal",
  "Comida",
  "Ciudad o país",
  "Objeto",
  "Famoso/a",
] as const;

// Letras comunes en español (sin K, U, W, X, Y, Z por ser casi imposibles).
export const LETTERS = ["A","B","C","D","E","F","G","H","I","J","L","M","N","O","P","R","S","T","V"] as const;

export type Letter = string;

// Normaliza una palabra para comparar sin depender de mayúsculas ni tildes.
export const normalizeWord = (word: string): string =>
  word
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

// Puntos de UNA categoría para dos jugadores según sus palabras.
// Reglas clásicas: palabra única = 10 · repetida con el rival = 5 · vacía = 0.
export const scoreCategory = (a: string, b: string): [number, number] => {
  const wa = normalizeWord(a);
  const wb = normalizeWord(b);
  if (!wa && !wb) return [0, 0];
  if (!wa || !wb) return wa ? [10, 0] : [0, 10];
  return wa === wb ? [5, 5] : [10, 10];
};

// Puntaje total de una ronda entre dos listas de respuestas.
export const scoreRound = (a: readonly string[], b: readonly string[]): [number, number] => {
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < CATEGORIES.length; i++) {
    const [pa, pb] = scoreCategory(a[i] ?? "", b[i] ?? "");
    s1 += pa;
    s2 += pb;
  }
  return [s1, s2];
};

export const pickLetter = (): Letter => {
  const pool = LETTERS as readonly string[];
  return pool[Math.floor(Math.random() * pool.length)];
};

export const ROUNDS_PER_GAME = 5;
export const SECONDS_PER_ROUND = 120;

// Estado compartido de la partida (vive en el payload de la sala Supabase).
export type StopPhase = "writing" | "review" | "final";

export type RoundResult = {
  round: number;
  letter: Letter;
  s1: number;
  s2: number;
};

export type StopData = {
  phase: StopPhase;
  round: number;                 // 1-based
  letter: Letter;
  deadlineIso: string;           // fin del tiempo de escritura
  entries: [string[] | null, string[] | null]; // lo que escribió cada jugador
  scores: [number, number];      // acumulado total
  history: RoundResult[];
};

export const initialStopData = (): StopData => ({
  phase: "writing",
  round: 1,
  letter: pickLetter(),
  deadlineIso: new Date(Date.now() + SECONDS_PER_ROUND * 1000).toISOString(),
  entries: [null, null],
  scores: [0, 0],
  history: [],
});

// Transición: cuando los DOS entregaron y la ronda aún no fue contabilizada,
// calcula puntos, acumula y pasa a revisión. Si no corresponde, deja todo igual.
export const resolveIfReady = (data: StopData): StopData => {
  if (data.phase !== "writing") return data;
  const [e1, e2] = data.entries;
  if (!e1 || !e2) return data;
  if (data.history.some((h) => h.round === data.round)) return data;

  const [s1, s2] = scoreRound(e1, e2);
  return {
    ...data,
    phase: "review",
    scores: [data.scores[0] + s1, data.scores[1] + s2],
    history: [...data.history, { round: data.round, letter: data.letter, s1, s2 }],
  };
};

// Nueva ronda: letra nueva, entradas vacías, fase de escritura otra vez.
export const nextRound = (data: StopData): StopData => ({
  ...data,
  phase: "writing",
  round: data.round + 1,
  letter: pickLetter(),
  deadlineIso: new Date(Date.now() + SECONDS_PER_ROUND * 1000).toISOString(),
  entries: [null, null],
});
