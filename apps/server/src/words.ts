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
