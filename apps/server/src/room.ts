import {
  DEFAULT_SETTINGS,
  DrawOp,
  MAX_CALL,
  SETTINGS_LIMITS,
  checkGuess,
  decodeDraw,
  isDifficulty,
  maskWord,
  parseMeetUrl,
  type ChatLine,
  type ClientMsg,
  type Difficulty,
  type IceServer,
  type Phase,
  type PlayerPublic,
  type RoomGame,
  type RoomSettings,
  type RoomState,
  type ServerMsg,
} from '@julaika/shared';
import type { WordGenerator } from './deepseek';
import { Photomaton } from './photomaton';
import { Telephone } from './telephone';
import { Wavelength } from './wavelength';
import { WORDS_FR } from './words';

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
export const TURN_END_TIME = 6;
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
  word: string | null = null;
  endsAt: number | null = null;
  meetUrl = '';
  /** Jeu du salon, fixé à sa création. */
  game: RoomGame = 'dessin';

  private wave: Wavelength | null = null;
  private tel: Telephone | null = null;
  private photo: Photomaton | null = null;
  private choices: string[] = [];
  private drawQueue: string[] = [];
  private revealed = new Set<number>();
  private strokes: Uint8Array[][] = [];
  private strokeBytes = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private guessCount = 0;
  private usedWords = new Set<string>();
  // Stock de mots générés par l'IA, par difficulté : chaque mot ne sert qu'une fois.
  private generated: Record<Difficulty, string[]> = { facile: [], moyen: [], difficile: [] };
  private generating = new Set<Difficulty>();
  private offered: string[] = [];

  constructor(
    code: string,
    private readonly onEmpty: (room: Room) => void = () => {},
    private readonly random: () => number = Math.random,
    private readonly iceServers: (playerId: string) => IceServer[] = () => [],
    private readonly generateWords: WordGenerator | null = null,
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
    this.system(`${player.name} a rejoint la partie.`);
    this.broadcastState(id);
    // Les mots sont commandés dès qu'une partie devient possible, pour être prêts au lancement.
    if (this.players.size >= 2) this.refillWords();
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
    if (this.wave || this.tel || this.photo) {
      this.wave?.onLeave(id);
      this.tel?.onLeave(id);
      this.photo?.onLeave(id);
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
          if (this.players.size >= 2) this.refillWords();
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
      case 'photo':
        if (msg && typeof msg === 'object') this.photo?.handle(id, msg);
        break;
      case 'clear':
        if (this.tel) this.tel.clear(id);
        else if (this.isDrawing(id)) {
          this.strokes = [];
          this.strokeBytes = 0;
          this.broadcast({ t: 'clear' }, id);
        }
        break;
      case 'undo':
        if (this.tel) this.tel.undo(id);
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
    if (!this.isDrawing(id)) return;
    const packet = decodeDraw(data);
    if (!packet) return;
    if (this.strokeBytes + data.byteLength > MAX_STROKE_BYTES) return;
    const copy = new Uint8Array(data);
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
    return this.phase === 'drawing' && this.drawerId === id;
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
    if (this.game === 'photomaton') return this.startPhoto();
    this.usedWords.clear();
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
    this.system(`${this.players.get(this.drawerId!)?.name} dessine !`);
    this.broadcastState();
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

  private endGame(): void {
    this.clearTimers();
    this.phase = 'gameEnd';
    this.drawerId = null;
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
    this.photo?.dispose();
    this.photo = null;
    this.phase = 'lobby';
    this.round = 0;
    this.drawerId = null;
    this.word = null;
    this.endsAt = null;
    this.strokes = [];
    this.strokeBytes = 0;
    for (const p of this.players.values()) p.guessed = false;
    this.broadcast({ t: 'clear' });
    this.broadcastState();
  }

  private pickWords(n: number): string[] {
    const { customWords: custom, customOnly, difficulty } = this.settings;
    // Mots de l'IA s'il en reste assez, sinon la liste intégrée de la même difficulté.
    const generated = this.generated[difficulty].filter((w) => !this.usedWords.has(w));
    const base = generated.length >= n ? generated : WORDS_FR[difficulty];
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
    this.generated[difficulty] = generated.filter((w) => !picked.includes(w));
    this.offered = [...this.offered, ...picked].slice(-AVOID_MAX);
    this.refillWords();
    return picked;
  }

  /** Recommande des mots à l'IA quand le stock de la difficulté choisie descend sous trois tours. */
  private refillWords(): void {
    const { difficulty, customOnly, customWords, wordChoices } = this.settings;
    if (!this.generateWords || this.generating.has(difficulty)) return;
    if (customOnly && customWords.length >= wordChoices) return;
    if (this.generated[difficulty].length >= wordChoices * 3) return;
    this.generating.add(difficulty);
    const avoid = [...new Set([...this.generated[difficulty], ...this.offered])];
    this.generateWords(difficulty, WORD_BATCH, avoid)
      .then((words) => {
        this.generated[difficulty] = [...new Set([...this.generated[difficulty], ...words])];
      })
      .catch(() => {}) // déjà signalé par le générateur ; les listes intégrées prennent le relais
      .finally(() => this.generating.delete(difficulty));
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
      round: this.round,
      endsAt: this.endsAt,
      hint,
      meetUrl: this.meetUrl,
      wave: this.wave?.stateFor(id) ?? null,
      tel: this.tel?.state() ?? null,
      photo: this.photo?.state() ?? null,
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
    this.photo?.dispose();
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
  return next;
}
