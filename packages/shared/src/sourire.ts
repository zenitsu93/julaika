// Pas un sourire ! (Tu ris, tu perds) : à chaque manche, un défenseur garde un visage de marbre
// pendant 30 s ; l'attaquant a les bruitages, des consignes de grimaces et peut déformer sa
// visio. Dès qu'il craque, quelqu'un appuie sur « Il a souri ! ». Puis on inverse les rôles.

/** Bruitages de la boîte à sons, synthétisés côté client : seul l'identifiant circule. */
export const SOUNDS = ['klaxon', 'rires', 'criquets', 'tictac', 'boum', 'pouet', 'badum', 'trombone', 'boing', 'bravo', 'ding', 'sifflet'] as const;
export type SoundId = (typeof SOUNDS)[number];

export function isSoundId(v: unknown): v is SoundId {
  return (SOUNDS as readonly unknown[]).includes(v);
}

/** Déformations de la visio de l'attaquant (appliquées chez lui, avant l'envoi). */
export const WARPS = ['bulle', 'pince', 'tourbillon', 'etire', 'miroir', 'vague'] as const;
export type WarpId = (typeof WARPS)[number];

export function isWarpId(v: unknown): v is WarpId {
  return (WARPS as readonly unknown[]).includes(v);
}

export interface SourireResult {
  /** Le défenseur a-t-il souri avant la fin ? */
  smiled: boolean;
  /** Qui a appuyé sur « Il a souri ! » (le défenseur lui-même s'il avoue). */
  by: string | null;
  /** Secondes tenues sans sourire. */
  held: number;
  gains: Record<string, number>;
}

export interface SourireState {
  defenderId: string;
  attackerId: string;
  /** Duel en cours, à partir de 0, sur le nombre total de duels. */
  turn: number;
  turns: number;
  /** Consigne de grimace : envoyée à l'attaquant seulement (null chez les autres). */
  dare: string | null;
  /** Déformation choisie par l'attaquant, pour l'annoncer aux autres. */
  warp: WarpId | null;
  /** Fin de duel (phase verdict), null avant. */
  result: SourireResult | null;
}

/** Durées (s) : face-à-face (3, 2, 1…), duel, verdict. */
export const SOURIRE_FACEOFF = 4;
export const SOURIRE_DUEL = 30;
export const SOURIRE_VERDICT = 6;

/** Points : le défenseur gagne par seconde tenue ; l'attaquant, s'il le fait craquer, un fixe plus le temps qui restait. */
export const SOURIRE_POINTS = { perSecond: 10, crack: 100 } as const;

export function sourireGains(held: number, smiled: boolean): { defender: number; attacker: number } {
  const s = Math.max(0, Math.min(SOURIRE_DUEL, Math.floor(held)));
  return {
    defender: s * SOURIRE_POINTS.perSecond,
    attacker: smiled ? SOURIRE_POINTS.crack + (SOURIRE_DUEL - s) * SOURIRE_POINTS.perSecond : 0,
  };
}

/** Consignes de grimaces et de pitreries pour l'attaquant. */
export const SOURIRE_DARES = [
  'Fais ta meilleure tête de poisson',
  'Raconte ta journée avec la voix d’un robot',
  'Imite une poule qui a perdu ses clés',
  'Chante le refrain d’une pub, très sérieusement',
  'Fais un clin d’œil… avec les deux yeux',
  'Mime un chat qui voit un concombre',
  'Annonce la météo des bisous',
  'Fais une déclaration d’amour à ta chaussette',
  'Parle comme un présentateur de JT en chuchotant',
  'Fais la danse du ventre avec les sourcils',
  'Imite un dauphin qui fait un discours',
  'Raconte une blague nulle, puis ris tout seul',
  'Mange une banane imaginaire, très lentement',
  'Fais semblant d’éternuer pendant dix secondes',
  'Imite ton prof (ou ton boss) qui découvre TikTok',
  'Fais la tête du dernier selfie de ta tante',
  'Parle uniquement en bruits de bouche',
  'Fais un défilé de mode assis sur ta chaise',
  'Récite l’alphabet comme un opéra dramatique',
  'Imite un pigeon qui drague',
  'Gonfle les joues et fais le poisson-lune',
  'Fais ton plus beau sourire… mais à l’envers',
] as const;
