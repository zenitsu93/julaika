import type { Spectrum } from '@julaika/shared';

const PAIRS = `
Nul|Génial
Froid|Chaud
Pas cher|Hors de prix
Ennuyeux|Passionnant
Facile|Difficile
Inutile|Indispensable
Moche|Magnifique
Rare|Courant
Calme|Bruyant
Sain|Mauvais pour la santé
Doux|Piquant
Petit|Énorme
Lent|Rapide
Démodé|Tendance
Triste|Joyeux
Effrayant|Rassurant
Romantique|Pas romantique du tout
Salé|Sucré
Sous-coté|Surcoté
Pour enfants|Pour adultes
Naturel|Artificiel
Léger|Lourd
Fragile|Solide
Mou|Dur
Simple|Compliqué
Gentil|Méchant
Propre|Sale
Silencieux|Assourdissant
Sérieux|Ridicule
Classe|Vulgaire
Vieux|Neuf
Sombre|Lumineux
Mauvaise idée|Bonne idée
Sec|Mouillé
Ringard|Stylé
Faible|Puissant
Banal|Bizarre
Réaliste|Fantastique
Petit plaisir|Grand bonheur
Peu connu|Célèbre
Lisse|Rugueux
Pauvre en calories|Bombe calorique
Prévisible|Surprenant
Introverti|Extraverti
Calme plat|Chaos total
Matin|Soir
Été|Hiver
Chat|Chien
Ville|Campagne
Talent|Travail
Pire film|Meilleur film
Pire chanson|Meilleure chanson
Pire métier|Meilleur métier
Pire cadeau|Meilleur cadeau
Pire premier rendez-vous|Meilleur premier rendez-vous
Mauvaise excuse|Excellente excuse
Dangereux|Sans danger
Interdit|Obligatoire
Héros|Méchant
Peu probable|Très probable
Ça sent mauvais|Ça sent bon
Fait pour une fois|Fait tous les jours
Gâchis de temps|Bon investissement
Un peu gênant|Très gênant
Overrated|Sous-estimé
Original|Cliché
Mignon|Terrifiant
Normal|Étrange
Tranquille|Stressant
Le monde d’avant|Le futur
Gourmand|Raisonnable
Amour|Haine
Plaisir coupable|Vraie fierté
`;

export const SPECTRUMS: Spectrum[] = PAIRS.trim()
  .split('\n')
  .map((line) => {
    const [left, right] = line.split('|');
    return { left: left!.trim(), right: right!.trim() };
  });
