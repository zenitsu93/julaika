// Bras de fer (Guerre des pouces) : deux joueurs face à face, une jauge au milieu. Chacun
// tapote les cibles qui apparaissent chez lui pour pousser la jauge dans le camp de l'autre ;
// crier au micro double la force de chaque coup. Tout est arbitré par le serveur.

/** Une cible à tapoter, placée en fractions de la zone de jeu (0 à 1). */
export interface BrasTarget {
  id: number;
  x: number;
  y: number;
  /** Cible dorée : plus rare, elle pousse deux fois plus. */
  gold: boolean;
}

export interface BrasResult {
  /** Vainqueur du duel, null en cas d'égalité parfaite. */
  winner: string | null;
  /** Jauge plaquée au bout avant la fin du temps. */
  ko: boolean;
  gains: Record<string, number>;
}

export interface BrasState {
  /** Le joueur de gauche pousse la jauge vers +BRAS_LIMIT, celui de droite vers -BRAS_LIMIT. */
  leftId: string;
  rightId: string;
  /** Duel en cours, à partir de 0, sur le nombre total de duels. */
  turn: number;
  turns: number;
  /** Position de la jauge, de -BRAS_LIMIT (camp de gauche) à +BRAS_LIMIT (camp de droite). */
  pos: number;
  /** Cibles de ce joueur (vide pour les spectateurs). */
  targets: BrasTarget[];
  /** Qui crie en ce moment (force doublée). */
  voice: Record<string, boolean>;
  /** Coups portés par chaque duelliste pendant ce duel. */
  hits: Record<string, number>;
  /** Dernier coup : son auteur, sa force et un numéro pour rejouer l'animation. */
  push: { by: string; power: number; seq: number } | null;
  /** Fin de duel (phase verdict), null avant. */
  result: BrasResult | null;
}

/** Durées (s) : face-à-face (3, 2, 1…), duel, verdict. */
export const BRAS_FACEOFF = 4;
export const BRAS_DUEL = 30;
export const BRAS_VERDICT = 6;

/** Bout de la jauge : l'atteindre, c'est gagner avant la fin. */
export const BRAS_LIMIT = 100;
/** Cibles visibles en même temps chez chaque duelliste. */
export const BRAS_TARGETS = 3;
/** Force d'un coup ; dorée, ×2 ; en criant, encore ×2. */
export const BRAS_PUSH = 3;
/** Une cible sur ~8 est dorée. */
export const BRAS_GOLD_CHANCE = 0.12;
/** Écart minimal entre deux coups comptés (ms) : au-delà d'environ 12 coups par seconde, on ignore. */
export const BRAS_MIN_GAP = 80;
/** Un « je crie » reçu reste valable ce temps-là (ms), le client le renouvelle tant qu'il crie. */
export const BRAS_VOICE_TTL = 900;

export function brasPower(gold: boolean, voice: boolean): number {
  return BRAS_PUSH * (gold ? 2 : 1) * (voice ? 2 : 1);
}

/** Points : K.O. = 150 ; aux points, 50 plus l'avance de la jauge ; égalité = 25 chacun. */
export function brasGains(pos: number, ko: boolean): { winner: number; loser: number; tie: number } {
  const lead = Math.min(BRAS_LIMIT, Math.round(Math.abs(pos)));
  return { winner: ko ? 150 : 50 + lead, loser: 0, tie: 25 };
}
