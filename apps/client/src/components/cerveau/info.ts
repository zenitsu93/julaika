import type { CerveauKind, CerveauMode } from '@julaika/shared';

/** Chaque mode : son nom, puis pour chaque membre du binôme (ordre de `duo`) son rôle et sa consigne. */
export const KIND_INFO: Record<CerveauKind, { icon: string; name: string; roles: [string, string]; icons: [string, string]; tips: [string, string] }> = {
  guide: {
    icon: '🗣️',
    name: 'Le guide',
    roles: ['Guide', 'Artiste'],
    icons: ['🗣️', '✏️'],
    tips: ['Toi seul vois le modèle. Décris les formes à voix haute, sans dire ce que c’est !', 'Tu ne vois pas le modèle. Écoute ton guide et dessine.'],
  },
  moitie: {
    icon: '✂️',
    name: 'Moitié chacun',
    roles: ['Gauche', 'Droite'],
    icons: ['◧', '◨'],
    tips: ['Tu ne vois que la moitié gauche du modèle : dessine-la et raccordez-vous au milieu.', 'Tu ne vois que la moitié droite du modèle : dessine-la et raccordez-vous au milieu.'],
  },
  lignes: {
    icon: '📐',
    name: 'Droites contre courbes',
    roles: ['Droites', 'Courbes'],
    icons: ['📏', '〰️'],
    tips: ['Tu n’as que des lignes droites : appuie, tire le trait, lâche.', 'À toi les ronds et les courbes, à main levée. Partagez-vous le dessin !'],
  },
};

export const MODE_LABELS: { value: CerveauMode; icon: string; label: string }[] = [
  { value: 'guide', icon: KIND_INFO.guide.icon, label: 'Guide' },
  { value: 'moitie', icon: KIND_INFO.moitie.icon, label: 'Moitié' },
  { value: 'lignes', icon: KIND_INFO.lignes.icon, label: 'Droites/courbes' },
  { value: 'mixte', icon: '🔀', label: 'Les trois' },
];

/** Le verdict selon la ressemblance. */
export function verdict(score: number): { title: string; line: string } {
  if (score >= 75) return { title: 'Télépathie !', line: 'Un seul cerveau pour deux, c’est confirmé.' };
  if (score >= 50) return { title: 'Bien joué !', line: 'On reconnaît le modèle, et c’est déjà beaucoup.' };
  if (score >= 25) return { title: 'Pas loin…', line: 'Un peu de friture sur la ligne.' };
  return { title: 'Court-circuit !', line: 'Les deux moitiés du cerveau ne se parlaient plus.' };
}
