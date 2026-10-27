import type { QuizQuestion } from '@julaika/shared';

// Réserve du quiz, quand l'IA ne répond pas (pas de clé, quota, panne). La bonne réponse est
// toujours la première ici : les réponses sont mélangées au tirage.
const q = (theme: string, text: string, options: [string, string, string, string], explain: string): QuizQuestion => ({
  theme,
  text,
  options,
  answer: 0,
  explain,
});

export const QUIZ_BANK: QuizQuestion[] = [
  // Géographie
  q('Géographie', 'Quel est le plus long fleuve d’Afrique ?', ['Le Nil', 'Le Congo', 'Le Niger', 'Le Zambèze'], 'Le Nil coule sur environ 6 650 km, du lac Victoria à la Méditerranée.'),
  q('Géographie', 'Quelle est la capitale du Canada ?', ['Ottawa', 'Toronto', 'Montréal', 'Vancouver'], 'Ottawa a été choisie en 1857, entre l’Ontario anglophone et le Québec francophone.'),
  q('Géographie', 'Quel est le plus grand océan du monde ?', ['Le Pacifique', 'L’Atlantique', 'L’Indien', 'L’Arctique'], 'Le Pacifique couvre à lui seul près d’un tiers de la surface de la Terre.'),
  q('Géographie', 'Dans quel pays se trouve le Machu Picchu ?', ['Le Pérou', 'Le Mexique', 'La Bolivie', 'Le Chili'], 'La cité inca a été bâtie au XVe siècle dans les Andes péruviennes.'),
  q('Géographie', 'Quel est le plus haut sommet du monde ?', ['L’Everest', 'Le K2', 'Le Kilimandjaro', 'Le mont Blanc'], 'L’Everest culmine à 8 849 m, à la frontière du Népal et de la Chine.'),
  q('Géographie', 'Quelle est la capitale de l’Australie ?', ['Canberra', 'Sydney', 'Melbourne', 'Perth'], 'Canberra a été construite exprès pour départager Sydney et Melbourne.'),
  q('Géographie', 'Quel est le plus grand désert chaud du monde ?', ['Le Sahara', 'Le Kalahari', 'Le désert de Gobi', 'L’Atacama'], 'Le Sahara s’étend sur plus de 9 millions de km², presque la taille des États-Unis.'),
  q('Géographie', 'Quel pays compte le plus d’habitants en 2024 ?', ['L’Inde', 'La Chine', 'Les États-Unis', 'L’Indonésie'], 'L’Inde a dépassé la Chine en 2023, avec plus de 1,4 milliard d’habitants.'),
  q('Géographie', 'Combien de pays sont membres de l’ONU ?', ['193', '154', '211', '178'], 'Le Soudan du Sud, en 2011, est le dernier pays à avoir rejoint l’ONU.'),
  q('Géographie', 'Quelle ville est surnommée « la Ville Lumière » ?', ['Paris', 'Las Vegas', 'Rome', 'New York'], 'Paris doit ce surnom à son rôle au siècle des Lumières et à son éclairage public précoce.'),

  // Afrique
  q('Afrique', 'Quelle est la capitale du Sénégal ?', ['Dakar', 'Saint-Louis', 'Thiès', 'Ziguinchor'], 'Dakar a remplacé Saint-Louis comme capitale de l’Afrique-Occidentale française en 1902.'),
  q('Afrique', 'Quel est le pays le plus peuplé d’Afrique ?', ['Le Nigeria', 'L’Éthiopie', 'L’Égypte', 'La RD Congo'], 'Le Nigeria compte plus de 220 millions d’habitants.'),
  q('Afrique', 'Qui fut le premier président de l’Afrique du Sud démocratique ?', ['Nelson Mandela', 'Desmond Tutu', 'Thabo Mbeki', 'Frederik de Klerk'], 'Nelson Mandela a été élu en 1994, après 27 ans passés en prison.'),
  q('Afrique', 'Quel plat ivoirien est fait de semoule de manioc ?', ['L’attiéké', 'Le foutou', 'Le garba', 'L’alloco'], 'L’attiéké se sert souvent avec du poisson grillé ; le garba l’associe au thon frit.'),
  q('Afrique', 'Quelle est la capitale du Burkina Faso ?', ['Ouagadougou', 'Bobo-Dioulasso', 'Bamako', 'Niamey'], 'Ouagadougou accueille tous les deux ans le FESPACO, grand festival du cinéma africain.'),
  q('Afrique', 'Sur quel continent se trouve Madagascar ?', ['L’Afrique', 'L’Asie', 'L’Océanie', 'Aucun, elle est isolée'], 'Madagascar est la quatrième plus grande île du monde, au large du Mozambique.'),
  q('Afrique', 'Quel est le plus haut sommet d’Afrique ?', ['Le Kilimandjaro', 'Le mont Kenya', 'Le mont Cameroun', 'Le Ras Dashen'], 'Le Kilimandjaro, en Tanzanie, culmine à 5 895 m.'),
  q('Afrique', 'Quelle langue est la plus parlée en Afrique de l’Est ?', ['Le swahili', 'L’amharique', 'Le wolof', 'Le haoussa'], 'Le swahili est parlé par plus de 100 millions de personnes, du Kenya au Congo.'),

  // Histoire
  q('Histoire', 'En quelle année a eu lieu la prise de la Bastille ?', ['1789', '1792', '1776', '1815'], 'Le 14 juillet 1789 est devenu la fête nationale française en 1880.'),
  q('Histoire', 'Qui était le premier homme à marcher sur la Lune ?', ['Neil Armstrong', 'Buzz Aldrin', 'Youri Gagarine', 'Michael Collins'], 'C’était le 21 juillet 1969, avec la mission Apollo 11.'),
  q('Histoire', 'En quelle année est tombé le mur de Berlin ?', ['1989', '1991', '1985', '1979'], 'Le mur est tombé dans la nuit du 9 au 10 novembre 1989.'),
  q('Histoire', 'Quelle civilisation a construit les pyramides de Gizeh ?', ['Les Égyptiens', 'Les Romains', 'Les Mayas', 'Les Perses'], 'La grande pyramide de Khéops a environ 4 500 ans.'),
  q('Histoire', 'Qui a été sacré empereur des Français en 1804 ?', ['Napoléon Ier', 'Louis XVI', 'Charlemagne', 'Napoléon III'], 'Napoléon s’est couronné lui-même à Notre-Dame, devant le pape.'),
  q('Histoire', 'Quelle reine d’Égypte était l’alliée de Jules César ?', ['Cléopâtre', 'Néfertiti', 'Hatchepsout', 'Néfertari'], 'Cléopâtre VII fut la dernière reine de l’Égypte antique.'),
  q('Histoire', 'En quelle année a commencé la Première Guerre mondiale ?', ['1914', '1918', '1912', '1939'], 'Elle a éclaté l’été 1914 et duré jusqu’à l’armistice du 11 novembre 1918.'),
  q('Histoire', 'Quel empire était dirigé par Soundiata Keïta ?', ['L’empire du Mali', 'L’empire ottoman', 'L’empire songhaï', 'L’empire du Ghana'], 'Soundiata Keïta a fondé l’empire du Mali au XIIIe siècle.'),

  // Sciences
  q('Sciences', 'Quel est le symbole chimique de l’or ?', ['Au', 'Or', 'Ag', 'Go'], 'Au vient du latin « aurum » ; Ag, c’est l’argent.'),
  q('Sciences', 'Combien d’os compte le corps humain adulte ?', ['206', '180', '250', '312'], 'Un bébé en a environ 300 : certains se soudent en grandissant.'),
  q('Sciences', 'À quelle température l’eau bout-elle au niveau de la mer ?', ['100 °C', '90 °C', '120 °C', '80 °C'], 'En altitude, l’eau bout plus tôt : vers 70 °C au sommet de l’Everest.'),
  q('Sciences', 'Quel gaz les plantes absorbent-elles pour la photosynthèse ?', ['Le dioxyde de carbone', 'L’oxygène', 'L’azote', 'L’hélium'], 'Elles absorbent le CO₂ et rejettent de l’oxygène.'),
  q('Sciences', 'Qui a formulé la théorie de la relativité ?', ['Albert Einstein', 'Isaac Newton', 'Marie Curie', 'Galilée'], 'Einstein a publié la relativité restreinte en 1905, la générale en 1915.'),
  q('Sciences', 'Quel organe pompe le sang dans le corps ?', ['Le cœur', 'Le foie', 'Les poumons', 'Les reins'], 'Le cœur bat environ 100 000 fois par jour.'),
  q('Sciences', 'Combien de chromosomes a une cellule humaine ?', ['46', '23', '42', '64'], 'Soit 23 paires, dont une paire de chromosomes sexuels.'),
  q('Sciences', 'Quel est l’animal terrestre le plus rapide ?', ['Le guépard', 'Le lion', 'L’antilope', 'Le cheval'], 'Le guépard peut dépasser 100 km/h sur de courtes distances.'),

  // Espace
  q('Espace', 'Quelle planète est surnommée « la planète rouge » ?', ['Mars', 'Vénus', 'Jupiter', 'Mercure'], 'Sa couleur vient de l’oxyde de fer, de la rouille, qui couvre son sol.'),
  q('Espace', 'Quelle est la plus grande planète du système solaire ?', ['Jupiter', 'Saturne', 'Neptune', 'La Terre'], 'On pourrait loger plus de 1 300 Terres dans Jupiter.'),
  q('Espace', 'Combien de planètes compte le système solaire ?', ['8', '9', '7', '10'], 'Pluton a été reclassée en planète naine en 2006.'),
  q('Espace', 'Quelle est l’étoile la plus proche de la Terre ?', ['Le Soleil', 'Proxima du Centaure', 'Sirius', 'L’étoile polaire'], 'Sa lumière met environ 8 minutes pour nous parvenir.'),

  // Arts et culture
  q('Arts et culture', 'Qui a peint La Joconde ?', ['Léonard de Vinci', 'Michel-Ange', 'Raphaël', 'Botticelli'], 'Le tableau est exposé au Louvre depuis la Révolution.'),
  q('Arts et culture', 'Qui a écrit « Les Misérables » ?', ['Victor Hugo', 'Émile Zola', 'Alexandre Dumas', 'Gustave Flaubert'], 'Le roman, paru en 1862, suit le destin de Jean Valjean.'),
  q('Arts et culture', 'Qui a écrit « Le Petit Prince » ?', ['Antoine de Saint-Exupéry', 'Jules Verne', 'Albert Camus', 'Marcel Pagnol'], 'C’est l’un des livres les plus traduits au monde, après la Bible.'),
  q('Arts et culture', 'Dans quelle ville se trouve le musée du Prado ?', ['Madrid', 'Barcelone', 'Lisbonne', 'Rome'], 'Le Prado abrite les chefs-d’œuvre de Velázquez et de Goya.'),
  q('Arts et culture', 'Quel auteur sénégalais a écrit « Une si longue lettre » ?', ['Mariama Bâ', 'Léopold Sédar Senghor', 'Cheikh Hamidou Kane', 'Aminata Sow Fall'], 'Paru en 1979, ce roman épistolaire est un classique de la littérature africaine.'),
  q('Arts et culture', 'Combien de cordes a une guitare classique ?', ['6', '4', '8', '12'], 'Une basse en a souvent 4, une guitare folk peut en avoir 12.'),

  // Cinéma et musique
  q('Cinéma', 'Quel film d’animation raconte l’histoire de Simba ?', ['Le Roi lion', 'Le Livre de la jungle', 'Madagascar', 'Tarzan'], 'Sorti en 1994, il s’inspire en partie de Hamlet de Shakespeare.'),
  q('Cinéma', 'Comment s’appelle le sorcier à la cicatrice en forme d’éclair ?', ['Harry Potter', 'Gandalf', 'Merlin', 'Dumbledore'], 'La saga de J. K. Rowling compte sept romans et huit films.'),
  q('Cinéma', 'Dans quelle ville se déroule la cérémonie des Oscars ?', ['Los Angeles', 'New York', 'Cannes', 'Las Vegas'], 'Elle a lieu chaque année au Dolby Theatre, à Hollywood.'),
  q('Cinéma', 'Quel festival remet la Palme d’or ?', ['Cannes', 'Venise', 'Berlin', 'Deauville'], 'Le Lion d’or est remis à Venise, l’Ours d’or à Berlin.'),
  q('Musique', 'Qui est surnommé « le roi de la pop » ?', ['Michael Jackson', 'Elvis Presley', 'Prince', 'Freddie Mercury'], 'Elvis Presley, lui, est surnommé « le King » du rock.'),
  q('Musique', 'De quel pays vient le groupe ABBA ?', ['La Suède', 'La Norvège', 'Le Danemark', 'Les Pays-Bas'], 'ABBA a gagné l’Eurovision en 1974 avec « Waterloo ».'),
  q('Musique', 'Quel artiste ivoirien a popularisé le « coupé-décalé » ?', ['Douk Saga', 'Alpha Blondy', 'Magic System', 'Meiway'], 'Douk Saga a lancé le mouvement à Paris au début des années 2000.'),

  // Sport
  q('Sport', 'Combien de joueurs compte une équipe de football sur le terrain ?', ['11', '9', '10', '12'], 'Gardien compris ; au basket, ils sont cinq.'),
  q('Sport', 'Quel pays a remporté la Coupe du monde de football 2022 ?', ['L’Argentine', 'La France', 'Le Brésil', 'Le Maroc'], 'L’Argentine a battu la France aux tirs au but, en finale au Qatar.'),
  q('Sport', 'Tous les combien d’années ont lieu les Jeux olympiques d’été ?', ['4 ans', '2 ans', '3 ans', '5 ans'], 'Ceux de 2024 se sont tenus à Paris, cent ans après ceux de 1924.'),
  q('Sport', 'Dans quel sport utilise-t-on un volant ?', ['Le badminton', 'Le tennis', 'Le squash', 'Le ping-pong'], 'Un volant de compétition compte 16 plumes d’oie.'),
  q('Sport', 'Quelle est la distance d’un marathon ?', ['42,195 km', '40 km', '45 km', '38,5 km'], 'Cette distance a été fixée aux Jeux de Londres en 1908.'),

  // Cuisine
  q('Cuisine', 'De quel pays vient la paëlla ?', ['L’Espagne', 'L’Italie', 'Le Portugal', 'Le Mexique'], 'Elle est née dans la région de Valence.'),
  q('Cuisine', 'Quel fruit sert à faire le guacamole ?', ['L’avocat', 'La mangue', 'Le citron vert', 'La papaye'], 'Le guacamole vient de la cuisine aztèque, au Mexique.'),
  q('Cuisine', 'Quel ingrédient principal compose le houmous ?', ['Le pois chiche', 'La lentille', 'Le haricot blanc', 'L’aubergine'], 'On l’écrase avec du tahini, de l’ail et du citron.'),
  q('Cuisine', 'Le thiéboudiène est le plat national de quel pays ?', ['Le Sénégal', 'Le Mali', 'La Côte d’Ivoire', 'Le Cameroun'], 'C’est un riz au poisson et aux légumes, inscrit au patrimoine de l’Unesco en 2021.'),

  // Nature
  q('Nature', 'Quel est le plus grand mammifère du monde ?', ['La baleine bleue', 'L’éléphant d’Afrique', 'Le cachalot', 'La girafe'], 'Elle peut dépasser 30 m de long et 150 tonnes.'),
  q('Nature', 'Combien de pattes a une araignée ?', ['8', '6', '10', '12'], 'Les insectes en ont 6 : l’araignée n’en est pas un, c’est un arachnide.'),
  q('Nature', 'Quel animal est le symbole du WWF ?', ['Le panda géant', 'Le tigre', 'L’ours polaire', 'Le koala'], 'Le logo a été dessiné en 1961 d’après Chi-Chi, un panda du zoo de Londres.'),
];
