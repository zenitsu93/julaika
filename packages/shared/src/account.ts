// Comptes joueurs : ce qui circule entre l'API /api/... et les écrans (profil, album, historique).

/** Le joueur connecté, tel que le voit son navigateur. */
export interface UserPublic {
  id: string;
  email: string;
  name: string;
  avatar: number;
  /** A un mot de passe (sinon compte créé par Google seulement). */
  hasPassword: boolean;
  google: boolean;
  created: number;
}

/** Jeux qui laissent des images dans l'album. */
export const ALBUM_GAMES = ['dessin', 'mime', 'photomaton', 'cadavre', 'cerveau', 'telephone', 'flash'] as const;
export type AlbumGame = (typeof ALBUM_GAMES)[number];
export const ALBUM_GAME_NAMES: Record<AlbumGame, string> = {
  dessin: 'Dessin',
  mime: 'Mime',
  photomaton: 'Photomaton',
  cadavre: 'Cadavre exquis',
  cerveau: 'Cerveau coupé',
  telephone: 'Téléphone dessiné',
  flash: 'Flash',
};
export function isAlbumGame(v: unknown): v is AlbumGame {
  return (ALBUM_GAMES as readonly unknown[]).includes(v);
}

/** Une image de l'album. L'image elle-même se lit à /api/album/<id>. */
export interface MediaItem {
  id: string;
  game: AlbumGame;
  caption: string;
  /** Les autres joueurs de la partie, par leur nom. */
  people: string[];
  party: string;
  created: number;
}

/** Une image envoyée pour l'album (fin de manche). */
export interface MediaUpload {
  /** Clé stable de l'image dans la partie : la même image envoyée deux fois n'est gardée qu'une fois. */
  key: string;
  party: string;
  game: AlbumGame;
  caption: string;
  people: string[];
  /** data:image/webp|png|jpeg;base64,... */
  image: string;
}

/** Taille maximale d'une image envoyée (data URL), environ 1,5 Mo d'image. */
export const MEDIA_MAX_CHARS = 2_000_000;
export const MEDIA_URL = /^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+=*)$/;

/** Un joueur d'une partie de l'historique. */
export interface PartyPlayer {
  name: string;
  avatar: number;
  score: number;
  rank: number;
  /** C'est le joueur connecté. */
  me?: boolean;
}

export interface HistoryParty {
  id: string;
  game: string;
  mode: string;
  started: number;
  ended: number;
  rank: number;
  score: number;
  players: PartyPlayer[];
  /** Images de cette partie dans l'album du joueur (ids). */
  media: string[];
}

/** E-mail plausible : sert au formulaire et au serveur, la vraie preuve reste le code reçu. */
export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const PASSWORD_MIN = 8;

export function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL.test(e) ? e : null;
}

/** Force d'un mot de passe, de 0 à 4 : les quatre règles de l'écran de récupération. */
export const PASSWORD_RULES = [
  { id: 'len', label: '8 caractères ou plus', test: (v: string) => v.length >= PASSWORD_MIN },
  { id: 'num', label: 'Au moins un chiffre', test: (v: string) => /\d/.test(v) },
  { id: 'up', label: 'Une majuscule', test: (v: string) => /\p{Lu}/u.test(v) },
  { id: 'sym', label: 'Un symbole (! ? # …)', test: (v: string) => /[^\p{L}\p{N}\s]/u.test(v) },
] as const;
export const passwordScore = (v: string) => PASSWORD_RULES.filter((r) => r.test(v)).length;

/** Un mot de passe accepté : 8 caractères au moins, 200 au plus. */
export const validPassword = (v: unknown): v is string => typeof v === 'string' && v.length >= PASSWORD_MIN && v.length <= 200;
