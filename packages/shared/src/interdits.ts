// Mots interdits (façon Taboo) : à chaque tour, un joueur fait deviner des mots à l'oral, en
// visio, sans prononcer le mot ni ses mots interdits. Les autres crient leurs réponses (ou les
// tapent dans la boîte de réponse). À trois et plus, un gardien voit la carte et buzze au moindre écart ;
// à deux, l'oreille du navigateur (reconnaissance vocale) et l'honnêteté font l'arbitre.

import { normalize } from './text';

export interface InterditsCard {
  word: string;
  /** Cinq mots interdits, du plus évident au moins évident : la difficulté en garde 3, 4 ou 5. */
  ban: string[];
}

export type InterditsOutcome = 'found' | 'buzz' | 'skip';

/** Une carte jouée pendant le tour : visible de tous une fois tranchée. */
export interface InterditsPlay {
  word: string;
  ban: string[];
  outcome: InterditsOutcome;
  /** Qui a trouvé (réponse tapée) ou buzzé ; null si c'est le joueur qui fait deviner. */
  by: string | null;
  /** Mot interdit entendu, quand le buzz le précise. */
  heard: string | null;
}

export interface InterditsState {
  explainerId: string;
  /** Gardien du tour (3 joueurs et plus) : il voit la carte et buzze. null à deux. */
  guardId: string | null;
  /** Tour en cours, à partir de 0, sur le nombre total de tours. */
  turn: number;
  turns: number;
  /** Carte en cours : seulement chez celui qui fait deviner et chez le gardien. */
  card: InterditsCard | null;
  /** Numéro de la carte en cours dans le tour (sert de clé d'animation et de garde-fou). */
  cardNo: number;
  played: InterditsPlay[];
  /** Cartes qu'on peut encore passer pendant ce tour. */
  skips: number;
  /** Points du tour, affichés au bilan (phase verdict). */
  gains: Record<string, number> | null;
}

/** Durées (s) : présentation du tour (3, 2, 1) et bilan. Le tour lui-même dure `drawTime`. */
export const INTERDITS_INTRO = 4;
export const INTERDITS_VERDICT = 8;
/** Cartes qu'on peut passer par tour. */
export const INTERDITS_SKIPS = 3;
/** Clics ignorés juste après l'arrivée d'une carte : un double clic ne tranche pas la suivante. */
export const INTERDITS_GRACE_MS = 600;

/**
 * Points. Mot trouvé : 100 pour celui qui fait deviner ; 100 à qui l'a tapé, ou
 * 50 à chaque devineur quand il a été dit à l'oral. Buzz : 50 de moins pour celui qui fait deviner,
 * 50 de plus pour le gardien qui l'a pris.
 */
export const INTERDITS_POINTS = { explain: 100, typed: 100, aloud: 50, buzz: 50 } as const;

/** Nombre de mots interdits affichés selon la difficulté du salon. */
export function banCount(difficulty: string): number {
  return difficulty === 'facile' ? 3 : difficulty === 'difficile' ? 5 : 4;
}

/**
 * Mots (normalisés) entendus dans une phrase qui trahissent la carte : le mot lui-même ou un
 * mot interdit, y compris au pluriel ou avec une terminaison (« chaton » pour « chat » non, mais
 * « chats » oui). Sert à l'arbitre vocal côté client et aux tests.
 */
export function bannedHeard(sentence: string, card: InterditsCard): string | null {
  const said = ` ${normalize(sentence).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `;
  for (const target of [card.word, ...card.ban]) {
    const t = normalize(target).replace(/[^a-z0-9 ]+/g, ' ').trim();
    if (!t) continue;
    if (said.includes(` ${t} `)) return target;
    // Pluriels et accords simples : « pommes », « belles », « chevaux » pour « cheval ».
    const forms = [`${t}s`, `${t}x`, `${t}e`, `${t}es`];
    if (t.endsWith('al')) forms.push(`${t.slice(0, -2)}aux`);
    if (forms.some((f) => said.includes(` ${f} `))) return target;
  }
  return null;
}

