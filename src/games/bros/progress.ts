// Progreso del mundo co-op (modo historia): cuántas etapas van desbloqueadas.
// Se guarda en localStorage bajo una sola clave; arranca con la etapa 1
// desbloqueada y avanza al superar cada nivel.
const KEY = "bros-world-progress";

export const getWorldProgress = (): number => {
  try {
    const n = parseInt(localStorage.getItem(KEY) ?? "1", 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  } catch {
    return 1;
  }
};

export const setWorldProgress = (count: number): void => {
  try {
    localStorage.setItem(KEY, String(Math.max(1, count)));
    window.dispatchEvent(new Event("bros-world-progress"));
  } catch {
    /* noop */
  }
};

export const resetWorldProgress = (): void => setWorldProgress(1);

// Etapas desbloqueadas (no pasa del total de etapas del mundo).
export const unlockedStages = (total: number): number =>
  Math.min(total, Math.max(1, getWorldProgress()));