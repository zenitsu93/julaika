// Action ou vérité. La bouteille tourne et désigne un joueur ; il choisit « Action » ou
// « Vérité », une carte tombe, il s'exécute en visio et les autres valident (ou le traitent
// de dégonflé). Un joker « je passe » change la carte. Préfixe AOV_ / Aov : les autres jeux
// exportent déjà des noms courts depuis le même index.

/** Niveaux réglés dans le salon. Crescendo commence en Lite et finit en Spicy. */
export const AOV_LEVELS = ['lite', 'complice', 'spicy', 'crescendo'] as const;
export type AovLevel = (typeof AOV_LEVELS)[number];
/** Niveau d'une carte (crescendo n'en est pas un). */
export type AovHeat = Exclude<AovLevel, 'crescendo'>;

export function isAovLevel(v: unknown): v is AovLevel {
  return (AOV_LEVELS as readonly unknown[]).includes(v);
}

export const AOV_LEVEL_INFO: Record<AovLevel, { label: string; icon: string; hint: string }> = {
  lite: { label: 'Lite', icon: '🍬', hint: 'Fun et sans gêne, entre amis.' },
  complice: { label: 'Complice', icon: '💞', hint: 'Tendre et complice, pour les couples et les meilleurs amis.' },
  spicy: { label: 'Spicy', icon: '🌶️', hint: 'Taquin et séducteur : ça chauffe, sans jamais être explicite.' },
  crescendo: { label: 'Crescendo', icon: '🔥', hint: 'On commence Lite, on passe Complice, on finit Spicy.' },
};

export type AovKind = 'action' | 'verite';

export interface AovCard {
  kind: AovKind;
  heat: AovHeat;
  /** Texte prêt à lire : « {nom} » est déjà remplacé par un autre joueur. */
  text: string;
  /** Carte inventée par l'IA pour ce salon. */
  ai: boolean;
}

export interface AovRound {
  playerId: string;
  name: string;
  avatar: number;
  kind: AovKind | null;
  heat: AovHeat;
  text: string | null;
  /** done : validé par les autres ; chicken : jugé dégonflé. */
  outcome: 'done' | 'chicken';
  passes: number;
}

export interface AovState {
  /** Tour en cours, à partir de 1. */
  turn: number;
  turns: number;
  /** Celui qui fait tourner la bouteille (le joueur du tour précédent, l'hôte au début). */
  spinnerId: string | null;
  /** Joueur désigné par la bouteille, connu dès qu'elle tourne. */
  playerId: string | null;
  /** Heure serveur du lancer : la bouteille tourne pendant AOV_SPIN_MS. */
  spinAt: number | null;
  heat: AovHeat;
  choice: AovKind | null;
  card: AovCard | null;
  /** Jokers « je passe » restants, par joueur. */
  jokers: Record<string, number>;
  /** Avis des autres sur la carte en cours : true = validé, false = dégonflé. */
  votes: Record<string, boolean>;
  verdict: 'done' | 'chicken' | null;
  history: AovRound[];
}

/** La bouteille part toute seule si personne ne la lance (s). */
export const AOV_SPIN_WAIT = 8;
/** Durée de la rotation (ms), identique chez tout le monde. */
export const AOV_SPIN_MS = 3600;
/** Temps pour choisir Action ou Vérité (s). */
export const AOV_PICK_TIME = 20;
/** Verdict affiché avant le tour suivant (s). */
export const AOV_VERDICT_TIME = 4;
/** Jokers « je passe » par joueur et par partie. */
export const AOV_JOKERS = 2;
/** Points d'une vérité ou d'une action validée. */
export const AOV_POINTS: Record<AovKind, number> = { verite: 100, action: 150 };
/** Bonus selon le niveau de la carte : oser le piquant rapporte un peu plus. */
export const AOV_HEAT_BONUS: Record<AovHeat, number> = { lite: 0, complice: 25, spicy: 50 };

/** Niveau du tour : fixe, ou montée en température pour crescendo. */
export function aovHeat(level: AovLevel, turn: number, turns: number): AovHeat {
  if (level !== 'crescendo') return level;
  const t = turns > 1 ? (turn - 1) / (turns - 1) : 0;
  return t < 1 / 3 ? 'lite' : t < 2 / 3 ? 'complice' : 'spicy';
}

// Mots entiers, accents compris (\b ne connaît que l'ASCII).
const words = (list: string) => new RegExp(`(?<!\\p{L})(?:${list})(?!\\p{L})`, 'iu');
// Ce qu'aucune carte ne doit contenir, quel que soit le niveau : le Spicy reste suggestif.
const NEVER = words(
  'sexe|sexuel\\p{L}*|nue?s?|nudit[ée]|d[ée]shabill\\p{L}*|sous-v[êe]tements?|culottes?|strings?|soutien-gorges?|seins?|t[ée]tons?|fesses?|orgasm\\p{L}*|porno\\p{L}*|[ée]rotiqu\\p{L}*|l[ée]ch\\p{L}*|alcool|bi[èe]res?|vodka|whisky|ivres?|drogues?|insultes?',
);
// Ce qui n'a pas sa place entre amis en Lite : la séduction commence au niveau Complice.
const ROMANCE = words(
  'bisous?|embrass\\p{L}*|baisers?|c[âa]lins?|caress\\p{L}*|s[ée]dui\\p{L}*|s[ée]duct\\p{L}*|sexy|flirt\\p{L}*|dragu\\p{L}*|amoureu\\p{L}*|crush|rendez-vous|sensuel\\p{L}*|langoureu\\p{L}*|l[èe]vres?',
);
// Et ce qui reste au Spicy.
const SPICY = words('sexy|sensuel\\p{L}*|langoureu\\p{L}*|s[ée]duct\\p{L}*|torride|braise|d[ée]sir\\p{L}*|fantasme\\p{L}*');

/** Vrai si le texte respecte le niveau : rien d'explicite nulle part, rien de romantique en Lite. */
export function aovFits(text: string, heat: AovHeat): boolean {
  if (NEVER.test(text)) return false;
  if (heat === 'lite') return !ROMANCE.test(text);
  if (heat === 'complice') return !SPICY.test(text);
  return true;
}

/** Titres de fin, distribués selon ce que chacun a osé. */
export function aovTitles(history: AovRound[]): { playerId: string; title: string; icon: string }[] {
  const by = new Map<string, { action: number; verite: number; passes: number; chicken: number }>();
  for (const r of history) {
    const s = by.get(r.playerId) ?? { action: 0, verite: 0, passes: 0, chicken: 0 };
    if (r.outcome === 'done' && r.kind) s[r.kind]++;
    if (r.outcome === 'chicken') s.chicken++;
    s.passes += r.passes;
    by.set(r.playerId, s);
  }
  const best = (key: 'action' | 'verite' | 'passes' | 'chicken') => {
    let id: string | null = null;
    let n = 0;
    for (const [pid, s] of by) if (s[key] > n) [id, n] = [pid, s[key]];
    return id;
  };
  const out: { playerId: string; title: string; icon: string }[] = [];
  const add = (id: string | null, title: string, icon: string) => id && !out.some((o) => o.playerId === id) && out.push({ playerId: id, title, icon });
  add(best('action'), 'Tête brûlée', '🔥');
  add(best('verite'), 'Livre ouvert', '📖');
  add(best('passes'), 'Roi du joker', '🃏');
  add(best('chicken'), 'Petit poulet', '🐔');
  return out;
}
