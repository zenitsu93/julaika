// Contrat client <-> serveur.
// Messages de contrôle : JSON (frames texte). Dessin : binaire (voir draw.ts).

import type { AgentsState } from './agents';
import type { AlibiObjection, AlibiState } from './alibi';
import type { ArcadeEvent, ArcadeState } from './arcade';
import type { BombEvent, BombState } from './bombe';
import type { BrasState } from './brasdefer';
import type { CadavreState, Creature } from './cadavre';
import type { DrawPacket } from './draw';
import type { CerveauMode, CerveauState } from './cerveau';
import type { ConnaitState } from './connait';
import type { FlashSketch, FlashState } from './flash';
import type { InterditsState } from './interdits';
import type { FredState } from './fredonne';
import type { IntrusState } from './intrus';
import type { MimeShot, MimeTwist } from './mime';
import type { StoryState } from './motamot';
import type { BacState } from './petitbac';
import type { PhotoShot, PhotoState } from './photomaton';
import type { PitchState } from './pitch';
import type { QuizState } from './quiz';
import type { TelChain, TelEntry, TelState } from './telephone';
import type { AovKind, AovLevel, AovState } from './verite';
import type { SoundId, SourireState, WarpId } from './sourire';
import type { MusicTrack, RoomMusic } from './musique';
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

/** Jeux proposés : chaque salon en porte un, choisi à sa création puis changé par l'hôte entre deux parties. */
export const ROOM_GAMES = ['dessin', 'wavelength', 'telephone', 'intrus', 'petitbac', 'connait', 'bombe', 'photomaton', 'sourire', 'brasdefer', 'flash', 'cadavre', 'interdits', 'motamot', 'agents', 'fredonne', 'alibi', 'pitch', 'cerveau', 'verite', 'quiz', 'foot', 'oreillers', 'drap'] as const;
export type RoomGame = (typeof ROOM_GAMES)[number];

export function isRoomGame(v: unknown): v is RoomGame {
  return (ROOM_GAMES as readonly unknown[]).includes(v);
}

/** Nom de chaque jeu, pour annoncer dans le chat le jeu que l'hôte vient de choisir. */
export const ROOM_GAME_NAMES: Record<RoomGame, string> = {
  dessin: 'Dessin',
  wavelength: 'Wavelength',
  telephone: 'Téléphone dessiné',
  intrus: "L'Intrus",
  petitbac: 'Petit Bac',
  connait: 'Qui me connaît le mieux ?',
  bombe: 'Bombe à mots',
  photomaton: 'Photomaton',
  sourire: 'Pas un sourire !',
  brasdefer: 'Bras de fer',
  flash: 'Flash',
  cadavre: 'Cadavre exquis',
  interdits: 'Mots interdits',
  motamot: 'Mot à mot',
  agents: 'Agents secrets',
  fredonne: 'Fredonne !',
  alibi: "L'Alibi",
  pitch: 'Pitch saboté',
  cerveau: 'Cerveau coupé',
  verite: 'Action ou vérité',
  quiz: 'Quiz culture G',
  foot: 'Tête-à-tête',
  oreillers: 'Bataille d’oreillers',
  drap: 'Le Drap tendu',
};

/**
 * Dessin : choosing → drawing → turnEnd. Wavelength : clue (le télépathe cherche son indice)
 * → guess (l'équipe place l'aiguille) → reveal. Téléphone dessiné : write → draw → describe
 * → draw… (tous en même temps) → album. L'Intrus : clue (indices à tour de rôle) → vote
 * → steal (l'intrus démasqué tente le mot) → reveal. Petit Bac : fill (la grille) → vote → reveal.
 * Qui me connaît le mieux : answer (la vedette répond, les autres parient) → reveal.
 * Bombe à mots : bomb, jusqu'au dernier survivant. Photomaton : pose (consigne puis flash) → vote → reveal.
 * Pas un sourire ! : faceoff (3, 2, 1) → duel → verdict. Bras de fer : pareil. Flash : memorize (l'image 3 s) → draw → vote → reveal.
 * Cadavre exquis : draw (tête, corps, jambes, tous en même temps) → reveal.
 * Mots interdits : faceoff (qui fait deviner) → explain (les cartes défilent) → verdict. Mot à mot : write (un mot chacun) → album (lecture).
 * Agents secrets : clue (l'espion donne son indice) → guess (on retourne les cartes) → reveal. Fredonne ! : pick (le chanteur choisit) → hum → reveal.
 * L'Alibi : plot (les complices se concertent) → trial (les pièces tombent) → vote (le jury) → verdict.
 * Pitch saboté : brief (le produit) → pitch → vote (les offres) → verdict. Cerveau coupé : draw → reveal → … → album.
 * Action ou vérité : spin (la bouteille) → pick (action ou vérité) → dare (la carte) → verdict.
 * Jeux d'action (Tête-à-tête, Bataille d'oreillers, Drap tendu) : faceoff (3, 2, 1) → duel → verdict.
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
  | 'memorize'
  | 'explain'
  | 'pick'
  | 'hum'
  | 'plot'
  | 'trial'
  | 'brief'
  | 'pitch'
  | 'spin'
  | 'pick'
  | 'dare'
  | 'prep'
  | 'gameEnd';

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
  mode: GameMode;
  rounds: number;
  drawTime: number; // secondes
  maxPlayers: number;
  wordChoices: number;
  hints: number;
  difficulty: Difficulty;
  customWords: string[];
  customOnly: boolean;
  traps: TrapMode;
  /** Mime : une consigne surprise toutes les 20 s (au ralenti, comme un robot…). */
  twists: boolean;
  /** Cerveau coupé : guide à la voix, moitié chacun, droites contre courbes, ou les trois. */
  cerveau: CerveauMode;
  /** Action ou vérité : niveau des cartes. */
  aovLevel: AovLevel;
  /** Quiz : le ou les thèmes écrits par l'hôte (séparés par des virgules), et le nombre de questions. */
  quizTheme: string;
  questions: number;
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
  traps: 'jamais',
  twists: true,
  cerveau: 'mixte',
  aovLevel: 'lite',
  quizTheme: '',
  questions: 10,
};

