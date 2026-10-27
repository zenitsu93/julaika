// Contrat client <-> serveur.
// Messages de contrôle : JSON (frames texte). Dessin : binaire (voir draw.ts).

import type { BombEvent, BombState } from './bombe';
import type { ConnaitState } from './connait';
import type { IntrusState } from './intrus';
import type { BacState } from './petitbac';
import type { PhotoShot, PhotoState } from './photomaton';
import type { PitchState } from './pitch';
import type { TelChain, TelEntry, TelState } from './telephone';
import type { SoundId, SourireState, WarpId } from './sourire';
import type { WaveState } from './wavelength';

export const CANVAS_W = 800;
export const CANVAS_H = 600;

/** Palette fixe : le dessin n'envoie qu'un index (1 octet) au lieu d'une couleur. */
export const PALETTE = [
  '#ffffff', '#c1c1c1', '#ef130b', '#ff7100', '#ffe400', '#00cc00', '#00b2ff', '#231fd3',
  '#a300ba', '#d37caa', '#a0522d', '#592f2a', '#000000', '#4c4c4c', '#740b07', '#c23800',
  '#e8a200', '#005510', '#00569e', '#0e0865', '#550069', '#a75574', '#63300d', '#ecbcb4',
] as const;
export const BRUSH_SIZES = [4, 10, 20, 36] as const;

/** Jeux proposés : chaque salon en porte un, choisi à sa création. */
export const ROOM_GAMES = ['dessin', 'wavelength', 'telephone', 'intrus', 'petitbac', 'connait', 'bombe', 'photomaton', 'sourire', 'pitch'] as const;
export type RoomGame = (typeof ROOM_GAMES)[number];

export function isRoomGame(v: unknown): v is RoomGame {
  return (ROOM_GAMES as readonly unknown[]).includes(v);
}

/**
 * Dessin : choosing → drawing → turnEnd. Wavelength : clue (le télépathe cherche son indice)
 * → guess (l'équipe place l'aiguille) → reveal. Téléphone dessiné : write → draw → describe
 * → draw… (tous en même temps) → album. L'Intrus : clue (indices à tour de rôle) → vote
 * → steal (l'intrus démasqué tente le mot) → reveal. Petit Bac : fill (la grille) → vote → reveal.
 * Qui me connaît le mieux : answer (la vedette répond, les autres parient) → reveal.
 * Bombe à mots : bomb, jusqu'au dernier survivant. Photomaton : pose (consigne puis flash) → vote → reveal.
 * Pas un sourire ! : faceoff (3, 2, 1) → duel → verdict.
 * Pitch saboté : brief (le produit) → pitch → vote (les offres) → verdict.
 */
export type Phase =
  | 'lobby'
  | 'choosing'
  | 'drawing'
  | 'turnEnd'
  | 'clue'
  | 'guess'
  | 'reveal'
  | 'write'
  | 'draw'
  | 'describe'
  | 'album'
  | 'vote'
  | 'steal'
  | 'fill'
  | 'answer'
  | 'bomb'
  | 'pose'
  | 'faceoff'
  | 'duel'
  | 'verdict'
  | 'brief'
  | 'pitch'
  | 'gameEnd';

