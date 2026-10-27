// Pitch saboté (Startup Crash) : le jeu invente un produit absurde, le vendeur le présente
// 60 s en visio pendant que les investisseurs lui envoient des diapos absurdes en plein écran
// et des bruitages. Puis chacun dit combien il investit, et on inverse les rôles.

/** Un produit tiré au sort : la marque est fabriquée, le reste vient des listes ci-dessous. */
export interface PitchProduct {
  brand: string;
  what: string;
  twist: string;
  target: string;
  /** Mot à placer coûte que coûte dans le pitch. */
  buzzword: string;
}

/**
 * Genres de diapos, dessinés côté client : crash (courbe qui s'effondre), rocket (croissance
 * délirante), pie (camembert), team (photo d'équipe), quote (avis client), map (expansion),
 * error (écran d'erreur), price (grille tarifaire), roadmap (frise), tiny (texte illisible),
 * emoji (image géante), rival (concurrent).
 */
export const SLIDE_KINDS = ['crash', 'rocket', 'pie', 'team', 'quote', 'map', 'error', 'price', 'roadmap', 'tiny', 'emoji', 'rival'] as const;
export type SlideKind = (typeof SLIDE_KINDS)[number];

export interface PitchSlide {
  kind: SlideKind;
  title: string;
  /** Légende, citation, chiffre… selon le genre. */
  sub: string;
  /** Emoji vedette de la diapo (équipe, image géante, carte). */
  art: string;
}

/** Le paquet de diapos : seul l'index circule. */
export const PITCH_SLIDES: readonly PitchSlide[] = [
  { kind: 'crash', title: 'Notre chiffre d’affaires', sub: 'Depuis qu’on a embauché le stagiaire', art: '📉' },
  { kind: 'crash', title: 'Satisfaction client', sub: 'Mesurée sur un seul client : ma mère', art: '😬' },
  { kind: 'rocket', title: 'Croissance prévue', sub: '+ 9 000 % (si tout le monde dit oui)', art: '🚀' },
  { kind: 'rocket', title: 'Nombre de fans', sub: 'Courbe dessinée à la main, à main levée', art: '📈' },
  { kind: 'pie', title: 'Où va votre argent', sub: '97 % croissants · 3 % produit', art: '🥐' },
  { kind: 'pie', title: 'Notre clientèle', sub: '80 % pigeons · 20 % mamies', art: '🐦' },
  { kind: 'team', title: 'L’équipe fondatrice', sub: 'Notre CTO a quatre pattes', art: '🐶🐱🐹' },
  { kind: 'team', title: 'Le conseil d’administration', sub: 'Réunion tous les jeudis, à la piscine', art: '🦆🦆🦆' },
  { kind: 'quote', title: 'Ils en parlent', sub: '« Je ne comprends toujours pas. » Ma grand-mère', art: '👵' },
  { kind: 'quote', title: 'Avis vérifié', sub: '« Ça a pris feu, mais avec élégance. » Kevin, 34 ans', art: '🔥' },
  { kind: 'map', title: 'Expansion internationale', sub: 'Prochaine étape : la Lune, puis Clermont-Ferrand', art: '🌕' },
  { kind: 'map', title: 'Nos bureaux', sub: 'Un bateau gonflable au milieu du lac', art: '🛶' },
  { kind: 'error', title: 'Diapo introuvable', sub: 'Erreur 404 : business model non trouvé', art: '💾' },
  { kind: 'error', title: 'Mise à jour en cours', sub: 'Ne pas éteindre votre investisseur', art: '⏳' },
  { kind: 'price', title: 'Nos tarifs', sub: '3 poules, ou 12 € par mois', art: '🐔' },
  { kind: 'price', title: 'Offre Premium', sub: 'Pareil, mais en doré', art: '✨' },
  { kind: 'roadmap', title: 'La feuille de route', sub: 'Idée · Sieste · ??? · Profit', art: '🗺️' },
  { kind: 'roadmap', title: 'Planning 2027', sub: 'Janvier : réfléchir · Février à décembre : vacances', art: '🏖️' },
  { kind: 'tiny', title: 'Mentions légales', sub: 'En signant ce pitch, vous nous cédez votre chat, votre canapé et vos samedis matin.', art: '📜' },
  { kind: 'emoji', title: 'Notre prototype', sub: 'Ne pas toucher, il mord', art: '🦞' },
  { kind: 'emoji', title: 'Photo du produit', sub: 'Non contractuelle', art: '🥔' },
  { kind: 'emoji', title: 'Notre mascotte', sub: 'Elle s’appelle Gérard', art: '🦙' },
  { kind: 'rival', title: 'La concurrence', sub: 'Eux : un vrai produit · Nous : de la passion', art: '🥊' },
  { kind: 'rival', title: 'Pourquoi nous ?', sub: 'Eux : des clients · Nous : un rêve', art: '🤷' },
];

/** Ce que vend le jeu : une chose, une particularité, une cible. */
export const PITCH_WHAT = [
  'Un grille-pain connecté',
  'Des chaussettes GPS',
  'Un parapluie à l’envers',
  'Une brosse à dents musicale',
  'Un oreiller qui juge',
  'Des lunettes pour poissons',
  'Un frigo qui fait la conversation',
  'Une trottinette pour escargots',
  'Un réveil qui se cache',
  'Une fourchette à soupe',
  'Un abonnement à de l’air pur',
  'Des lacets intelligents',
  'Un casque anti-lundi',
  'Une application pour parler aux plantes',
  'Un aspirateur à mauvaises idées',
  'Des pantoufles à réaction',
  'Un miroir qui ment',
  'Une bougie qui sent le wifi',
  'Un chapeau climatisé',
  'Une cuillère qui refroidit les nouilles',
] as const;

