import type { Difficulty } from '@julaika/shared';

const list = (words: string) =>
  words
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

// Listes intégrées (FR) par difficulté : utilisées sans clé DeepSeek, si l'API ne répond pas,
// ou le temps que les premiers mots générés arrivent.
export const WORDS_FR: Record<Difficulty, string[]> = {
  facile: list(`
    abeille, ananas, arbre, avion, baleine, ballon, banane, bateau, bougie, cactus, camion, canard,
    carotte, chapeau, chat, château, chaussette, cheval, chien, ciseaux, citron, clown, couronne,
    crocodile, croissant, dauphin, dinosaure, donut, dragon, drapeau, échelle, éclair, éléphant,
    escargot, étoile, fantôme, fleur, fourchette, frites, fromage, fusée, gâteau, girafe, glace,
    grenouille, guitare, hamburger, hibou, horloge, île, lampe, lapin, licorne, lion, livre, loup,
    lune, lunettes, maison, mangue, marteau, montagne, moto, mouton, nid, nuage, oiseau, ours, panda,
    papillon, parapluie, piano, pieuvre, pingouin, pirate, pizza, plage, poisson, pomme, pont, robot,
    roi, serpent, soleil, tambour, téléphone, tente, tigre, tomate, tortue, train, vache, valise,
    vélo, voiture, yoyo, zèbre
  `),
  moyen: list(`
    arc-en-ciel, astronaute, baguette, baobab, béret, boîte aux lettres, bonhomme de neige, boussole,
    brosse à dents, calebasse, camembert, cerf-volant, chauve-souris, coccinelle, cupcake, djembé,
    escalier, feu d'artifice, girouette, grande roue, hamac, hélicoptère, iceberg, igloo, jardin,
    journal, kangourou, kayak, koala, loupe, machine à laver, manette, méduse, micro, moustache,
    ordinateur, oreiller, parachute, peigne, phare, pinceau, pirogue, pomme de terre, pompier,
    poubelle, pyramide, radio, râteau, renard, requin, sablier, sac à dos, sandwich, sirène,
    skateboard, sorcière, squelette, taupe, toboggan, tour Eiffel, tracteur, trompette, vampire,
    ventilateur, volcan, zombie
  `),
  difficile: list(`
    bâillement, bataille de polochons, boule de cristal, cache-cache, camouflage, canicule, cascadeur,
    cauchemar, château de sable, chatouilles, clair de lune, code-barres, coup de foudre,
    coup de soleil, course en sac, crevaison, décalage horaire, déménagement, dompteur, douane,
    éclipse, embouteillage, épouvantail, éruption, éternuement, évasion, feu de camp, fou rire,
    funambule, griot, harmattan, hibernation, hoquet, inondation, insomnie, jongleur, karaoké,
    mal de mer, marée basse, marionnettiste, métamorphose, migration, mirage, montagnes russes,
    montgolfière, mot de passe, muraille de Chine, naufrage, ombre chinoise, panne de courant,
    passage piéton, pêche à la ligne, poisson d'avril, pyramide humaine, rond-point, saut à l'élastique,
    selfie, somnambule, sous-marin, statue de la Liberté, téléphérique, tir à la corde, tour de magie,
    tourbillon, trampoline, tremblement de terre, ventriloque, verglas, vertige
  `),
};

// Mots à mimer : surtout des actions, des métiers et des animaux qui bougent, qu'on fait
// deviner avec le corps, sans parler ni montrer d'objet écrit.
export const MIME_FR: Record<Difficulty, string[]> = {
  facile: list(`
    applaudir, avoir froid, bâiller, boire, boxer, chanter, chat, cheval, conduire, courir, danser,
    dormir, éternuer, gorille, grenouille, jouer au foot, kangourou, lapin, lire, manger une banane,
    marcher, nager, oiseau, pêcher, pleurer, pompier, poule, rire, sauter à la corde, serpent,
    se brosser les dents, se coiffer, se laver les mains, singe, skier, téléphoner, tirer une corde,
    tomber, voler, éléphant, faire du vélo, jouer au tennis, peindre, se maquiller, taper au clavier
  `),
  moyen: list(`
    astronaute, balayer, boulanger, chauffeur de taxi, chef d'orchestre, chirurgien, coiffeur,
    cow-boy, dentiste, dompteur, faire du surf, faire la vaisselle, faire un gâteau, footballeur,
    gardien de but, guitariste, jardinier, joueur de djembé, jongler, magicien, mécanicien,
    photographe, pianiste, pilote d'avion, plongeur, policier, prendre une douche, repasser,
    robot, sculpteur, serveur, statue, se raser, soldat, surfeur, tricoter, vendeuse au marché,
    zombie, piler le mil, faire un selfie, monter à cheval, ouvrir un cadeau, ramer
  `),
  difficile: list(`
    avoir le hoquet, bataille de polochons, cache-cache, chewing-gum collé, coup de foudre,
    coup de soleil, course en sac, crevaison, déménagement, embouteillage, escalader une montagne,
    être en retard, fou rire, funambule, griot, jour de pluie, mal de mer, marcher sur la lune,
    montagnes russes, panne de courant, passer l'aspirateur, perdre ses clés, piquer une colère,
    rater le bus, saut à l'élastique, somnambule, tir à la corde, tour de magie, trampoline,
    tremblement de terre, ventriloque, marcher sur des braises, prendre un bain de mer,
    se faire piquer par une abeille, attraper une mouche, changer une couche, premier rendez-vous
  `),
};