/** Difficulté des mots proposés : sert au tirage dans les listes intégrées et à la génération par IA. */
export const DIFFICULTIES = ['facile', 'moyen', 'difficile'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export function isDifficulty(v: unknown): v is Difficulty {
  return (DIFFICULTIES as readonly unknown[]).includes(v);
}

/**
 * Manches piégées du Dessin : une contrainte tirée au sort pour le dessinateur.
 * invisible : il ne voit pas ce qu'il trace ; shifty : la couleur change à chaque levé de crayon ;
 * straight : que des lignes droites ; mono : une seule couleur imposée.
 */
export const TRAPS = ['invisible', 'shifty', 'straight', 'mono'] as const;
export type TrapKind = (typeof TRAPS)[number];

export interface Trap {
  kind: TrapKind;
  /** Couleur imposée (index de PALETTE), utile au piège « mono » seulement. */
  color: number;
}

/** Fréquence des manches piégées, réglée par l'hôte. */
export const TRAP_MODES = ['jamais', 'parfois', 'toujours'] as const;
export type TrapMode = (typeof TRAP_MODES)[number];

export function isTrapMode(v: unknown): v is TrapMode {
  return (TRAP_MODES as readonly unknown[]).includes(v);
}

/** Couleurs franches tirées pour le piège « une seule couleur » et le pinceau farceur. */
export const TRAP_COLORS = [2, 3, 5, 6, 7, 8, 9, 10, 12, 15, 17, 18] as const;

export interface RoomSettings {
  rounds: number;
  drawTime: number; // secondes
  maxPlayers: number;
  wordChoices: number;
  hints: number;
  difficulty: Difficulty;
  customWords: string[];
  customOnly: boolean;
  traps: TrapMode;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  rounds: 3,
  drawTime: 80,
  maxPlayers: 10,
  wordChoices: 3,
  hints: 2,
  difficulty: 'moyen',
  customWords: [],
  customOnly: false,
  traps: 'jamais',
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
  game: RoomGame;
  phase: Phase;
  settings: RoomSettings;
  players: PlayerPublic[];
  drawerId: string | null;
  round: number;
  /** Timestamp serveur (ms) de fin de phase ; le client calcule le compte à rebours. */
  endsAt: number | null;
  /** Mot masqué ("_ _ a _"), ou mot complet pour le dessinateur. */
  hint: string | null;
  /** Lien Google Meet du salon, partagé par l'hôte (vide si aucun). */
  meetUrl: string;
  /** Piège du tour de dessin en cours (dès le choix du mot), null sinon. */
  trap: Trap | null;
  /** État de Wavelength, null pour les autres jeux. */
  wave: WaveState | null;
  /** État du Téléphone dessiné, null pour les autres jeux. */
  tel: TelState | null;
  /** État de L'Intrus vu par ce joueur (son mot reste secret), null pour les autres jeux. */
  intrus: IntrusState | null;
  /** État du Petit Bac, null pour les autres jeux. */
  bac: BacState | null;
  /** État de Qui me connaît le mieux, null pour les autres jeux. */
  connait: ConnaitState | null;
  /** État de la Bombe à mots, null pour les autres jeux. */
  bomb: BombState | null;
  /** État du Photomaton, null pour les autres jeux. */
  photo: PhotoState | null;
  /** État de Pas un sourire !, null pour les autres jeux. */
  sourire: SourireState | null;
  /** État du Pitch saboté, null pour les autres jeux. */
  pitch: PitchState | null;
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
  | { t: 'join'; name: string; avatar: number; room?: string; game?: RoomGame }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'choose'; index: number }
  | { t: 'chat'; text: string }
  | { t: 'clear' }
  | { t: 'undo' }
  | { t: 'meet'; url: string }
  | { t: 'call'; inCall: boolean; cam: boolean; mic: boolean }
  | { t: 'rtc'; to: string; data: RtcSignal }
  | { t: 'wave'; clue: string }
  | { t: 'wave'; dial: number }
  | { t: 'wave'; lock: true }
  | { t: 'wave'; reroll: true }
  | { t: 'tel'; text: string }
  | { t: 'tel'; done: true }
  | { t: 'tel'; edit: true }
  | { t: 'tel'; next: true }
  | { t: 'intrus'; clue: string }
  | { t: 'intrus'; vote: string }
  | { t: 'intrus'; steal: string }
  | { t: 'bac'; answers: string[] }
  | { t: 'bac'; stop: true }
  | { t: 'bac'; veto: { player: string; category: number; against: boolean } }
  | { t: 'bac'; done: boolean }
  | { t: 'bac'; next: true }
  | { t: 'connait'; pick: number }
  | { t: 'connait'; reroll: true }
  | { t: 'bomb'; word: string }
  | { t: 'bomb'; typing: string }
  | { t: 'photo'; image: string | null }
  | { t: 'photo'; vote: string; stars: number }
  /** Boîte à sons : un bruitage joué chez tout le salon (dans tous les jeux). */
  | { t: 'sound'; id: SoundId }
  | { t: 'sourire'; smiled: true }
  | { t: 'sourire'; dare: true }
  | { t: 'sourire'; warp: WarpId | null }
  | { t: 'pitch'; slide: number }
  | { t: 'pitch'; rate: number }
  | { t: 'pitch'; done: true }
  | { t: 'pitch'; reroll: true }
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
  /** Aiguille de Wavelength bougée par un coéquipier : message léger, sans tout l'état. */
  | { t: 'dial'; value: number; by: string }
  /** Téléphone dessiné : ce que le joueur doit dessiner ou décrire à cette étape. */
  | { t: 'telPrompt'; step: number; prompt: TelEntry | null }
  /** Téléphone dessiné : toutes les chaînes, envoyées une fois au début de l'album. */
  | { t: 'album'; chains: TelChain[] }
  /** Bombe à mots : ce que tape celui qui tient la bombe, lettre à lettre. */
  | { t: 'bombTyping'; by: string; text: string }
  /** Bombe à mots : mot validé, refusé, explosion ou vie gagnée. */
  | { t: 'bombEvent'; event: BombEvent }
  /** Photomaton : les polaroids de la manche, envoyés une fois toutes les photos reçues. */
  | { t: 'photos'; round: number; shots: PhotoShot[] }
  /** Bruitage envoyé par un joueur : chacun le synthétise chez lui (sauf s'il a coupé le son). */
  | { t: 'sound'; id: SoundId; by: string }
  | { t: 'pong'; at: number; now: number }
  | { t: 'error'; message: string };
