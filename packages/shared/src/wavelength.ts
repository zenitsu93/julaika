// Wavelength : un joueur (le « télépathe ») voit où se cache la cible sur une échelle entre
// deux extrêmes et donne un indice ; les autres placent l'aiguille. Jeu coopératif : un seul
// score d'équipe.

/** L'échelle va de 0 (extrême gauche) à 100 (extrême droite). */
export const DIAL_MAX = 100;

/** Demi-largeurs des zones autour de la cible, de la plus précise à la plus large. */
export const WAVE_BANDS = [
  { half: 3.5, points: 4 },
  { half: 10.5, points: 3 },
  { half: 17.5, points: 2 },
] as const;

export const BEST_POINTS = WAVE_BANDS[0].points;

export function wavePoints(target: number, dial: number): number {
  const d = Math.abs(target - dial);
  return WAVE_BANDS.find((b) => d <= b.half)?.points ?? 0;
}

export function clampDial(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(DIAL_MAX, Math.round(n * 10) / 10)) : null;
}

export interface Spectrum {
  left: string;
  right: string;
}

export interface WaveRound {
  spectrum: Spectrum;
  clue: string;
  target: number;
  dial: number;
  points: number;
}

export interface WaveState {
  psychicId: string | null;
  spectrum: Spectrum | null;
  /** Visible du télépathe seulement, puis de tous à la révélation. */
  target: number | null;
  clue: string | null;
  dial: number;
  /** Dernier joueur à avoir bougé l'aiguille. */
  dialBy: string | null;
  /** Score de l'équipe. */
  score: number;
  /** Tour en cours (à partir de 1) sur le nombre total de tours. */
  turn: number;
  turns: number;
  /** Points du tour, pendant la révélation. */
  points: number | null;
  /** Le télépathe peut changer de carte une fois par tour, avant de donner son indice. */
  canReroll: boolean;
  history: WaveRound[];
}

/** Verdict de fin de partie selon la part des points obtenus. */
export function waveVerdict(score: number, turns: number): { title: string; line: string } {
  const ratio = turns ? score / (turns * BEST_POINTS) : 0;
  if (ratio >= 0.8) return { title: 'Âmes sœurs', line: 'Vous partagez le même cerveau.' };
  if (ratio >= 0.6) return { title: 'Même longueur d’onde', line: 'Vous vous comprenez à demi-mot.' };
  if (ratio >= 0.4) return { title: 'Bonne connexion', line: 'Quelques parasites, mais ça capte.' };
  if (ratio >= 0.2) return { title: 'Friture sur la ligne', line: 'Il va falloir se parler un peu plus.' };
  return { title: 'Hors fréquence', line: 'Deux planètes différentes, et c’est charmant.' };
}
