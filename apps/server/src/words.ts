// Liste de départ (FR). À enrichir : catégories, difficulté, autres langues.
export const WORDS_FR = `
abeille, avion, baleine, ballon, banane, bateau, bougie, cactus, camion, canard, carotte, chapeau,
chat, château, chaussette, cheval, chien, citron, clown, coccinelle, crocodile, dauphin, dinosaure,
dragon, échelle, éclair, éléphant, escargot, étoile, fantôme, fusée, girafe, glace, guitare,
hamburger, hélicoptère, hibou, horloge, igloo, île, jardin, kangourou, koala, lampe, lapin, licorne,
lion, livre, loup, lune, lunettes, maison, marteau, méduse, montagne, moto, mouton, nuage, oiseau,
ordinateur, oreiller, ours, panda, papillon, parapluie, pieuvre, pingouin, pirate, pizza, plage,
poisson, pomme, pompier, pont, pyramide, râteau, renard, requin, robot, roi, sandwich, serpent,
sirène, soleil, sorcière, squelette, tambour, téléphone, tente, tigre, tomate, tortue, tracteur,
train, trompette, vache, vampire, vélo, volcan, zèbre, arc-en-ciel, boîte aux lettres,
brosse à dents, feu d'artifice, grande roue, machine à laver, pomme de terre, sac à dos,
tour Eiffel, bonhomme de neige, cerf-volant, chauve-souris, ciseaux, couronne, cupcake, donut,
drapeau, escalier, fourchette, frites, gâteau, grenouille, hamac, iceberg, journal, kayak, loupe,
manette, micro, moustache, nid, parachute, peigne, phare, piano, pinceau, poubelle, radio, sablier,
skateboard, taupe, toboggan, valise, ventilateur, yoyo, zombie, astronaute, baguette, béret,
croissant, fromage, camembert, baobab, djembé, pirogue, mangue, ananas, girouette, boussole
`
  .split(',')
  .map((w) => w.trim())
  .filter(Boolean);
