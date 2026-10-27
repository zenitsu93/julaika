import {
  ALIBI_MIN_PLAYERS,
  DEFAULT_SETTINGS,
  DrawOp,
  INTRUS_MIN_PLAYERS,
  MIME_MAX_SHOTS,
  MIME_TWISTS,
  MIME_TWIST_EVERY,
  MIME_TWIST_MARGIN,
  MAX_CALL,
  SETTINGS_LIMITS,
  TRAPS,
  TRAP_COLORS,
  checkGuess,
  decodeDraw,
  isCerveauMode,
  isAovLevel,
  isDifficulty,
  isGameMode,
  isPhotoDataUrl,
  isTrapMode,
  isSoundId,
  maskWord,
  parseMeetUrl,
  normalize,
  parseQuizThemes,
  QUIZ_THEME_MAX,
  type AovHeat,
  type AovKind,
  type ChatLine,
  type ClientMsg,
  type Difficulty,
  type IceServer,
  type IntrusPair,
  type MimeTwist,
  type Phase,
  type PlayerPublic,
  type QuizQuestion,
  type RoomGame,
  type RoomSettings,
  type RoomState,
  type ServerMsg,
  type Trap,
  type TurnKind,
} from '@julaika/shared';
import { Agents } from './agents';
import { Alibi } from './alibi';
import { Bombe } from './bombe';
import { Cadavre } from './cadavre';
import { Cerveau } from './cerveau';
import { Connait } from './connait';
import { Flash } from './flash';
import { Fredonne } from './fredonne';
import type { DareGenerator, PairGenerator, QuizGenerator, WordGenerator } from './deepseek';
import { Interdits } from './interdits';
import { Intrus } from './intrus';
import { MotAMot } from './motamot';
import { INTRUS_PAIRS } from './intrusPairs';
import { PetitBac } from './petitbac';
import { Photomaton } from './photomaton';
import { Quiz } from './quiz';
import { Pitch } from './pitch';
import { Sourire } from './sourire';
import { BrasDeFer } from './brasdefer';
import { Telephone } from './telephone';
import { ActionVerite } from './verite';
import { Wavelength } from './wavelength';
import { MIME_FR, WORDS_FR } from './words';

export interface Conn {
  send(data: string | ArrayBuffer | Uint8Array): void;
}

interface Player {
  id: string;
  name: string;
  avatar: number;
  score: number;
  guessed: boolean;
  turnGain: number;
  conn: Conn;
  inCall: boolean;
  cam: boolean;
  mic: boolean;
}

export const CHOOSE_TIME = 15;
/** Fin de tour : le temps du mot révélé, du ralenti du dessin et des gains. */
export const TURN_END_TIME = 8;
/** Mode « parfois » : environ un tour sur trois est piégé. */
export const TRAP_CHANCE = 0.35;
export const GAME_END_TIME = 12;
const MAX_STROKE_BYTES = 2_000_000;
/** Mots demandés à l'IA par appel, et nombre de mots déjà proposés qu'on lui demande d'éviter. */
export const WORD_BATCH = 30;
const AVOID_MAX = 60;

let nextId = 1;

/**
 * Une partie. Le serveur est autoritaire : il tient le mot, les minuteurs, les scores
 * et l'historique des traits (pour les joueurs qui arrivent en cours de tour).
 */
export class Room {
  readonly code: string;
  readonly players = new Map<string, Player>();
  settings: RoomSettings = { ...DEFAULT_SETTINGS };
  phase: Phase = 'lobby';
  hostId: string | null = null;
  round = 0;
  drawerId: string | null = null;
  turnKind: TurnKind = 'draw';
  word: string | null = null;
  endsAt: number | null = null;
  meetUrl = '';
  /** Jeu du salon, fixé à sa création. */
  game: RoomGame = 'dessin';

  /** Piège du tour en cours (manches piégées du Dessin). */
  trap: Trap | null = null;
  /** Consigne surprise du mime en cours. */
  twist: MimeTwist | null = null;

  private wave: Wavelength | null = null;
  private tel: Telephone | null = null;
  private intrus: Intrus | null = null;
  // Paires de L'Intrus générées par l'IA, et mots déjà sortis dans ce salon.
  private pairs: IntrusPair[] = [];
  private pairing = false;
  private usedPairs = new Set<string>();
  private bac: PetitBac | null = null;
  private connait: Connait | null = null;
  private bomb: Bombe | null = null;
  private agents: Agents | null = null;
  private photo: Photomaton | null = null;
  private sourire: Sourire | null = null;
  private bras: BrasDeFer | null = null;
  private flash: Flash | null = null;
  private cadavre: Cadavre | null = null;
  private interdits: Interdits | null = null;
  private mot: MotAMot | null = null;
  private fred: Fredonne | null = null;
  private alibi: Alibi | null = null;
  private pitch: Pitch | null = null;
  private cerveau: Cerveau | null = null;
  private aov: ActionVerite | null = null;
  private quiz: Quiz | null = null;
  // Questions du quiz commandées dès que l'hôte écrit son thème, pour ne pas attendre au lancement.
  private quizCache = new Map<string, Promise<QuizQuestion[] | null>>();
  // Cartes d'Action ou vérité inventées par l'IA, par niveau ; chacune ne sert qu'une fois.
  private dares: Record<AovHeat, Record<AovKind, string[]>> = {
    lite: { action: [], verite: [] },
    complice: { action: [], verite: [] },
    spicy: { action: [], verite: [] },
  };
  private daring = new Set<AovHeat>();
  private daresSeen: string[] = [];
  private choices: string[] = [];
  private drawQueue: string[] = [];
  private revealed = new Set<number>();
  private strokes: Uint8Array[][] = [];
  private strokeBytes = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private guessCount = 0;
  private usedWords = new Set<string>();
  // Stock de mots générés par l'IA, par type de tour et difficulté : chaque mot ne sert qu'une fois.
  private generated: Record<TurnKind, Record<Difficulty, string[]>> = {
    draw: { facile: [], moyen: [], difficile: [] },
    mime: { facile: [], moyen: [], difficile: [] },
  };
  private generating = new Set<string>();
  private offered: string[] = [];
  private lastTrap: Trap['kind'] | null = null;
  // Mime : trouvailles du tour qui attendent le polaroid du mimeur, et tirages de la partie.
  private pendingSnaps = new Set<string>();
  private shotCount = 0;
  private twistCount = 0;