export const SETTINGS_LIMITS = {
  rounds: [1, 20],
  drawTime: [30, 240],
  maxPlayers: [2, 16],
  wordChoices: [1, 5],
  hints: [0, 5],
  questions: [5, 20],
} as const;

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: number;
  score: number;
  isHost: boolean;
  guessed: boolean;
  /** Faux pendant une coupure : sa place est gardée le temps du délai de grâce. */
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
  /** Dessin ou mime pour le tour en cours (dessin hors partie). */
  turnKind: TurnKind;
  round: number;
  /** Timestamp serveur (ms) de fin de phase ; le client calcule le compte à rebours. */
  endsAt: number | null;
  /** Mot masqué ("_ _ a _"), ou mot complet pour le dessinateur ou le mimeur. */
  hint: string | null;
  /** Lien Google Meet du salon, partagé par l'hôte (vide si aucun). */
  meetUrl: string;
  /** Piège du tour de dessin en cours (dès le choix du mot), null sinon. */
  trap: Trap | null;
  /** Mime : consigne surprise en cours pour le mimeur (null hors tour de mime). */
  twist: MimeTwist | null;
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
  /** État du Bras de fer vu par ce joueur (ses cibles), null pour les autres jeux. */
  bras: BrasState | null;
  /** État de Flash, null pour les autres jeux. */
  flash: FlashState | null;
  /** État du Cadavre exquis, null pour les autres jeux. */
  cadavre: CadavreState | null;
  /** État de Mots interdits vu par ce joueur (la carte reste secrète), null pour les autres jeux. */
  interdits: InterditsState | null;
  /** État de Mot à mot, null pour les autres jeux. */
  motamot: StoryState | null;
  /** État d'Agents secrets, null pour les autres jeux. */
  agents: AgentsState | null;
  /** État de Fredonne ! vu par ce joueur (la chanson reste secrète), null pour les autres jeux. */
  fred: FredState | null;
  /** État de L'Alibi vu par ce joueur (le carnet reste aux complices), null pour les autres jeux. */
  alibi: AlibiState | null;
  /** État du Pitch saboté, null pour les autres jeux. */
  pitch: PitchState | null;
  /** État du Cerveau coupé vu par ce joueur (modèle caché à l'artiste guidé), null sinon. */
  cerveau: CerveauState | null;
  /** État d'Action ou vérité, null pour les autres jeux. */
  aov: AovState | null;
  /** État du quiz de culture générale vu par ce joueur, null pour les autres jeux. */
  quiz: QuizState | null;
  /** État d'un jeu d'action (score, qui joue) ; le monde lui-même circule en images binaires. */
  arcade: ArcadeState | null;
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
  /** `seat` : jeton reçu dans `welcome`, pour reprendre sa place après une coupure (appli en arrière-plan). */
  | { t: 'join'; name: string; avatar: number; room?: string; game?: RoomGame; mode?: GameMode; seat?: string }
  /** Départ volontaire : la place est rendue tout de suite, sans délai de grâce. */
  | { t: 'leave' }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  /** L'hôte change le jeu du salon (même code, mêmes joueurs) ; en pleine partie, elle s'arrête d'abord. */
  | { t: 'game'; game: RoomGame; mode?: GameMode }
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
  | { t: 'intrus'; hesitate: true }
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
  /** Photomaton : « J'ai fini de noter ». */
  | { t: 'photo'; ready: true }
  /** Photomaton : l'hôte met en pause ou relance la partie. */
  | { t: 'photo'; pause: boolean }
  /** Mime : le mimeur répond à `mimeSnap` avec l'image de sa caméra (null sans caméra). */
  | { t: 'mimeShot'; finder: string; image: string | null }
  /** Boîte à sons : un bruitage joué chez tout le salon (dans tous les jeux). */
  | { t: 'sound'; id: SoundId }
  /** Lecteur de musique : partager son morceau avec le salon (et chaque pause, saut ou changement), ou arrêter. */
  | { t: 'music'; track: MusicTrack; playing: boolean; pos: number }
  | { t: 'music'; stop: true }
  | { t: 'sourire'; smiled: true }
  | { t: 'sourire'; dare: true }
  | { t: 'sourire'; warp: WarpId | null }
  | { t: 'bras'; hit: number }
  | { t: 'bras'; voice: boolean }
  | { t: 'flash'; done: true }
  | { t: 'flash'; edit: true }
  | { t: 'flash'; vote: string; stars: number }
  | { t: 'cadavre'; done: true }
  | { t: 'cadavre'; edit: true }
  | { t: 'cadavre'; name: string }
  | { t: 'cadavre'; heart: string }
  | { t: 'cadavre'; next: true }
  /** Mots interdits : on tranche la carte n° `card` (trouvé, buzz, passée). */
  | { t: 'interdits'; found: number }
  | { t: 'interdits'; buzz: number; heard?: string }
  | { t: 'interdits'; skip: number }
  | { t: 'motamot'; typing: string }
  | { t: 'motamot'; word: string }
  | { t: 'motamot'; veto: number }
  | { t: 'motamot'; star: number }
  | { t: 'motamot'; ready: true }
  | { t: 'agents'; clue: string; count: number }
  | { t: 'agents'; point: number }
  | { t: 'agents'; guess: number }
  | { t: 'agents'; pass: true }
  | { t: 'fred'; pick: number }
  | { t: 'fred'; reroll: true }
  | { t: 'alibi'; note: string }
  | { t: 'alibi'; statement: string }
  | { t: 'alibi'; object: AlibiObjection }
  | { t: 'alibi'; vote: boolean }
  | { t: 'pitch'; slide: number }
  | { t: 'pitch'; rate: number }
  | { t: 'pitch'; done: true }
  | { t: 'pitch'; reroll: true }
  | { t: 'cerveau'; done: boolean }
  | { t: 'cerveau'; next: true }
  | { t: 'aov'; spin: true }
  | { t: 'aov'; choose: AovKind }
  | { t: 'aov'; pass: true }
  | { t: 'aov'; vote: boolean }
  | { t: 'quiz'; pick: number }
  /** Jeux d'action : les touches enfoncées (bits de Key), envoyées à chaque changement. */
  | { t: 'arcade'; k: number }
  | { t: 'ping'; at: number };

