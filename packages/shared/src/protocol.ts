// Contrat client <-> serveur.
// Messages de contrôle : JSON (frames texte). Dessin : binaire (voir draw.ts).

export const CANVAS_W = 800;
export const CANVAS_H = 600;

/** Palette fixe : le dessin n'envoie qu'un index (1 octet) au lieu d'une couleur. */
export const PALETTE = [
  '#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00b2ff', '#231fd3',
  '#a300ba', '#d37caa', '#a0522d', '#592f2a', '#000000', '#4c4c4c', '#740b07', '#c23800',
  '#e8a200', '#005510', '#00569e', '#0e0865', '#550069', '#a75574', '#63300d', '#ecbcb4',
] as const;
export const BRUSH_SIZES = [4, 10, 20, 36] as const;

export type Phase = 'lobby' | 'choosing' | 'drawing' | 'turnEnd' | 'gameEnd';

/** Difficulté des mots proposés : sert au tirage dans les listes intégrées et à la génération par IA. */
export const DIFFICULTIES = ['facile', 'moyen', 'difficile'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function isDifficulty(v: unknown): v is Difficulty {
  return (DIFFICULTIES as readonly unknown[]).includes(v);
}

/** Mode de jeu du salon : dessin, mime, ou les deux au hasard d'un tour à l'autre. */
export const GAME_MODES = ['dessin', 'mime', 'mixte'] as const;
export type GameMode = (typeof GAME_MODES)[number];

export function isGameMode(v: unknown): v is GameMode {
  return (GAME_MODES as readonly unknown[]).includes(v);
}

/** Nature du tour en cours : on dessine sur le tableau, ou on mime devant la caméra. */
export type TurnKind = 'draw' | 'mime';

export interface RoomSettings {
  mode: GameMode;
  rounds: number;
  drawTime: number; // secondes
  maxPlayers: number;
  wordChoices: number;
  hints: number;
  difficulty: Difficulty;
  customWords: string[];
  customOnly: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  mode: 'dessin',
  rounds: 3,
  drawTime: 80,
  maxPlayers: 10,
  wordChoices: 3,
  hints: 2,
  difficulty: 'moyen',
  customWords: [],
  customOnly: false,
};

export const SETTINGS_LIMITS = {
  rounds: [1, 10],
  drawTime: [30, 240],
  maxPlayers: [2, 16],
  wordChoices: [1, 5],
  hints: [0, 5],
} as const;

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: number;
  score: number;
  isHost: boolean;
  guessed: boolean;
  connected: boolean;
  /** Présence dans la visio intégrée, et état caméra / micro (pour afficher l'avatar à la place). */
  inCall: boolean;
  cam: boolean;
  mic: boolean;
}

/** Visio en maillage pair à pair : au-delà, le débit montant de chacun ne suit plus. */
export const MAX_CALL = 8;

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Signalisation WebRTC relayée telle quelle par le serveur. */
export type RtcSignal =
  | { sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

export interface RoomState {
  code: string;
  phase: Phase;
  settings: RoomSettings;
  players: PlayerPublic[];
  drawerId: string | null;
  /** Dessin ou mime pour le tour en cours (dessin hors partie). */
  turnKind: TurnKind;
  round: number;
  /** Timestamp serveur (ms) de fin de phase ; le client calcule le compte à rebours. */
  endsAt: number | null;
  /** Mot masqué ("_ _ a _"), ou mot complet pour le dessinateur ou le mimeur. */
  hint: string | null;
  /** Lien Google Meet du salon, partagé par l'hôte (vide si aucun). */
  meetUrl: string;
}

/** Seuls les liens de réunion Google Meet sont acceptés, pour ne pas relayer n'importe quelle URL. */
export const MEET_URL = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

export function parseMeetUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return '';
  const withProto = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    const url = `https://${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '');
    return MEET_URL.test(url) ? url : null;
  } catch {
    return null;
  }
}

export type ChatKind = 'msg' | 'system' | 'correct' | 'close' | 'guessed';

export interface ChatLine {
  from: string | null;
  name: string | null;
  text: string;
  kind: ChatKind;
}

export type ClientMsg =
  | { t: 'join'; name: string; avatar: number; room?: string }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'choose'; index: number }
  | { t: 'chat'; text: string }
  | { t: 'clear' }
  | { t: 'undo' }
  | { t: 'meet'; url: string }
  | { t: 'call'; inCall: boolean; cam: boolean; mic: boolean }
  | { t: 'rtc'; to: string; data: RtcSignal }
  | { t: 'ping'; at: number };

export type ServerMsg =
  | { t: 'welcome'; selfId: string; state: RoomState; now: number; ice: IceServer[] }
  | { t: 'rtc'; from: string; data: RtcSignal }
  | { t: 'state'; state: RoomState }
  | { t: 'chat'; line: ChatLine }
  | { t: 'choices'; words: string[] }
  | { t: 'turnEnd'; word: string; gains: Record<string, number> }
  | { t: 'gameEnd'; ranking: PlayerPublic[] }
  | { t: 'clear' }
  | { t: 'undo' }
  | { t: 'pong'; at: number; now: number }
  | { t: 'error'; message: string };