  constructor(
    code: string,
    private readonly onEmpty: (room: Room) => void = () => {},
    private readonly random: () => number = Math.random,
    private readonly iceServers: (playerId: string) => IceServer[] = () => [],
    private readonly generateWords: WordGenerator | null = null,
    private readonly generatePairs: PairGenerator | null = null,
    private readonly generateDares: DareGenerator | null = null,
    private readonly generateQuiz: QuizGenerator | null = null,
  ) {
    this.code = code;
  }

  // ---- Cycle de vie des joueurs ----------------------------------------------

  join(conn: Conn, name: string, avatar: number): string | null {
    if (this.players.size >= this.settings.maxPlayers) return null;
    const id = `p${nextId++}`;
    const player: Player = {
      id,
      name: sanitizeName(name),
      avatar: Math.abs(Math.floor(avatar)) % 64,
      score: 0,
      guessed: false,
      turnGain: 0,
      conn,
      inCall: false,
      cam: false,
      mic: false,
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;

    this.sendTo(id, { t: 'welcome', selfId: id, state: this.stateFor(id), now: Date.now(), ice: this.iceServers(id) });
    for (const stroke of this.strokes) for (const packet of stroke) conn.send(packet);
    if (this.phase === 'choosing' && this.drawerId === id) this.sendTo(id, { t: 'choices', words: this.choices });
    this.tel?.onJoin(id);
    this.photo?.onJoin(id);
    this.flash?.onJoin(id);
    this.cadavre?.onJoin(id);
    this.agents?.onJoin(id);
    this.cerveau?.onJoin(id);
    this.system(`${player.name} a rejoint la partie.`);
    this.broadcastState(id);
    // Les mots sont commandés dès qu'une partie devient possible, pour être prêts au lancement.
    if (this.players.size >= 2) {
      this.refillWords();
      this.refillPairs();
      this.prefetchQuiz();
      this.refillDares();
    }
    return id;
  }

  leave(id: string): void {
    const player = this.players.get(id);
    if (!player) return;
    this.players.delete(id);
    this.drawQueue = this.drawQueue.filter((p) => p !== id);
    if (this.players.size === 0) {
      this.clearTimers();
      this.onEmpty(this);
      return;
    }
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;
    this.system(`${player.name} a quitté la partie.`);

    if (this.phase !== 'lobby' && this.players.size < 2) {
      this.system('Pas assez de joueurs, retour au salon.');
      this.toLobby();
      return;
    }
    if (this.wave || this.tel || this.intrus || this.bac || this.connait || this.bomb || this.photo || this.sourire || this.bras || this.flash || this.cadavre || this.interdits || this.mot || this.agents || this.fred || this.alibi || this.pitch || this.cerveau || this.aov || this.quiz) {
      this.wave?.onLeave(id);
      this.tel?.onLeave(id);
      this.intrus?.onLeave(id);
      this.bac?.onLeave(id);
      this.connait?.onLeave(id);
      this.bomb?.onLeave(id);
      this.photo?.onLeave(id);
      this.sourire?.onLeave(id);
      this.bras?.onLeave(id);
      this.flash?.onLeave(id);
      this.cadavre?.onLeave(id);
      this.interdits?.onLeave(id);
      this.mot?.onLeave(id);
      this.agents?.onLeave(id);
      this.fred?.onLeave(id);
      this.alibi?.onLeave(id);
      this.pitch?.onLeave(id);
      this.cerveau?.onLeave(id);
      this.aov?.onLeave(id);
      this.quiz?.onLeave(id);
      this.broadcastState();
      return;
    }
    if (this.drawerId === id && (this.phase === 'choosing' || this.phase === 'drawing')) {
      this.endTurn();
      return;
    }
    if (this.phase === 'drawing') this.checkAllGuessed();
    this.broadcastState();
  }

  // ---- Messages ---------------------------------------------------------------

  handle(id: string, msg: ClientMsg): void {
    const player = this.players.get(id);
    if (!player) return;
    switch (msg.t) {
      case 'settings':
        if (id === this.hostId && this.phase === 'lobby') {
          this.settings = mergeSettings(this.settings, msg.settings);
          this.broadcastState();
          if (this.players.size >= 2) {
            this.refillWords();
            this.refillDares();
          }
          this.prefetchQuiz();
        }
        break;
      case 'start':
        if (id === this.hostId && this.phase === 'lobby') this.startGame();
        break;
      case 'choose':
        if (id === this.drawerId && this.phase === 'choosing') this.chooseWord(msg.index);
        break;
      case 'chat':
        this.chat(player, msg.text);
        break;
      case 'wave':
        if (msg && typeof msg === 'object') this.wave?.handle(id, msg);
        break;
      case 'tel':
        if (msg && typeof msg === 'object') this.tel?.handle(id, msg);
        break;
      case 'intrus':
        if (msg && typeof msg === 'object') this.intrus?.handle(id, msg);
        break;
      case 'bac':
        if (msg && typeof msg === 'object') this.bac?.handle(id, msg);
        break;
      case 'connait':
        if (msg && typeof msg === 'object') this.connait?.handle(id, msg);
        break;
      case 'bomb':
        if (msg && typeof msg === 'object') this.bomb?.handle(id, msg);
        break;
      case 'photo':
        if (msg && typeof msg === 'object') this.photo?.handle(id, msg);
        break;
      case 'sourire':
        if (msg && typeof msg === 'object') this.sourire?.handle(id, msg);
        break;
      case 'aov':
        if (msg && typeof msg === 'object') this.aov?.handle(id, msg);
        break;
      case 'mimeShot':
        this.mimeShot(id, msg.finder, msg.image);
        break;
      case 'bras':
        if (msg && typeof msg === 'object') this.bras?.handle(id, msg);
        break;
      case 'flash':
        if (msg && typeof msg === 'object') this.flash?.handle(id, msg);
        break;
      case 'cadavre':
        if (msg && typeof msg === 'object') this.cadavre?.handle(id, msg);
        break;
      case 'interdits':
        if (msg && typeof msg === 'object') this.interdits?.handle(id, msg);
        break;
      case 'motamot':
        if (msg && typeof msg === 'object') this.mot?.handle(id, msg);
        break;
      case 'agents':
        if (msg && typeof msg === 'object') this.agents?.handle(id, msg);
        break;
      case 'fred':
        if (msg && typeof msg === 'object') this.fred?.handle(id, msg);
        break;
      case 'alibi':
        if (msg && typeof msg === 'object') this.alibi?.handle(id, msg);
        break;
      case 'pitch':
        if (msg && typeof msg === 'object') this.pitch?.handle(id, msg);
        break;
      case 'cerveau':
        if (msg && typeof msg === 'object') this.cerveau?.handle(id, msg);
        break;
      case 'quiz':
        if (msg && typeof msg === 'object') this.quiz?.handle(id, msg);
        break;
      case 'sound':
        // Boîte à sons, dans tous les jeux : l'émetteur l'a déjà joué chez lui.
        if (isSoundId(msg.id)) this.broadcast({ t: 'sound', id: msg.id, by: id }, id);
        break;
      case 'clear':
        if (this.tel) this.tel.clear(id);
        else if (this.flash) this.flash.clear(id);
        else if (this.cadavre) this.cadavre.clear(id);
        else if (this.cerveau) this.cerveau.clear(id);
        else if (this.isDrawing(id)) {
          this.strokes = [];
          this.strokeBytes = 0;
          this.broadcast({ t: 'clear' }, id);
        }
        break;
      case 'undo':
        if (this.tel) this.tel.undo(id);
        else if (this.flash) this.flash.undo(id);
        else if (this.cadavre) this.cadavre.undo(id);
        else if (this.cerveau) this.cerveau.undo(id);
        else if (this.isDrawing(id) && this.strokes.length) {
          const removed = this.strokes.pop()!;
          this.strokeBytes -= removed.reduce((n, p) => n + p.byteLength, 0);
          this.broadcast({ t: 'undo' }, id);
        }
        break;
      case 'meet':
        // L'hôte peut partager ou retirer le lien de visio à tout moment, même en pleine partie.
        if (id === this.hostId) {
          const url = parseMeetUrl(String(msg.url ?? ''));
          if (url === null) {
            this.sendTo(id, { t: 'error', message: 'Ce lien ne ressemble pas à un lien Google Meet (meet.google.com/abc-defg-hij).' });
          } else if (url !== this.meetUrl) {
            this.meetUrl = url;
            this.system(url ? `${player.name} a partagé une visio Google Meet.` : 'La visio a été retirée.');
            this.broadcastState();
          }
        }
        break;
      case 'call': {
        const inCall = Boolean(msg.inCall);
        if (inCall && !player.inCall && [...this.players.values()].filter((p) => p.inCall).length >= MAX_CALL) {
          this.sendTo(id, { t: 'error', message: `La visio est limitée à ${MAX_CALL} personnes.` });
          break;
        }
        player.inCall = inCall;
        player.cam = inCall && Boolean(msg.cam);
        player.mic = inCall && Boolean(msg.mic);
        this.broadcastState();
        break;
      }
      case 'rtc': {
        // Relais de signalisation, seulement entre deux participants de la visio du même salon.
        const target = this.players.get(String(msg.to));
        if (player.inCall && target?.inCall && target.id !== id && msg.data && typeof msg.data === 'object') {
          this.sendTo(target.id, { t: 'rtc', from: id, data: msg.data });
        }
        break;
      }
      case 'ping':
        this.sendTo(id, { t: 'pong', at: msg.at, now: Date.now() });
        break;
    }
  }

  /** Paquet de dessin binaire : validé, archivé puis relayé tel quel aux autres. */
  handleDraw(id: string, data: Uint8Array): void {
    if (this.tel) return this.tel.draw(id, data);
    if (this.flash) return this.flash.draw(id, data);
    if (this.cadavre) return this.cadavre.draw(id, data);
    if (this.cerveau) return this.cerveau.draw(id, data);
    if (!this.isDrawing(id)) return;
    const packet = decodeDraw(data);
    if (!packet) return;
    if (this.strokeBytes + data.byteLength > MAX_STROKE_BYTES) return;
    const copy = new Uint8Array(data);
    // Une seule couleur : tout ce qui n'est pas la gomme prend la couleur imposée.
    if (this.trap?.kind === 'mono' && packet.color !== 0) copy[1] = this.trap.color;
    if (packet.op === DrawOp.Extend) {
      const last = this.strokes.at(-1);
      if (!last) return;
      last.push(copy);
    } else {
      this.strokes.push([copy]);
    }
    this.strokeBytes += copy.byteLength;
    for (const [pid, p] of this.players) if (pid !== id) p.conn.send(copy);
  }

  private isDrawing(id: string): boolean {
    return this.phase === 'drawing' && this.drawerId === id && this.turnKind === 'draw';
  }

  // ---- Boucle de jeu ----------------------------------------------------------

  private startGame(): void {
    if (this.players.size < 2) {
      this.sendTo(this.hostId!, { t: 'error', message: 'Il faut au moins 2 joueurs.' });
      return;
    }
    for (const p of this.players.values()) p.score = 0;
    this.round = 0;
    if (this.game === 'wavelength') return this.startWave();
    if (this.game === 'telephone') return this.startTel();
    if (this.game === 'intrus') return this.startIntrus();
    if (this.game === 'petitbac') return this.startBac();
    if (this.game === 'connait') return this.startConnait();
    if (this.game === 'bombe') return this.startBomb();
    if (this.game === 'photomaton') return this.startPhoto();
    if (this.game === 'sourire') return this.startSourire();
    if (this.game === 'brasdefer') return this.startBras();
    if (this.game === 'flash') return this.startFlash();
    if (this.game === 'cadavre') return this.startCadavre();
    if (this.game === 'interdits') return this.startInterdits();
    if (this.game === 'motamot') return this.startMot();
    if (this.game === 'agents') return this.startAgents();
    if (this.game === 'fredonne') return this.startFred();
    if (this.game === 'alibi') return this.startAlibi();
    if (this.game === 'pitch') return this.startPitch();
    if (this.game === 'cerveau') return this.startCerveau();
    if (this.game === 'verite') return this.startAov();
    if (this.game === 'quiz') return this.startQuiz();
    this.usedWords.clear();
    this.shotCount = 0;
    this.nextRound();
  }

  private nextRound(): void {
    this.round++;
    if (this.round > this.settings.rounds) {
      this.endGame();
      return;
    }
    this.drawQueue = [...this.players.keys()];
    this.system(`Manche ${this.round} / ${this.settings.rounds}`);
    this.nextTurn();
  }

  private nextTurn(): void {
    this.clearTimers();
    const drawerId = this.drawQueue.shift();
    if (!drawerId) {
      this.nextRound();
      return;
    }
    this.drawerId = drawerId;
    this.word = null;
    this.revealed.clear();
    this.strokes = [];
    this.strokeBytes = 0;
    this.guessCount = 0;
    for (const p of this.players.values()) {
      p.guessed = false;
      p.turnGain = 0;
    }
    this.broadcast({ t: 'clear' });
    this.twist = null;
    this.pendingSnaps.clear();
    const { mode } = this.settings;
    this.turnKind = mode === 'mime' ? 'mime' : mode === 'mixte' && this.random() < 0.5 ? 'mime' : 'draw';
    // Les manches piégées touchent le crayon : rien à piéger quand on mime.
    this.trap = this.turnKind === 'draw' ? this.pickTrap() : null;
    this.phase = 'choosing';
    this.choices = this.pickWords(this.settings.wordChoices);
    this.endsAt = Date.now() + CHOOSE_TIME * 1000;
    this.sendTo(drawerId, { t: 'choices', words: this.choices });
    this.broadcastState();
    this.after(CHOOSE_TIME, () => this.chooseWord(Math.floor(this.random() * this.choices.length)));
  }

  private chooseWord(index: number): void {
    const word = this.choices[index] ?? this.choices[0];
    if (!word) return;
    this.clearTimers();
    this.word = word;
    this.usedWords.add(word);
    this.phase = 'drawing';
    const drawMs = this.settings.drawTime * 1000;
    this.endsAt = Date.now() + drawMs;

    // Indices répartis sur la seconde moitié du tour, jamais plus de la moitié des lettres.
    const letters = [...word].map((c, i) => (/[\p{L}\p{N}]/u.test(c) ? i : -1)).filter((i) => i >= 0);
    const hints = Math.min(this.settings.hints, Math.floor(letters.length / 2));
    for (let h = 1; h <= hints; h++) {
      const at = 0.5 + (0.4 * (h - 1)) / Math.max(1, hints - 1);
      this.afterMs(drawMs * at, () => this.revealLetter(letters));
    }
    this.afterMs(drawMs, () => this.endTurn());
    if (this.turnKind === 'mime' && this.settings.twists) {
      for (let at = MIME_TWIST_EVERY; at <= this.settings.drawTime - MIME_TWIST_MARGIN; at += MIME_TWIST_EVERY) {
        this.after(at, () => this.nextTwist());
      }
    }
    this.system(`${this.players.get(this.drawerId!)?.name} ${this.turnKind === 'mime' ? 'mime' : 'dessine'} !`);
    this.broadcastState();
  }

  /** Nouvelle consigne surprise pour le mimeur, jamais deux fois la même d'affilée. */
  private nextTwist(): void {
    const others = MIME_TWISTS.filter((t) => t.text !== this.twist?.text);
    const pick = others[Math.floor(this.random() * others.length)]!;
    this.twist = { n: ++this.twistCount, ...pick };
    this.broadcastState();
  }

  /** Polaroid envoyé par le mimeur pour une trouvaille du tour en cours. */
  private mimeShot(id: string, finder: unknown, image: unknown): void {
    if (id !== this.drawerId || this.turnKind !== 'mime' || typeof finder !== 'string' || !this.pendingSnaps.has(finder)) return;
    if (image !== null && !isPhotoDataUrl(image)) return;
    this.pendingSnaps.delete(finder);
    const mimer = this.players.get(id)!;
    const found = this.players.get(finder);
    if (!found || !this.word || this.shotCount >= MIME_MAX_SHOTS) return;
    this.broadcast({
      t: 'mimeShot',
      shot: {
        id: ++this.shotCount,
        round: this.round,
        word: this.word,
        mimerId: id,
        mimerName: mimer.name,
        finderId: finder,
        finderName: found.name,
        image,
        avatar: mimer.avatar,
      },
    });
  }

  private revealLetter(letters: number[]): void {
    const hidden = letters.filter((i) => !this.revealed.has(i));
    if (hidden.length <= 1) return;
    this.revealed.add(hidden[Math.floor(this.random() * hidden.length)]!);
    this.broadcastState();
  }

  private chat(player: Player, raw: string): void {
    const text = raw.trim().slice(0, 120);
    if (!text) return;
    if (this.interdits?.chat(player.id, text)) return;
    if (this.fred?.chat(player.id, text)) return;
    const line: ChatLine = { from: player.id, name: player.name, text, kind: 'msg' };

    const canGuess = this.phase === 'drawing' && this.word && player.id !== this.drawerId && !player.guessed;
    if (canGuess) {
      const result = checkGuess(text, this.word!);
      if (result === 'correct') return this.correctGuess(player);
      this.broadcast({ t: 'chat', line });
      if (result === 'close') {
        this.sendTo(player.id, { t: 'chat', line: { from: null, name: null, text: `« ${text} » : tu chauffes !`, kind: 'close' } });
      }
      return;
    }

    // Ceux qui ont trouvé (et le dessinateur) discutent entre eux pour ne rien dévoiler.
    const insider = this.phase === 'drawing' && (player.guessed || player.id === this.drawerId);
    if (insider) {
      line.kind = 'guessed';
      for (const p of this.players.values()) if (p.guessed || p.id === this.drawerId) this.sendTo(p.id, { t: 'chat', line });
      return;
    }
    this.broadcast({ t: 'chat', line });
  }

  private correctGuess(player: Player): void {
    const remaining = Math.max(0, (this.endsAt ?? 0) - Date.now()) / (this.settings.drawTime * 1000);
    // Rapidité + petit bonus pour les premiers.
    const gain = Math.round(50 + 400 * remaining + Math.max(0, 50 - this.guessCount * 10));
    this.guessCount++;
    player.guessed = true;
    player.turnGain = gain;
    player.score += gain;
    this.broadcast({ t: 'chat', line: { from: player.id, name: player.name, text: `${player.name} a trouvé le mot !`, kind: 'correct' } });
    // Mime : la caméra du mimeur tire un polaroid de l'instant.
    if (this.turnKind === 'mime' && this.drawerId) {
      this.pendingSnaps.add(player.id);
      this.sendTo(this.drawerId, { t: 'mimeSnap', finder: player.id });
    }
    this.checkAllGuessed();
    this.broadcastState();
  }

  private checkAllGuessed(): void {
    const guessers = [...this.players.values()].filter((p) => p.id !== this.drawerId);
    if (guessers.length && guessers.every((p) => p.guessed)) this.endTurn();
  }

  private endTurn(): void {
    if (this.phase !== 'choosing' && this.phase !== 'drawing') return;
    this.clearTimers();
    const drawer = this.drawerId ? this.players.get(this.drawerId) : undefined;
    const guessers = [...this.players.values()].filter((p) => p.id !== this.drawerId);
    if (drawer && guessers.length) {
      // Le dessinateur gagne selon la proportion de joueurs qui ont trouvé.
      drawer.turnGain = Math.round((300 * this.guessCount) / guessers.length);
      drawer.score += drawer.turnGain;
    }
    const gains: Record<string, number> = {};
    for (const p of this.players.values()) gains[p.id] = p.turnGain;

    this.phase = 'turnEnd';
    this.endsAt = Date.now() + TURN_END_TIME * 1000;
    this.broadcast({ t: 'turnEnd', word: this.word ?? '—', gains });
    this.broadcastState();
    this.after(TURN_END_TIME, () => this.nextTurn());
  }

  private startWave(): void {
    this.wave?.dispose();
    this.wave = new Wavelength({
      playerIds: () => [...this.players.keys()],
      name: (id) => this.players.get(id)?.name ?? '?',
      turnTime: () => this.settings.drawTime,
      rounds: () => this.settings.rounds,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    this.wave.start();
  }

  private startTel(): void {
    this.tel?.dispose();
    this.tel = new Telephone({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      isHost: (id) => id === this.hostId,
      drawTime: () => this.settings.drawTime,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      sendTo: (id, msg) => this.sendTo(id, msg),
      system: (text) => this.system(text),
      toLobby: () => this.toLobby(),
    });
    this.tel.start();
  }

  private startIntrus(): void {
    if (this.players.size < INTRUS_MIN_PLAYERS) {
      this.sendTo(this.hostId!, { t: 'error', message: `Il faut au moins ${INTRUS_MIN_PLAYERS} joueurs pour L'Intrus.` });
      return;
    }
    this.intrus?.dispose();
    this.intrus = new Intrus({
      playerIds: () => [...this.players.keys()],
      name: (id) => this.players.get(id)?.name ?? '?',
      rounds: () => this.settings.rounds,
      random: this.random,
      nextPair: () => this.nextPair(),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      error: (id, message) => this.sendTo(id, { t: 'error', message }),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
      toLobby: () => this.toLobby(),
    });
    this.intrus.start();
  }

  /** Paire suivante : celles de l'IA d'abord, sinon la liste intégrée, jamais deux fois le même mot. */
  private nextPair(): IntrusPair {
    const fresh = (p: IntrusPair) => !this.usedPairs.has(normalize(p.civil)) && !this.usedPairs.has(normalize(p.intrus));
    let pair = this.pairs.find(fresh);
    if (pair) this.pairs = this.pairs.filter((p) => p !== pair);
    else {
      const pool = INTRUS_PAIRS.filter(fresh);
      const from = pool.length ? pool : INTRUS_PAIRS;
      pair = from[Math.floor(this.random() * from.length)]!;
    }
    this.usedPairs.add(normalize(pair.civil));
    this.usedPairs.add(normalize(pair.intrus));
    // Une fois sur deux, les rôles des deux mots s'inversent : « plage » n'est pas toujours aux civils.
    const flip = this.random() < 0.5;
    this.refillPairs();
    return flip ? { civil: pair.intrus, intrus: pair.civil } : pair;
  }

  private refillPairs(): void {
    if (this.game !== 'intrus' || !this.generatePairs || this.pairing || this.pairs.length >= 6) return;
    this.pairing = true;
    this.generatePairs(12, [...this.usedPairs].slice(-AVOID_MAX))
      .then((pairs) => void (this.pairs = [...this.pairs, ...pairs]))
      .catch(() => {}) // la liste intégrée prend le relais
      .finally(() => (this.pairing = false));
  }

  private startBac(): void {
    this.bac?.dispose();
    this.bac = new PetitBac({
      playerIds: () => [...this.players.keys()],
      name: (id) => this.players.get(id)?.name ?? '?',
      isHost: (id) => id === this.hostId,
      fillTime: () => this.settings.drawTime,
      rounds: () => this.settings.rounds,
      random: this.random,
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    this.bac.start();
  }

  private startQuiz(): void {
    this.quiz?.dispose();
    const key = this.quizKey();
    const cached = this.quizCache.get(key);
    // Une partie consomme ses questions : la revanche sur le même thème en commandera d'autres.
    this.quizCache.delete(key);
    this.quiz = new Quiz({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      themes: () => parseQuizThemes(this.settings.quizTheme),
      count: () => this.settings.questions,
      random: this.random,
      generate: () => cached ?? this.orderQuiz(),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    void this.quiz.start();
  }

  private quizKey(): string {
    const { quizTheme, difficulty } = this.settings;
    return `${parseQuizThemes(quizTheme).map(normalize).join(',')}|${difficulty}`;
  }

  private orderQuiz(count = this.settings.questions): Promise<QuizQuestion[] | null> {
    if (!this.generateQuiz) return Promise.resolve(null);
    const { quizTheme, difficulty } = this.settings;
    return this.generateQuiz(parseQuizThemes(quizTheme), difficulty, count).catch(() => null);
  }

  /**
   * Commande les questions du thème et du niveau en cours, une fois par réglage (les trois derniers
   * restent en stock). Toujours le maximum : changer le nombre de questions ne relance rien.
   */
  private prefetchQuiz(): void {
    if (this.game !== 'quiz' || this.phase !== 'lobby' || this.players.size < 2 || !this.generateQuiz) return;
    const key = this.quizKey();
    if (this.quizCache.has(key)) return;
    this.quizCache.set(key, this.orderQuiz(SETTINGS_LIMITS.questions[1]));
    while (this.quizCache.size > 3) this.quizCache.delete(this.quizCache.keys().next().value!);
  }

  private startConnait(): void {
    this.connait?.dispose();
    this.connait = new Connait({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      random: this.random,
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    this.connait.start();
  }

  private startBomb(): void {
    this.bomb?.dispose();
    this.bomb = new Bombe({
      playerIds: () => [...this.players.keys()],
      name: (id) => this.players.get(id)?.name ?? '?',
      lives: () => this.settings.rounds,
      difficulty: () => this.settings.difficulty,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      endGame: () => this.endGame(),
    });
    this.bomb.start();
  }

  private startPhoto(): void {
    this.photo?.dispose();
    this.photo = new Photomaton({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      random: this.random,
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      sendTo: (id, msg) => this.sendTo(id, msg),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    this.photo.start();
  }

  private startSourire(): void {
    this.sourire?.dispose();
    this.sourire = new Sourire({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      endGame: () => this.endGame(),
    });
    this.sourire.start();
  }

  private startBras(): void {
    this.bras?.dispose();
    this.bras = new BrasDeFer({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      endGame: () => this.endGame(),
    });
    this.bras.start();
  }

  private startFlash(): void {
    this.flash?.dispose();
    this.flash = new Flash({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      random: this.random,
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      sendTo: (id, msg) => this.sendTo(id, msg),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    this.flash.start();
  }

  private startCadavre(): void {
    this.cadavre?.dispose();
    this.cadavre = new Cadavre({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      isHost: (id) => id === this.hostId,
      drawTime: () => this.settings.drawTime,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      sendTo: (id, msg) => this.sendTo(id, msg),
      system: (text) => this.system(text),
      toLobby: () => this.toLobby(),
    });
    this.cadavre.start();
  }

  private startInterdits(): void {
    this.interdits?.dispose();
    this.interdits = new Interdits({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      turnTime: () => this.settings.drawTime,
      difficulty: () => this.settings.difficulty,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      sendTo: (id, msg) => this.sendTo(id, msg),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score = Math.max(0, p.score + points);
      },
      endGame: () => this.endGame(),
    });
    this.interdits.start();
  }

  private startMot(): void {
    this.mot?.dispose();
    this.mot = new MotAMot({
      playerIds: () => [...this.players.keys()],
      name: (id) => this.players.get(id)?.name ?? '?',
      rounds: () => this.settings.rounds,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      endGame: () => this.endGame(),
    });
    this.mot.start();
  }

  private startAgents(): void {
    this.agents?.dispose();
    this.agents = new Agents({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      turnTime: () => this.settings.drawTime,
      random: this.random,
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    this.agents.start();
  }

  private startFred(): void {
    this.fred?.dispose();
    this.fred = new Fredonne({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      humTime: () => this.settings.drawTime,
      difficulty: () => this.settings.difficulty,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      setGuessed: (id) => {
        for (const p of this.players.values()) if (id === null || p.id === id) p.guessed = id !== null;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      sendTo: (id, msg) => this.sendTo(id, msg),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      endGame: () => this.endGame(),
    });
    this.fred.start();
  }

  private startAlibi(): void {
    if (this.players.size < ALIBI_MIN_PLAYERS) {
      this.sendTo(this.hostId!, { t: 'error', message: `Il faut au moins ${ALIBI_MIN_PLAYERS} joueurs pour L'Alibi.` });
      return;
    }
    this.alibi?.dispose();
    this.alibi = new Alibi({
      playerIds: () => [...this.players.keys()],
      name: (id) => this.players.get(id)?.name ?? '?',
      rounds: () => this.settings.rounds,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      endGame: () => this.endGame(),
    });
    this.alibi.start();
  }

  private startPitch(): void {
    this.pitch?.dispose();
    this.pitch = new Pitch({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      rounds: () => this.settings.rounds,
      random: this.random,
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      endGame: () => this.endGame(),
    });
    this.pitch.start();
  }

  private startCerveau(): void {
    this.cerveau?.dispose();
    this.cerveau = new Cerveau({
      playerIds: () => [...this.players.keys()],
      isHost: (id) => id === this.hostId,
      rounds: () => this.settings.rounds,
      drawTime: () => this.settings.drawTime,
      mode: () => this.settings.cerveau,
      random: this.random,
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      broadcast: (msg, except) => this.broadcast(msg, except),
      relay: (data, except) => {
        for (const [pid, p] of this.players) if (pid !== except) p.conn.send(data);
      },
      sendRaw: (to, data) => this.players.get(to)?.conn.send(data),
      system: (text) => this.system(text),
      toLobby: () => this.toLobby(),
    });
    this.cerveau.start();
  }

  private startAov(): void {
    this.aov?.dispose();
    this.aov = new ActionVerite({
      playerIds: () => [...this.players.keys()],
      player: (id) => this.players.get(id),
      hostId: () => this.hostId,
      rounds: () => this.settings.rounds,
      level: () => this.settings.aovLevel,
      dareTime: () => this.settings.drawTime,
      random: this.random,
      aiCard: (heat, kind) => {
        const card = this.dares[heat][kind].shift() ?? null;
        this.refillDares();
        return card;
      },
      addScore: (id, points) => {
        const p = this.players.get(id);
        if (p) p.score += points;
      },
      setPhase: (phase, endsAt, round) => {
        this.phase = phase;
        this.endsAt = endsAt;
        this.round = round;
      },
      broadcastState: () => this.broadcastState(),
      system: (text) => this.system(text),
      endGame: () => this.endGame(),
    });
    this.aov.start();
  }

  /** Commande des cartes à l'IA pour chaque niveau que le réglage peut tirer, quand le stock baisse. */
  private refillDares(): void {
    if (this.game !== 'verite' || !this.generateDares) return;
    const level = this.settings.aovLevel;
    const heats: AovHeat[] = level === 'crescendo' ? ['lite', 'complice', 'spicy'] : [level];
    for (const heat of heats) {
      const stock = this.dares[heat];
      if (this.daring.has(heat) || Math.min(stock.action.length, stock.verite.length) >= 3) continue;
      this.daring.add(heat);
      this.generateDares(heat, 8, [...stock.action, ...stock.verite, ...this.daresSeen].slice(-AVOID_MAX))
        .then((cards) => {
          for (const kind of ['action', 'verite'] as const) {
            stock[kind] = [...stock[kind], ...cards[kind]];
            this.daresSeen = [...this.daresSeen, ...cards[kind]].slice(-AVOID_MAX);
          }
        })
        .catch(() => {}) // les cartes écrites à la main prennent le relais
        .finally(() => this.daring.delete(heat));
    }
  }

  private endGame(): void {
    this.clearTimers();
    this.phase = 'gameEnd';
    this.drawerId = null;
    this.turnKind = 'draw';
    this.trap = null;
    this.twist = null;
    this.word = null;
    this.endsAt = Date.now() + GAME_END_TIME * 1000;
    const ranking = this.publicPlayers().sort((a, b) => b.score - a.score);
    this.broadcast({ t: 'gameEnd', ranking });
    this.broadcastState();
    this.after(GAME_END_TIME, () => this.toLobby());
  }

  private toLobby(): void {
    this.clearTimers();
    this.wave?.dispose();
    this.wave = null;
    this.tel?.dispose();
    this.tel = null;
    this.intrus?.dispose();
    this.intrus = null;
    this.bac?.dispose();
    this.bac = null;
    this.connait?.dispose();
    this.connait = null;
    this.bomb?.dispose();
    this.bomb = null;
    this.photo?.dispose();
    this.photo = null;
    this.sourire?.dispose();
    this.sourire = null;
    this.bras?.dispose();
    this.bras = null;
    this.flash?.dispose();
    this.flash = null;
    this.cadavre?.dispose();
    this.cadavre = null;
    this.interdits?.dispose();
    this.interdits = null;
    // Gardé jusqu'ici pour le recueil de la fin de partie.
    this.mot?.dispose();
    this.mot = null;
    this.agents?.dispose();
    this.agents = null;
    this.fred?.dispose();
    this.fred = null;
    this.alibi?.dispose();
    this.alibi = null;
    this.pitch?.dispose();
    this.pitch = null;
    this.cerveau?.dispose();
    this.cerveau = null;
    this.aov?.dispose();
    this.aov = null;
    this.quiz?.dispose();
    this.quiz = null;
    this.phase = 'lobby';
    this.round = 0;
    this.drawerId = null;
    this.turnKind = 'draw';
    this.word = null;
    this.trap = null;
    this.twist = null;
    this.endsAt = null;
    this.strokes = [];
    this.strokeBytes = 0;
    for (const p of this.players.values()) p.guessed = false;
    this.broadcast({ t: 'clear' });
    this.broadcastState();
  }

  /** Tire le piège du tour selon le réglage, sans retomber deux fois de suite sur le même. */
  private pickTrap(): Trap | null {
    const mode = this.settings.traps;
    if (mode === 'jamais' || (mode === 'parfois' && this.random() >= TRAP_CHANCE)) return null;
    const kinds = TRAPS.filter((k) => k !== this.lastTrap);
    const kind = kinds[Math.floor(this.random() * kinds.length)] ?? TRAPS[0];
    this.lastTrap = kind;
    return { kind, color: TRAP_COLORS[Math.floor(this.random() * TRAP_COLORS.length)] ?? 12 };
  }

  private pickWords(n: number): string[] {
    const { customWords: custom, customOnly, difficulty } = this.settings;
    const kind = this.turnKind;
    // Mots de l'IA s'il en reste assez, sinon la liste intégrée de la même difficulté.
    const generated = this.generated[kind][difficulty].filter((w) => !this.usedWords.has(w));
    const base = generated.length >= n ? generated : (kind === 'mime' ? MIME_FR : WORDS_FR)[difficulty];
    const pool = customOnly && custom.length >= n ? custom : [...base, ...custom];
    const fresh = pool.filter((w) => !this.usedWords.has(w));
    const source = fresh.length >= n ? fresh : pool;
    // Fisher-Yates partiel : n tirages sans remise, sans boucle infinie.
    const bag = [...new Set(source)];
    const count = Math.min(n, bag.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(this.random() * (bag.length - i));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    const picked = bag.slice(0, count);
    this.generated[kind][difficulty] = generated.filter((w) => !picked.includes(w));
    this.offered = [...this.offered, ...picked].slice(-AVOID_MAX);
    this.refillWords();
    return picked;
  }

  /** Types de tour que le mode de jeu peut tirer. */
  private turnKinds(): TurnKind[] {
    const { mode } = this.settings;
    return mode === 'mixte' ? ['draw', 'mime'] : mode === 'mime' ? ['mime'] : ['draw'];
  }

  /** Recommande des mots à l'IA quand le stock de la difficulté choisie descend sous trois tours. */
  private refillWords(): void {
    const { difficulty, customOnly, customWords, wordChoices } = this.settings;
    if (!this.generateWords || this.game !== 'dessin') return;
    if (customOnly && customWords.length >= wordChoices) return;
    for (const kind of this.turnKinds()) {
      const key = `${kind}:${difficulty}`;
      const stock = this.generated[kind];
      if (this.generating.has(key) || stock[difficulty].length >= wordChoices * 3) continue;
      this.generating.add(key);
      const avoid = [...new Set([...stock[difficulty], ...this.offered])];
      this.generateWords(difficulty, WORD_BATCH, avoid, kind)
        .then((words) => {
          stock[difficulty] = [...new Set([...stock[difficulty], ...words])];
        })
        .catch(() => {}) // déjà signalé par le générateur ; les listes intégrées prennent le relais
        .finally(() => this.generating.delete(key));
    }
  }

  // ---- Diffusion --------------------------------------------------------------

  publicPlayers(): PlayerPublic[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      isHost: p.id === this.hostId,
      guessed: p.guessed,
      connected: true,
      inCall: p.inCall,
      cam: p.cam,
      mic: p.mic,
    }));
  }

  stateFor(id: string): RoomState {
    let hint: string | null = null;
    if (this.word) {
      const p = this.players.get(id);
      hint = id === this.drawerId || p?.guessed ? this.word : maskWord(this.word, this.revealed);
    }
    return {
      code: this.code,
      game: this.game,
      phase: this.phase,
      settings: this.settings,
      players: this.publicPlayers(),
      drawerId: this.drawerId,
      turnKind: this.turnKind,
      round: this.round,
      endsAt: this.endsAt,
      hint,
      trap: this.trap,
      twist: this.twist,
      meetUrl: this.meetUrl,
      wave: this.wave?.stateFor(id) ?? null,
      tel: this.tel?.state() ?? null,
      intrus: this.intrus?.stateFor(id) ?? null,
      bac: this.bac?.state() ?? null,
      connait: this.connait?.stateFor(id) ?? null,
      bomb: this.bomb?.state() ?? null,
      photo: this.photo?.state() ?? null,
      sourire: this.sourire?.stateFor(id) ?? null,
      bras: this.bras?.stateFor(id) ?? null,
      flash: this.flash?.state() ?? null,
      cadavre: this.cadavre?.state() ?? null,
      interdits: this.interdits?.stateFor(id) ?? null,
      motamot: this.mot?.state() ?? null,
      agents: this.agents?.stateFor(id) ?? null,
      fred: this.fred?.stateFor(id) ?? null,
      alibi: this.alibi?.stateFor(id) ?? null,
      pitch: this.pitch?.stateFor() ?? null,
      cerveau: this.cerveau?.stateFor(id) ?? null,
      aov: this.aov?.state() ?? null,
      quiz: this.quiz?.stateFor(id) ?? null,
    };
  }

  private broadcastState(except?: string): void {
    for (const id of this.players.keys()) if (id !== except) this.sendTo(id, { t: 'state', state: this.stateFor(id) });
  }

  private broadcast(msg: ServerMsg, except?: string): void {
    const data = JSON.stringify(msg);
    for (const [id, p] of this.players) if (id !== except) p.conn.send(data);
  }

  private sendTo(id: string, msg: ServerMsg): void {
    this.players.get(id)?.conn.send(JSON.stringify(msg));
  }

  private system(text: string): void {
    this.broadcast({ t: 'chat', line: { from: null, name: null, text, kind: 'system' } });
  }

  private after(seconds: number, fn: () => void): void {
    this.afterMs(seconds * 1000, fn);
  }

  private afterMs(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  dispose(): void {
    this.clearTimers();
    this.wave?.dispose();
    this.tel?.dispose();
    this.intrus?.dispose();
    this.bac?.dispose();
    this.connait?.dispose();
    this.bomb?.dispose();
    this.photo?.dispose();
    this.sourire?.dispose();
    this.bras?.dispose();
    this.flash?.dispose();
    this.cadavre?.dispose();
    this.interdits?.dispose();
    this.mot?.dispose();
    this.agents?.dispose();
    this.fred?.dispose();
    this.alibi?.dispose();
    this.pitch?.dispose();
    this.cerveau?.dispose();
    this.aov?.dispose();
    this.quiz?.dispose();
  }
}

function sanitizeName(name: string): string {
  const clean = String(name ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 20);
  return clean || `Artiste${Math.floor(Math.random() * 1000)}`;
}

function mergeSettings(cur: RoomSettings, patch: Partial<RoomSettings>): RoomSettings {
  const next = { ...cur };
  for (const key of Object.keys(SETTINGS_LIMITS) as (keyof typeof SETTINGS_LIMITS)[]) {
    const v = patch[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const [min, max] = SETTINGS_LIMITS[key];
      next[key] = Math.max(min, Math.min(max, Math.round(v)));
    }
  }
  if (Array.isArray(patch.customWords)) {
    next.customWords = [...new Set(patch.customWords.map((w) => String(w).trim().slice(0, 30)).filter(Boolean))].slice(0, 500);
  }
  if (typeof patch.customOnly === 'boolean') next.customOnly = patch.customOnly;
  if (isDifficulty(patch.difficulty)) next.difficulty = patch.difficulty;
  if (isGameMode(patch.mode)) next.mode = patch.mode;
  if (isTrapMode(patch.traps)) next.traps = patch.traps;
  if (typeof patch.quizTheme === 'string') next.quizTheme = patch.quizTheme.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, QUIZ_THEME_MAX);
  if (typeof patch.twists === 'boolean') next.twists = patch.twists;
  if (isCerveauMode(patch.cerveau)) next.cerveau = patch.cerveau;
  if (isAovLevel(patch.aovLevel)) next.aovLevel = patch.aovLevel;
  return next;
}