export const PITCH_TWIST = [
  'qui chante quand on le touche',
  'alimenté par les compliments',
  'qui marche uniquement le mardi',
  'livré par pigeon voyageur',
  'en option : des paillettes',
  'qui fait aussi raclette',
  'vendu en pièces détachées',
  'qui s’autodétruit après usage',
  'avec un abonnement obligatoire',
  'certifié par aucun expert',
  'qui parle uniquement en alexandrins',
  'qui pèse 40 kg',
  'contrôlé par la pensée (presque)',
  'qui sent le fromage',
  'disponible en une seule taille : XXL',
] as const;

export const PITCH_TARGET = [
  'pour les chats stressés',
  'pour les mamies influenceuses',
  'pour les pirates à la retraite',
  'pour les vampires du matin',
  'pour les licornes en reconversion',
  'pour les profs de yoga pressés',
  'pour les gens qui détestent les gens',
  'pour les astronautes en vacances',
  'pour les pigeons des villes',
  'pour les champions de sieste',
  'pour les dinosaures',
  'pour ton ex',
] as const;

export const PITCH_BUZZWORDS = [
  'blockchain',
  'intelligence artificielle',
  'disruptif',
  'éco-responsable',
  'synergie',
  'métavers',
  'bio',
  'licorne',
  'quantique',
  'artisanal',
  'premium',
  'game changer',
] as const;

const BRAND_START = ['Zou', 'Kro', 'Plou', 'Miam', 'Tchou', 'Glou', 'Bzz', 'Pouf', 'Flip', 'Snak', 'Wiz', 'Gna'] as const;
const BRAND_END = ['ly', 'ify', 'o', 'ia', 'eo', 'zz', 'tech', 'lab', 'oo', 'ka'] as const;

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

export function makeProduct(random: () => number): PitchProduct {
  return {
    brand: pick(BRAND_START, random) + pick(BRAND_END, random),
    what: pick(PITCH_WHAT, random),
    twist: pick(PITCH_TWIST, random),
    target: pick(PITCH_TARGET, random),
    buzzword: pick(PITCH_BUZZWORDS, random),
  };
}

/** Offres des investisseurs, de 1 à 5 : ce qu'ils mettent sur la table (en euros). */
export const PITCH_OFFERS = [
  { label: 'Pas un centime', amount: 0 },
  { label: '10 000 €', amount: 10_000 },
  { label: '100 000 €', amount: 100_000 },
  { label: '1 million', amount: 1_000_000 },
  { label: 'Je mets tout !', amount: 10_000_000 },
] as const;

/** Durées (s) : découverte du produit, pitch, offres, verdict. */
export const PITCH_BRIEF = 10;
export const PITCH_TIME = 60;
export const PITCH_RATE = 20;
export const PITCH_VERDICT = 7;
/** Le vendeur peut conclure avant la fin, mais pas avant ce délai (s). */
export const PITCH_MIN_TALK = 15;
/** Délai entre deux diapos d'un même investisseur, contre le mitraillage (ms). */
export const PITCH_SLIDE_COOLDOWN = 4000;
/** Points du vendeur : la note moyenne (1 à 5) fois ce facteur ; « financé » à partir de 3 de moyenne. */
export const PITCH_POINTS = 100;
export const PITCH_FUNDED = 3;
/** Les investisseurs marquent aussi un peu par diapo envoyée, plafonné pour ne pas mitrailler. */
export const PITCH_SLIDE_POINTS = 10;
export const PITCH_MAX_SLIDE_POINTS = 60;

export interface PitchResult {
  /** Note moyenne (1 à 5), 0 si personne n'a noté. */
  avg: number;
  /** Somme des offres, en euros. */
  raised: number;
  /** Note de chaque investisseur (absente s'il n'a pas répondu). */
  ratings: Record<string, number>;
  gains: Record<string, number>;
}

export interface PitchState {
  pitcherId: string;
  /** Pitch en cours, à partir de 0, sur le nombre total de pitchs. */
  turn: number;
  turns: number;
  product: PitchProduct;
  /** Le vendeur a-t-il déjà changé de produit ce tour-ci ? */
  rerolled: boolean;
  /** Dernière diapo envoyée ; `n` grandit à chaque envoi pour rejouer l'animation. */
  slide: { index: number; by: string; n: number } | null;
  /** Diapos envoyées par investisseur ce tour-ci. */
  sent: Record<string, number>;
  /** Investisseurs qui ont déjà fait leur offre (sans la valeur avant le verdict). */
  rated: string[];
  result: PitchResult | null;
}

export function pitchGains(stars: number[], sent: Record<string, number>, pitcherId: string): Record<string, number> {
  const avg = stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0;
  const gains: Record<string, number> = { [pitcherId]: Math.round(avg * PITCH_POINTS) };
  for (const [id, n] of Object.entries(sent)) if (id !== pitcherId) gains[id] = Math.min(PITCH_MAX_SLIDE_POINTS, n * PITCH_SLIDE_POINTS);
  return gains;
}