export type ServerMsg =
  | { t: 'welcome'; selfId: string; seat: string; state: RoomState; now: number; ice: IceServer[] }
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
  /** Mime, au mimeur seul : quelqu'un vient de trouver, prends le polaroid. */
  | { t: 'mimeSnap'; finder: string }
  /** Mime : le polaroid d'une trouvaille, pour tout le salon. */
  | { t: 'mimeShot'; shot: MimeShot }
  /** Bruitage envoyé par un joueur : chacun le synthétise chez lui (sauf s'il a coupé le son). */
  | { t: 'sound'; id: SoundId; by: string }
  /** Musique partagée avec le salon (null : plus personne ne partage). */
  | { t: 'music'; music: RoomMusic | null }
  /** Flash : les croquis de la manche, envoyés une fois au début du vote. */
  | { t: 'sketches'; round: number; sketches: FlashSketch[] }
  /** Cadavre exquis : le morceau à dessiner, et la bande de jonction de celui d'au-dessus. */
  | { t: 'cadPrompt'; step: number; above: { name: string; strokes: DrawPacket[] } | null }
  /** Cadavre exquis : toutes les créatures, envoyées une fois au dévoilement. */
  | { t: 'creatures'; creatures: Creature[] }
  /** Mot à mot : ce que tape celui dont c'est le tour, lettre à lettre. */
  | { t: 'storyTyping'; by: string; text: string }
  /** Cerveau coupé : un des deux calques du dessin annulé ou effacé par son dessinateur. */
  | { t: 'cerveauInk'; layer: number; op: 'undo' | 'clear' }
  /** Jeux d'action : ce qui vient de se passer (but, coup, cœur attrapé), pour les effets. */
  | { t: 'arcadeEv'; ev: ArcadeEvent[] }
  | { t: 'pong'; at: number; now: number }
  | { t: 'error'; message: string };
