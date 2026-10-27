// Qui me connaît le mieux ? À chaque tour, un joueur est la vedette : une question sur lui,
// quatre réponses possibles. Il répond en secret pendant que les autres parient sur sa
// réponse, tous en même temps, puis tout se dévoile d'un coup.

export interface ConnaitQuestion {
  /** Le sujet, tourné pour se lire aussi bien par la vedette (« sur toi ») que par les autres. */
  topic: string;
  options: string[];
}

export interface ConnaitRound {
  starId: string;
  name: string;
  avatar: number;
  topic: string;
  /** Réponse de la vedette, null si elle n'a pas répondu à temps. */
  answer: string | null;
  /** Parieurs qui ont vu juste, sur le nombre de parieurs. */
  right: number;
  total: number;
}

export interface ConnaitReveal {
  answer: number | null;
  /** Choix de chaque joueur (la vedette comprise), dévoilés ensemble. */
  picks: Record<string, number>;
  gains: Record<string, number>;
}

export interface ConnaitState {
  /** Tour en cours, à partir de 1. */
  turn: number;
  turns: number;
  starId: string | null;
  question: ConnaitQuestion | null;
  /** Joueurs qui ont répondu ou parié (sans dire quoi avant la révélation). */
  answered: string[];
  /** Ton propre choix, à toi seul. */
  mine: number | null;
  /** La vedette peut changer de question une fois par tour, tant qu'elle n'a pas répondu. */
  canReroll: boolean;
  reveal: ConnaitReveal | null;
  history: ConnaitRound[];
}

/** Temps pour répondre et parier, puis temps laissé à la révélation (s). */
export const CONNAIT_ANSWER_TIME = 30;
export const CONNAIT_REVEAL_TIME = 8;
/** Points d'un pari juste, et points de la vedette par parieur qui la connaît. */
export const CONNAIT_GUESS_POINTS = 100;
export const CONNAIT_STAR_POINTS = 50;

/** Titre de fin selon la part de paris justes de toute la partie. */
export function connaitVerdict(right: number, total: number): { title: string; line: string } {
  const r = total ? right / total : 0;
  if (r >= 0.8) return { title: 'Âmes sœurs', line: 'Vous vous connaissez par cœur, c’en est presque gênant.' };
  if (r >= 0.6) return { title: 'Inséparables', line: 'Quelques surprises, mais vous lisez bien les uns dans les autres.' };
  if (r >= 0.4) return { title: 'Bons copains', line: 'Il reste des mystères à percer… à la prochaine soirée !' };
  if (r >= 0.2) return { title: 'Presque inconnus', line: 'Une bonne excuse pour passer plus de temps ensemble.' };
  return { title: 'Parfaits étrangers', line: 'Enchantés ! On recommence pour faire connaissance ?' };
}

