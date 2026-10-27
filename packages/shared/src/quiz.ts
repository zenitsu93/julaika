// Quiz de culture générale : l'hôte écrit un ou plusieurs thèmes, l'IA écrit les questions.
// Chaque question laisse quelques secondes de lecture, puis quatre réponses : on verrouille
// la sienne, et plus on est rapide, plus on marque. Les bonnes réponses à la suite font une série.

/** Une question telle que le serveur la garde (la réponse et l'anecdote restent chez lui jusqu'à la révélation). */
export interface QuizQuestion {
  theme: string;
  text: string;
  options: string[];
  answer: number;
  /** Une phrase qui explique la réponse, montrée à la révélation (peut être vide). */
  explain: string;
}

export interface QuizReveal {
  answer: number;
  explain: string;
  /** Choix de chacun, dévoilés ensemble. */
  picks: Record<string, number>;
  gains: Record<string, number>;
  /** Série de bonnes réponses de chacun après cette question. */
  streaks: Record<string, number>;
  /** Le plus rapide à avoir trouvé, s'il y en a un. */
  fastest: string | null;
}

export interface QuizRound {
  theme: string;
  text: string;
  answer: string;
  right: number;
  total: number;
}

export interface QuizState {
  /** Les thèmes de la partie, tels que l'hôte les a écrits. */
  themes: string[];
  /** D'où viennent les questions : l'IA, ou la réserve intégrée si elle n'a pas répondu. */
  source: 'ia' | 'reserve' | null;
  /** Question en cours, à partir de 1 (0 pendant la préparation). */
  index: number;
  total: number;
  question: { theme: string; text: string; options: string[] } | null;
  /** Timestamp serveur où les réponses s'ouvrent, après le temps de lecture. */
  openAt: number | null;
  /** Joueurs qui ont verrouillé une réponse (sans dire laquelle avant la révélation). */
  answered: string[];
  /** Ta propre réponse, à toi seul. */
  mine: number | null;
  streaks: Record<string, number>;
  reveal: QuizReveal | null;
  history: QuizRound[];
}

/** Lecture de la question avant que les réponses s'ouvrent (ms). */
export const QUIZ_READ_MS = 3500;
/** Temps pour répondre, puis temps laissé à la révélation (s). */
export const QUIZ_ANSWER_TIME = 20;
export const QUIZ_REVEAL_TIME = 8;
/** Préparation minimale : le temps de voir la machine à questions tourner (ms). */
export const QUIZ_PREP_MIN_MS = 2600;
/** Une bonne réponse vaut entre la moitié et le tout selon la vitesse, plus un bonus de série. */
export const QUIZ_MAX_POINTS = 1000;
export const QUIZ_STREAK_BONUS = 100;
export const QUIZ_STREAK_CAP = 300;
export const QUIZ_THEME_MAX = 80;
export const QUIZ_MAX_THEMES = 4;
export const QUIZ_DEFAULT_THEME = 'Culture générale';

/** Idées de thèmes proposées sous le champ, d'un clic. */
export const QUIZ_SUGGESTIONS = [
  'Culture générale',
  'Afrique',
  'Cinéma',
  'Football',
  'Histoire de France',
  'Musique des années 2000',
  'Espace',
  'Mangas et animés',
  'Cuisine du monde',
  'Géographie',
  'Sciences',
  'Séries télé',
];

/** Points d'une bonne réponse : 1000 si l'on répond dès l'ouverture, 500 à la dernière seconde. */
export function quizPoints(elapsedMs: number, streak: number): number {
  const ratio = Math.min(1, Math.max(0, elapsedMs / (QUIZ_ANSWER_TIME * 1000)));
  const speed = Math.round((QUIZ_MAX_POINTS * (1 - ratio / 2)) / 10) * 10;
  return speed + Math.min(QUIZ_STREAK_CAP, Math.max(0, streak - 1) * QUIZ_STREAK_BONUS);
}

/** Découpe ce qu'a écrit l'hôte en thèmes (virgules, points-virgules ou barres), sans doublon. */
export function parseQuizThemes(input: string): string[] {
  const seen = new Set<string>();
  const themes: string[] = [];
  for (const raw of String(input ?? '').split(/[,;/|\n]+/)) {
    const theme = raw.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = theme.toLowerCase();
    if (!theme || seen.has(key)) continue;
    seen.add(key);
    themes.push(theme);
    if (themes.length >= QUIZ_MAX_THEMES) break;
  }
  return themes.length ? themes : [QUIZ_DEFAULT_THEME];
}

/** Titre de fin selon la part de bonnes réponses du groupe. */
export function quizVerdict(right: number, total: number): { title: string; line: string } {
  const r = total ? right / total : 0;
  if (r >= 0.8) return { title: 'Encyclopédies vivantes', line: 'On devrait vous inscrire à « Questions pour un champion ».' };
  if (r >= 0.6) return { title: 'Têtes bien pleines', line: 'Solide ! Il ne manquait presque rien.' };
  if (r >= 0.4) return { title: 'Curieux de tout', line: 'De beaux réflexes, et quelques révisions à faire.' };
  if (r >= 0.2) return { title: 'Apprentis savants', line: 'Au moins, vous avez appris plein de choses ce soir.' };
  return { title: 'Champions du hasard', line: 'Un thème plus facile pour la revanche ?' };
}
