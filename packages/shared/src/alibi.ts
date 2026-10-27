// L'Alibi : deux complices sont accusés d'une bêtise absurde. Ils ont 30 s pour accorder leur
// version, dans un carnet que seuls eux voient (et la visio coupée pour les autres). Puis les
// pièces à conviction tombent une à une : le jeu désigne qui doit l'intégrer à l'histoire en
// 10 s. Le juge buzze « Contradiction ! » ou « Hésitation ! », et la crédibilité fond.

export const ALIBI_OBJECTIONS = ['contradiction', 'hesitation'] as const;
export type AlibiObjection = (typeof ALIBI_OBJECTIONS)[number];

export function isAlibiObjection(v: unknown): v is AlibiObjection {
  return (ALIBI_OBJECTIONS as readonly unknown[]).includes(v);
}

/** Une ligne du carnet des complices. */
export interface AlibiNote {
  by: string;
  text: string;
}

/** Une pièce à conviction posée sur la table, et ce qu'elle a donné. */
export interface AlibiExhibit {
  item: string;
  /** Complice qui doit l'expliquer. */
  suspectId: string;
  /** Déposition écrite (facultative : on peut tout dire en visio). */
  statement: string | null;
  /** Objection du juge sur cette pièce (une au plus). */
  objection: AlibiObjection | null;
}

export interface AlibiResult {
  acquitted: boolean;
  credibility: number;
  /** Votes du jury (null à trois : pas de jury, la crédibilité tranche). */
  votes: { acquit: number; guilty: number } | null;
  gains: Record<string, number>;
}

export interface AlibiState {
  /** Affaire en cours (à partir de 0) sur le nombre d'affaires. */
  case: number;
  cases: number;
  judgeId: string;
  suspects: [string, string];
  /** Les autres joueurs : le jury, qui vote à la fin. */
  jury: string[];
  accusation: string;
  /** Carnet des complices : visible d'eux seuls, puis de tous au verdict (null sinon). */
  notes: AlibiNote[] | null;
  /** Pièces déjà tombées, la dernière étant celle en cours pendant l'audience. */
  exhibits: AlibiExhibit[];
  /** Nombre de pièces de l'affaire. */
  total: number;
  credibility: number;
  /** Jurés qui ont voté, et ton vote (true = acquitté). */
  voted: string[];
  myVote: boolean | null;
  result: AlibiResult | null;
}

export const ALIBI_MIN_PLAYERS = 3;

/** Durées (s) : concertation, chaque pièce, vote du jury, verdict. */
export const ALIBI_PLOT = 30;
export const ALIBI_EXHIBIT = 10;
export const ALIBI_VOTE = 15;
export const ALIBI_VERDICT = 9;
export const ALIBI_EXHIBITS = 4;

export const ALIBI_NOTE_MAX = 120;
export const ALIBI_NOTES_MAX = 24;
export const ALIBI_STATEMENT_MAX = 140;

/** Ce que coûte chaque objection en crédibilité (sur 100). Sous la moitié, sans jury, c'est la prison. */
export const ALIBI_PENALTY: Record<AlibiObjection, number> = { contradiction: 30, hesitation: 15 };
export const ALIBI_THRESHOLD = 50;

/** Points : chaque complice garde sa crédibilité, plus une prime s'ils s'en sortent ; le juge, s'il les fait tomber ; le juré, s'il vote avec la majorité. */
export const ALIBI_POINTS = { acquitted: 200, convicted: 200, juror: 50 } as const;

