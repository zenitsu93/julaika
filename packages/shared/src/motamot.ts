// Mot à mot : une histoire écrite à plusieurs, un mot chacun, quelques secondes par mot. De temps en
// temps une contrainte tombe sur celui qui joue (« un verbe », « place le mot Mayonnaise »…).
// À la fin, l'histoire est lue à voix haute et chacun vote pour son mot préféré.

/**
 * Contraintes. Celles marquées `jury` ne se vérifient pas toutes seules : les autres joueurs
 * peuvent les recaler jusqu'à la fin de la lecture.
 */
export const STORY_RULES = ['mot', 'lettre', 'long', 'court', 'sansE', 'prenom', 'verbe', 'adjectif', 'animal', 'couleur', 'miam', 'bruit', 'doux'] as const;
export type StoryRuleKind = (typeof STORY_RULES)[number];

export interface StoryRule {
  kind: StoryRuleKind;
  /** Consigne affichée et lue (« Place le mot « Mayonnaise » »). */
  text: string;
  /** Mot imposé ou lettre de départ, selon la contrainte. */
  arg?: string;
  /** Jugée par les autres joueurs plutôt que par le serveur. */
  jury: boolean;
}

export interface StoryWord {
  /** Auteur, null pour l'amorce de l'histoire. */
  by: string | null;
  text: string;
  rule: StoryRule | null;
  /** Contrainte : true respectée, false ratée, null en attente du jury. */
  ok: boolean | null;
  /** Temps écoulé : le serveur a pris ce qui était tapé, ou « euh… ». */
  late: boolean;
  /** Joueurs qui recalent ce mot (contraintes jugées par le jury). */
  vetoes: string[];
}

export interface StoryState {
  /** Histoire en cours (1…stories). */
  story: number;
  stories: number;
  /** Ordre de passage de cette histoire. */
  order: string[];
  /** Joueur qui écrit, null pendant le compte à rebours et la lecture. */
  turn: string | null;
  /** Contrainte du tour en cours. */
  rule: StoryRule | null;
  /** Mots à écrire avant la prochaine contrainte (0 = ce tour-ci). */
  nextRule: number;
  /** L'histoire, amorce comprise. */
  words: StoryWord[];
  /** Mots à écrire dans cette histoire (amorce non comprise), et déjà écrits. */
  length: number;
  written: number;
  /** Lecture : le mot préféré de chaque joueur (index dans `words`). */
  stars: Record<string, number>;
  /** Lecture : joueurs prêts pour l'histoire suivante. */
  ready: string[];
  /** Histoires terminées, pour le recueil de fin. */
  tales: StoryWord[][];
  /** Mots écrits à temps et contraintes réussies, par joueur. */
  placed: Record<string, number>;
  kept: Record<string, number>;
}

/** Temps pour un mot par défaut (s), réglable dans le salon ; sous contrainte, il double. */
export const STORY_TIME = 6;
export const STORY_RULE_FACTOR = 2;
/** Une contrainte tous les N mots. */
export const STORY_EVERY = 6;
/** Longueur d'une histoire : tant de mots par joueur, entre ces bornes. */
export const STORY_PER_PLAYER = 7;
export const STORY_LENGTH: readonly [number, number] = [16, 40];
export const STORY_WORD_MAX = 24;
/** Compte à rebours avant le premier mot (ms). */
export const STORY_COUNTDOWN = 3000;
/** Mot posé par le serveur quand le temps file et que rien n'est tapé. */
export const STORY_FILLER = 'euh…';

/** Points : un mot écrit à temps, une contrainte tenue, chaque étoile reçue. */
export const STORY_POINTS = { word: 1, rule: 3, star: 2 } as const;

/** Un seul mot : lettres, chiffres, apostrophes et traits d'union, ponctuation collée au bout. */
const WORD_RE = /^[\p{L}\p{N}][\p{L}\p{N}'’-]*[.,!?…;:]{0,3}$/u;

/** Premier mot de la saisie, nettoyé ; null s'il ne ressemble pas à un mot. */
export function cleanStoryWord(raw: string): string | null {
  const first = String(raw ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .split(/\s+/)[0]!
    .replace(/\.\.\.$/, '…')
    .slice(0, STORY_WORD_MAX);
  return WORD_RE.test(first) ? first : null;
}

/** Ponctuation dite à voix haute, de la plus longue à la plus courte. */
const SPOKEN_PUNCT: [RegExp, string][] = [
  [/\bpoints? d['’ ]?exclamation\b/gi, '!'],
  [/\bpoints? d['’ ]?interrogation\b/gi, '?'],
  [/\bpoints? de suspension\b/gi, '…'],
  [/\bvirgule\b/gi, ','],
  [/\bpoint\b/gi, '.'],
];

/**
 * Ce que la reconnaissance vocale a entendu, ramené à un mot de l'histoire : « chat virgule »
 * devient « chat, » ; si rien d'autre n'a été dit, « point » reste un mot.
 */
export function storyHeard(transcript: string): string | null {
  let text = String(transcript ?? '').trim();
  const spoken = text;
  for (const [re, mark] of SPOKEN_PUNCT) text = text.replace(re, mark);
  text = text.replace(/\s+([,.!?…])/g, '$1').trim();
  return cleanStoryWord(text) ?? cleanStoryWord(spoken);
}

/** Le mot sans sa ponctuation, en minuscules et sans accents, pour vérifier les contraintes. */
export function storyCore(word: string): string {
  return word
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Contrainte vérifiable par le serveur : true ou false. Pour celles du jury, null (le mot est
 * accepté d'office, les autres peuvent le recaler).
 */
export function checkStoryRule(rule: StoryRule, word: string, names: string[]): boolean | null {
  const core = storyCore(word);
  const arg = storyCore(rule.arg ?? '');
  switch (rule.kind) {
    case 'mot':
      return core === arg || core === `${arg}s` || core === `${arg}x`;
    case 'lettre':
      return core.startsWith(arg);
    case 'long':
      return core.length >= 9;
    case 'court':
      return core.length > 0 && core.length <= 3;
    case 'sansE':
      return core.length > 0 && !core.includes('e');
    case 'prenom':
      return names.some((n) => storyCore(n) === core);
    default:
      return null;
  }
}

/** L'histoire en une phrase, ponctuation collée, pour l'afficher ou la lire. */
export function storyText(words: StoryWord[]): string {
  return words.map((w) => w.text).join(' ');
}