/** Les cartes : un mot, cinq mots interdits. Tout public, avec quelques clins d'œil à deux. */
export const INTERDITS_CARDS: InterditsCard[] = [
  { word: 'Plage', ban: ['sable', 'mer', 'vacances', 'soleil', 'serviette'] },
  { word: 'Pizza', ban: ['italie', 'fromage', 'four', 'tomate', 'part'] },
  { word: 'Sourire', ban: ['bouche', 'dents', 'rire', 'heureux', 'lèvres'] },
  { word: 'Chocolat', ban: ['cacao', 'noir', 'lait', 'tablette', 'sucré'] },
  { word: 'Anniversaire', ban: ['gâteau', 'bougies', 'âge', 'cadeau', 'fête'] },
  { word: 'Téléphone', ban: ['appeler', 'portable', 'écran', 'sonner', 'message'] },
  { word: 'Girafe', ban: ['cou', 'long', 'afrique', 'tache', 'grand'] },
  { word: 'Parapluie', ban: ['pluie', 'ouvrir', 'mouillé', 'baleine', 'eau'] },
  { word: 'Baiser', ban: ['bisou', 'lèvres', 'embrasser', 'amoureux', 'joue'] },
  { word: 'Cinéma', ban: ['film', 'écran', 'salle', 'popcorn', 'séance'] },
  { word: 'Dentiste', ban: ['dents', 'carie', 'docteur', 'fraise', 'bouche'] },
  { word: 'Neige', ban: ['blanc', 'hiver', 'froid', 'flocon', 'ski'] },
  { word: 'Café', ban: ['tasse', 'matin', 'noir', 'expresso', 'boire'] },
  { word: 'Valise', ban: ['voyage', 'bagage', 'roulettes', 'vêtements', 'aéroport'] },
  { word: 'Licorne', ban: ['corne', 'cheval', 'magique', 'arc-en-ciel', 'blanc'] },
  { word: 'Miroir', ban: ['reflet', 'glace', 'regarder', 'salle de bain', 'visage'] },
  { word: 'Boulangerie', ban: ['pain', 'baguette', 'croissant', 'farine', 'four'] },
  { word: 'Football', ban: ['ballon', 'but', 'pied', 'match', 'équipe'] },
  { word: 'Volcan', ban: ['lave', 'éruption', 'montagne', 'feu', 'cratère'] },
  { word: 'Pyjama', ban: ['dormir', 'nuit', 'lit', 'vêtement', 'soir'] },
  { word: 'Papillon', ban: ['ailes', 'chenille', 'voler', 'couleurs', 'insecte'] },
  { word: 'Mariage', ban: ['robe', 'bague', 'oui', 'époux', 'église'] },
  { word: 'Bibliothèque', ban: ['livres', 'lire', 'emprunter', 'silence', 'étagère'] },
  { word: 'Pompier', ban: ['feu', 'camion', 'eau', 'incendie', 'sauver'] },
  { word: 'Croissant', ban: ['beurre', 'matin', 'boulangerie', 'viennoiserie', 'lune'] },
  { word: 'Fantôme', ban: ['drap', 'peur', 'mort', 'hanté', 'blanc'] },
  { word: 'Guitare', ban: ['cordes', 'musique', 'jouer', 'instrument', 'électrique'] },
  { word: 'Réveil', ban: ['sonner', 'matin', 'heure', 'dormir', 'lever'] },
  { word: 'Tortue', ban: ['carapace', 'lent', 'animal', 'lièvre', 'mer'] },
  { word: 'Pirate', ban: ['bateau', 'trésor', 'oeil', 'jambe', 'perroquet'] },
  { word: 'Vampire', ban: ['sang', 'dents', 'dracula', 'nuit', 'ail'] },
  { word: 'Fromage', ban: ['lait', 'vache', 'camembert', 'odeur', 'raclette'] },
  { word: 'Arc-en-ciel', ban: ['couleurs', 'pluie', 'soleil', 'ciel', 'sept'] },
  { word: 'Ascenseur', ban: ['étage', 'monter', 'descendre', 'bouton', 'immeuble'] },
  { word: 'Selfie', ban: ['photo', 'téléphone', 'soi', 'bras', 'instagram'] },
  { word: 'Sieste', ban: ['dormir', 'après-midi', 'repos', 'canapé', 'fatigué'] },
  { word: 'Château', ban: ['roi', 'princesse', 'tour', 'fort', 'pierre'] },
  { word: 'Banane', ban: ['jaune', 'fruit', 'singe', 'éplucher', 'peau'] },
  { word: 'Abeille', ban: ['miel', 'piquer', 'ruche', 'insecte', 'fleur'] },
  { word: 'Glace', ban: ['froid', 'cornet', 'vanille', 'été', 'boule'] },
  { word: 'Chaussette', ban: ['pied', 'paire', 'chaussure', 'laine', 'trou'] },
  { word: 'Cupidon', ban: ['flèche', 'amour', 'arc', 'ange', 'saint-valentin'] },
  { word: 'Piscine', ban: ['nager', 'eau', 'maillot', 'plonger', 'bassin'] },
  { word: 'Robot', ban: ['machine', 'métal', 'intelligence', 'bras', 'programme'] },
  { word: 'Escargot', ban: ['coquille', 'lent', 'bave', 'ail', 'limace'] },
  { word: 'Moustache', ban: ['poils', 'lèvre', 'barbe', 'homme', 'visage'] },
  { word: 'Karaoké', ban: ['chanter', 'micro', 'paroles', 'chanson', 'écran'] },
  { word: 'Dinosaure', ban: ['préhistoire', 'disparu', 'fossile', 't-rex', 'géant'] },
  { word: 'Boussole', ban: ['nord', 'aiguille', 'direction', 'perdu', 'aimant'] },
  { word: 'Popcorn', ban: ['maïs', 'cinéma', 'sucré', 'salé', 'éclater'] },
  { word: 'Télécommande', ban: ['télé', 'bouton', 'chaîne', 'canapé', 'piles'] },
  { word: 'Princesse', ban: ['château', 'prince', 'couronne', 'reine', 'conte'] },
  { word: 'Hérisson', ban: ['piquants', 'boule', 'animal', 'forêt', 'sonic'] },
  { word: 'Tatouage', ban: ['encre', 'peau', 'aiguille', 'dessin', 'bras'] },
  { word: 'Raclette', ban: ['fromage', 'fondre', 'pommes de terre', 'hiver', 'appareil'] },
  { word: 'Nuage', ban: ['ciel', 'blanc', 'pluie', 'gris', 'flotter'] },
  { word: 'Ballon', ban: ['rond', 'gonfler', 'jouer', 'foot', 'air'] },
  { word: 'Sorcière', ban: ['balai', 'chapeau', 'magie', 'potion', 'halloween'] },
  { word: 'Camping', ban: ['tente', 'vacances', 'nature', 'feu', 'dormir'] },
  { word: 'Lunettes', ban: ['yeux', 'voir', 'verres', 'nez', 'soleil'] },
  { word: 'Pingouin', ban: ['banquise', 'noir', 'blanc', 'oiseau', 'froid'] },
  { word: 'Coussin', ban: ['oreiller', 'canapé', 'mou', 'tête', 'plumes'] },
  { word: 'Métro', ban: ['train', 'souterrain', 'station', 'paris', 'ticket'] },
  { word: 'Crêpe', ban: ['sucre', 'poêle', 'bretagne', 'pâte', 'chandeleur'] },
  { word: 'Rêve', ban: ['dormir', 'nuit', 'cauchemar', 'songe', 'imaginer'] },
  { word: 'Hamac', ban: ['suspendu', 'arbres', 'balancer', 'repos', 'toile'] },
  { word: 'Moustique', ban: ['piquer', 'bzz', 'insecte', 'été', 'bouton'] },
  { word: 'Cerf-volant', ban: ['vent', 'ficelle', 'voler', 'ciel', 'plage'] },
  { word: 'Clown', ban: ['cirque', 'nez', 'rouge', 'rire', 'perruque'] },
  { word: 'Bougie', ban: ['flamme', 'cire', 'allumer', 'lumière', 'anniversaire'] },
  { word: 'Panda', ban: ['bambou', 'chine', 'noir', 'blanc', 'ours'] },
  { word: 'Trottinette', ban: ['roues', 'guidon', 'pied', 'électrique', 'rouler'] },
  { word: 'Ketchup', ban: ['tomate', 'sauce', 'rouge', 'frites', 'bouteille'] },
  { word: 'Squelette', ban: ['os', 'corps', 'crâne', 'mort', 'halloween'] },
  { word: 'Tour Eiffel', ban: ['paris', 'fer', 'monument', 'france', 'haute'] },
  { word: 'Jumeaux', ban: ['deux', 'frères', 'pareils', 'naissance', 'identiques'] },
  { word: 'Sirène', ban: ['mer', 'queue', 'poisson', 'chanter', 'femme'] },
  { word: 'Chatouilles', ban: ['rire', 'pieds', 'doigts', 'gratter', 'ventre'] },
  { word: 'Barbe à papa', ban: ['sucre', 'rose', 'fête foraine', 'nuage', 'bâton'] },
  { word: 'Fusée', ban: ['espace', 'lune', 'décoller', 'astronaute', 'moteur'] },
  { word: 'Coccinelle', ban: ['rouge', 'points', 'noirs', 'insecte', 'bête à bon dieu'] },
  { word: 'Mime', ban: ['geste', 'silence', 'parler', 'muet', 'théâtre'] },
  { word: 'Ronfler', ban: ['dormir', 'bruit', 'nez', 'nuit', 'ronflement'] },
  { word: 'Cadeau', ban: ['offrir', 'paquet', 'noël', 'emballage', 'surprise'] },
  { word: 'Cactus', ban: ['piquant', 'désert', 'plante', 'épine', 'vert'] },
  { word: 'Escalier', ban: ['marches', 'monter', 'descendre', 'étage', 'rampe'] },
  { word: 'Peluche', ban: ['doudou', 'nounours', 'doux', 'enfant', 'jouet'] },
  { word: 'Tempête', ban: ['vent', 'pluie', 'orage', 'tonnerre', 'éclair'] },
  { word: 'Serveur', ban: ['restaurant', 'plateau', 'commande', 'pourboire', 'café'] },
  { word: 'Huître', ban: ['coquillage', 'perle', 'mer', 'ouvrir', 'citron'] },
  { word: 'Trampoline', ban: ['sauter', 'rebondir', 'jardin', 'toile', 'haut'] },
  { word: 'Boule à facettes', ban: ['disco', 'danser', 'miroir', 'lumière', 'plafond'] },
  { word: 'Rendez-vous', ban: ['rencontre', 'heure', 'amoureux', 'date', 'retard'] },
  { word: 'Lasagnes', ban: ['pâtes', 'italie', 'couches', 'four', 'bolognaise'] },
  { word: 'Taupe', ban: ['terre', 'creuser', 'aveugle', 'jardin', 'trou'] },
  { word: 'Hoquet', ban: ['hic', 'boire', 'peur', 'respirer', 'diaphragme'] },
  { word: 'Ombre', ban: ['soleil', 'lumière', 'noir', 'suivre', 'silhouette'] },
  { word: 'Patins à glace', ban: ['patinoire', 'glisser', 'hiver', 'lame', 'tomber'] },
  { word: 'Magicien', ban: ['tour', 'chapeau', 'lapin', 'baguette', 'carte'] },
  { word: 'Fondue', ban: ['fromage', 'savoie', 'pain', 'caquelon', 'fourchette'] },
  { word: 'Pétanque', ban: ['boules', 'cochonnet', 'pastis', 'sud', 'pointer'] },
];