export const CONNAIT_QUESTIONS: ConnaitQuestion[] = [
  { topic: 'Le plat préféré', options: ['Pizza', 'Sushis', 'Un bon plat de maman', 'Burger frites'] },
  { topic: 'Le petit-déjeuner idéal', options: ['Croissant et café', 'Rien du tout', 'Pancakes', 'Salé : œufs, avocat'] },
  { topic: 'Un samedi soir parfait', options: ['Soirée canapé et série', 'Dîner entre amis', 'Danser jusqu’au bout de la nuit', 'Jeux de société'] },
  { topic: 'Le super-pouvoir rêvé', options: ['Voler', 'Se téléporter', 'Lire dans les pensées', 'Arrêter le temps'] },
  { topic: 'En vacances, plutôt…', options: ['Plage et farniente', 'Montagne et rando', 'Ville et musées', 'Road trip à l’aventure'] },
  { topic: 'Ce qui fait le plus sourire', options: ['Un message d’un proche', 'Une vidéo d’animaux', 'Un compliment', 'Un bon repas'] },
  { topic: 'Le défaut assumé', options: ['Toujours en retard', 'Têtu·e', 'Gourmand·e', 'Un peu bavard·e'] },
  { topic: 'L’animal totem', options: ['Un chat', 'Un chien', 'Une loutre', 'Un hibou'] },
  { topic: 'La boisson réconfort', options: ['Chocolat chaud', 'Thé', 'Café', 'Jus de fruits'] },
  { topic: 'Devant un film d’horreur', options: ['Regarde sans ciller', 'Se cache sous la couverture', 'Refuse de le voir', 'Rigole aux moments flippants'] },
  { topic: 'Le réveil du matin', options: ['Debout au premier son', 'Cinq fois « encore 5 minutes »', 'Réveillé·e avant le réveil', 'Grognon·ne jusqu’au café'] },
  { topic: 'Le talent caché', options: ['Cuisiner', 'Chanter', 'Imiter les gens', 'Dessiner'] },
  { topic: 'La saison préférée', options: ['Printemps', 'Été', 'Automne', 'Hiver'] },
  { topic: 'Avec 1 000 € tombés du ciel', options: ['Un voyage', 'Shopping', 'Tout de côté', 'Un gros resto pour tout le monde'] },
  { topic: 'La musique sous la douche', options: ['Les grands tubes à fond', 'Du rap', 'Une chanson d’amour', 'Silence total'] },
  { topic: 'Le dessert de rêve', options: ['Fondant au chocolat', 'Tiramisu', 'Glace', 'Tarte aux fruits'] },
  { topic: 'En soirée, plutôt…', options: ['Au milieu de la piste', 'Près du buffet', 'En grande discussion dans un coin', 'Déjà parti·e dormir'] },
  { topic: 'La plus grande peur', options: ['Les araignées', 'Le vide', 'Parler en public', 'Le noir'] },
  { topic: 'Le rendez-vous idéal', options: ['Pique-nique au soleil', 'Restaurant chic', 'Balade de nuit', 'Cinéma puis glace'] },
  { topic: 'Le premier réflexe quand ça va mal', options: ['Appeler quelqu’un', 'Manger un truc bon', 'Dormir', 'Faire du sport'] },
  { topic: 'Le métier rêvé enfant', options: ['Docteur', 'Star de la chanson', 'Astronaute', 'Maître·sse d’école'] },
  { topic: 'L’appli la plus ouverte', options: ['WhatsApp', 'TikTok', 'Instagram', 'YouTube'] },
  { topic: 'La façon de dire « je t’aime »', options: ['Des mots doux', 'Des petits cadeaux', 'Du temps passé ensemble', 'Des câlins'] },
  { topic: 'Le vrai luxe', options: ['Faire la grasse matinée', 'Un massage', 'Un bon resto', 'Un week-end sans téléphone'] },
  { topic: 'Le pire supplice', options: ['Attendre', 'Avoir faim', 'Avoir froid', 'S’ennuyer'] },
  { topic: 'La valise de voyage', options: ['Bouclée la veille, rangée au carré', 'Faite au dernier moment', 'Beaucoup trop lourde', 'Un simple sac à dos'] },
  { topic: 'Le compliment qui touche le plus', options: ['« Tu es drôle »', '« Tu es belle / beau »', '« Tu es intelligent·e »', '« Tu es gentil·le »'] },
  { topic: 'Le genre de film préféré', options: ['Comédie', 'Romance', 'Action', 'Thriller'] },
  { topic: 'Le plat de fête idéal', options: ['Une raclette', 'Un couscous', 'Une paëlla', 'Un plateau de fruits de mer'] },
  { topic: 'Le moment préféré de la journée', options: ['Le matin', 'La pause déjeuner', 'Le coucher du soleil', 'Tard dans la nuit'] },
  { topic: 'Face à une dispute', options: ['Crève l’abcès tout de suite', 'Boude un peu', 'Fait une blague pour détendre', 'Laisse passer la nuit'] },
  { topic: 'Le cadeau qui fait craquer', options: ['Des fleurs', 'Une sortie surprise', 'Un objet fait main', 'Un bon livre'] },
  { topic: 'Le sport, c’est…', options: ['Tous les jours', 'Quand l’envie vient', 'À la télé seulement', 'Danser compte ?'] },
  { topic: 'Le téléphone, en ce moment', options: ['Plein à craquer de photos', 'Batterie à 3 %', 'Écran fissuré', 'Toujours en silencieux'] },
  { topic: 'La couleur préférée', options: ['Bleu', 'Rose', 'Noir', 'Vert'] },
  { topic: 'Le fou rire assuré', options: ['Quelqu’un qui tombe', 'Une blague nulle', 'Un souvenir entre amis', 'Ses propres blagues'] },
  { topic: 'Le style au restaurant', options: ['Prend toujours la même chose', 'Goûte le plat de tout le monde', 'Met 20 minutes à choisir', 'Choisit au hasard'] },
  { topic: 'Le voyage de rêve', options: ['Le Japon', 'Les Maldives', 'New York', 'Le tour de l’Afrique'] },
  { topic: 'Le dimanche matin', options: ['Grasse mat’', 'Marché et croissants', 'Sport', 'Ménage en musique'] },
  { topic: 'La chose jamais prêtée', options: ['Ses vêtements', 'Son chargeur', 'Sa brosse à dents', 'Ses livres'] },
  { topic: 'La plus grande qualité', options: ['Généreux·se', 'Drôle', 'Loyal·e', 'Curieux·se'] },
  { topic: 'Le sourire le plus grand, c’est quand…', options: ['Une surprise', 'Avoir raison', 'L’arrivée du plat', 'Tout le monde réuni'] },
  { topic: 'Le choix impossible : plutôt…', options: ['Chocolat', 'Fromage', 'Chips', 'Bonbons'] },
  { topic: 'Une soirée sans téléphone', options: ['Adore ça', 'Tient une heure', 'Ne tient pas 10 minutes', 'N’a jamais essayé'] },
  { topic: 'La série doudou', options: ['Friends', 'Une série coréenne', 'Un anime', 'Une télé-réalité'] },
  { topic: 'Le surnom idéal', options: ['Le rayon de soleil', 'Le chef', 'La tornade', 'Le doudou'] },
];
