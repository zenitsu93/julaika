import type { TrapKind, TrapMode } from '@julaika/shared';

/** Fiches des manches piégées : icône, nom et règle en une phrase. */
export const TRAP_INFO: Record<TrapKind, { icon: string; name: string; rule: string; drawer: string }> = {
  invisible: {
    icon: '👻',
    name: 'Encre invisible',
    rule: 'Le dessinateur ne voit pas ce qu’il trace.',
    drawer: 'Ton trait s’efface dès que tu lèves le crayon. Les autres, eux, voient tout !',
  },
  shifty: {
    icon: '🎲',
    name: 'Pinceau farceur',
    rule: 'La couleur change à chaque levé de crayon.',
    drawer: 'Chaque nouveau trait prend une couleur au hasard.',
  },
  straight: {
    icon: '📐',
    name: 'Lignes droites',
    rule: 'Que des traits droits, d’un point à un autre.',
    drawer: 'Appuie, tire, lâche : le trait part tout droit.',
  },
  mono: {
    icon: '🖍️',
    name: 'Une seule couleur',
    rule: 'Une couleur imposée, pas une de plus.',
    drawer: 'Une seule couleur pour tout le dessin (la gomme reste là).',
  },
};

export const TRAP_MODE_LABELS: { value: TrapMode; label: string }[] = [
  { value: 'jamais', label: 'Jamais' },
  { value: 'parfois', label: 'Parfois' },
  { value: 'toujours', label: 'Toujours' },
];