/** Bêtises absurdes dont les complices sont accusés. */
export const ALIBI_ACCUSATIONS = [
  'Mardi soir, entre 20 h et 22 h, le chat du voisin a été repeint en rose fluo.',
  'Dimanche, quelqu’un a remplacé toute l’eau de la piscine municipale par du sirop de menthe.',
  'Hier, les 300 nains de jardin du quartier ont été retrouvés alignés en forme de cœur.',
  'Samedi, un mariage a été interrompu par une fanfare… de kazoos.',
  'Cette nuit, la statue de la place du marché portait une perruque et des lunettes de soleil.',
  'Jeudi midi, toutes les baguettes de la boulangerie ont disparu. Il n’en reste que les miettes.',
  'Vendredi, l’ascenseur de l’immeuble ne jouait plus que la Macarena, en boucle.',
  'Lundi matin, la vache du fermier a été retrouvée sur le toit de la mairie.',
  'Mercredi, le GPS de tout le village annonçait « Tournez à gauche… vers l’aventure ».',
  'Dimanche, quelqu’un a tricoté un pull géant autour de la tour de l’église.',
  'Cette nuit, toutes les poubelles de la rue ont été décorées comme des sapins de Noël.',
  'Mardi, le perroquet du dentiste s’est mis à réciter des recettes de cuisine.',
  'Samedi, 4 000 balles de ping-pong ont été lâchées dans le hall de la gare.',
  'Hier, le distributeur de la salle de sport ne servait plus que des éclairs au chocolat.',
  'Jeudi, le panneau de l’autoroute affichait « Bisous à Julaïka » toute la journée.',
  'Ce matin, la fontaine du parc crachait de la mousse au chocolat.',
  'Vendredi soir, quelqu’un a organisé un concours de limbo sous la barrière du péage.',
  'Lundi, la tondeuse du voisin a été retrouvée déguisée en licorne.',
  'Mercredi, toute la bibliothèque a été rangée par couleur, au lieu de l’ordre alphabétique.',
  'Dimanche, le pique-nique de la mairie a été envahi par 60 canards en nœud papillon.',
  'Hier soir, la cloche de l’église a sonné l’air de « Joyeux anniversaire ».',
  'Samedi, la photo officielle du maire a été remplacée par celle d’un hamster.',
  'Cette nuit, quelqu’un a écrit « Je t’aime » avec des frites sur le parking du supermarché.',
  'Mardi, le karaoké du camping a été piraté : il ne passait plus que du chant tyrolien.',
] as const;

/** Pièces à conviction, à intégrer à l'alibi quoi qu'il arrive. */
export const ALIBI_EXHIBITS_LIST = [
  'Une plume de flamant rose',
  'Un ticket de karaoké daté du jour même',
  'Trois kilos de spaghetti crus',
  'Une photo floue de vous deux en costume de pingouin',
  'Un reçu pour 48 rouleaux de papier toilette',
  'Une trace de pas de canard… taille 44',
  'Un pot de peinture rose, à moitié vide',
  'Une perruque blonde encore tiède',
  'Un message vocal de 4 secondes : « C’est fait. »',
  'Un ticket de cinéma pour « Titanic 3 »',
  'Une carte de fidélité de l’animalerie, remplie',
  'Une chaussette orpheline à paillettes',
  'Une facture de location de tracteur',
  'Un plan du quartier annoté au feutre',
  'Un kazoo, mâchouillé',
  'Une boîte de 200 nœuds papillon',
  'Une recette de mousse au chocolat pour 500 personnes',
  'Un témoin : la boulangère vous a vus « courir en riant »',
  'Une échelle de 12 mètres dans votre garage',
  'Un selfie à 21 h 47, sourire jusqu’aux oreilles',
  'Un bon de commande : 4 000 balles de ping-pong',
  'Une pelote de laine géante, entamée',
  'Un post-it : « Ne surtout pas le dire au juge »',
  'Un costume de licorne, taille adulte',
  'Des confettis dans vos chaussures',
  'Un hamster qui vous reconnaît',
  'Une partition de Macarena, version cloches',
  'Une carte au trésor dessinée au dos d’un ticket de caisse',
  'Un gant de jardinage avec vos initiales',
  'Un rapport de police mentionnant « deux individus très souriants »',
  'Une vidéo de surveillance : on y voit un parapluie et beaucoup de paillettes',
  'Un billet de train aller simple pour Trifouilly-les-Oies',
  'Des miettes de baguette dans vos poches',
  'Un manuel « Le tricot pour les nuls », très annoté',
  'Une note de restaurant : 14 desserts, 0 plat',
  'Un témoin : le facteur jure vous avoir entendu chanter faux',
] as const;

/**
 * Bilan d'une affaire. Sans jury, la crédibilité tranche ; avec, la majorité des votes exprimés
 * (égalité : le doute profite aux accusés ; personne n'a voté : la crédibilité tranche).
 */
export function alibiVerdict(credibility: number, votes: { acquit: number; guilty: number } | null): boolean {
  if (!votes || votes.acquit + votes.guilty === 0) return credibility >= ALIBI_THRESHOLD;
  return votes.acquit >= votes.guilty;
}
