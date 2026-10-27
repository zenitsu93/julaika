import {
  DEFAULT_SETTINGS,
  DrawOp,
  SETTINGS_LIMITS,
  checkGuess,
  decodeDraw,
  maskWord,
  type ChatLine,
  type ClientMsg,
  type Phase,
  type PlayerPublic,
  type RoomSettings,
  type RoomState,
  type ServerMsg,
} from '@julaika/shared';
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
}

export const CHOOSE_TIME = 15;
export const TURN_END_TIME = 6;
export const GAME_END_TIME = 12;
const MAX_STROKE_BYTES = 2_000_000;

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

  private choices: string[] = [];
  private drawQueue: string[] = [];
  private revealed = new Set<number>();
  private strokes: Uint8Array[][] = [];
  private strokeBytes = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private guessCount = 0;
  private usedWords = new Set<string>();

  constructor(
    code: string,
    private readonly onEmpty: (room: Room) => void = () => {},
    private readonly random: () => number = Math.random,
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
    };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;

    this.sendTo(id, { t: 'welcome', selfId: id, state: this.stateFor(id), now: Date.now() });
    for (const stroke of this.strokes) for (const packet of stroke) conn.send(packet);
    if (this.phase === 'choosing' && this.drawerId === id) this.sendTo(id, { t: 'choices', words: this.choices });
    this.system(`${player.name} a rejoint la partie.`);
    this.broadcastState(id);
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
      case 'clear':
        if (this.isDrawing(id)) {
          this.strokes = [];
          this.strokeBytes = 0;
          this.broadcast({ t: 'clear' }, id);
        }
        break;
      case 'undo':
        if (this.isDrawing(id) && this.strokes.length) {
          const removed = this.strokes.pop()!;
          this.strokeBytes -= removed.reduce((n, p) => n + p.byteLength, 0);
          this.broadcast({ t: 'undo' }, id);
        }
        break;
      case 'ping':
        this.sendTo(id, { t: 'pong', at: msg.at, now: Date.now() });
        break;
    }
  }

  /** Paquet de dessin binaire : validé, archivé puis relayé tel quel aux autres. */
  handleDraw(id: string, data: Uint8Array): void {
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
    const custom = this.settings.customWords;
    const pool = this.settings.customOnly && custom.length >= n ? custom : [...WORDS_FR, ...custom];
    const fresh = pool.filter((w) => !this.usedWords.has(w));
    const source = fresh.length >= n ? fresh : pool;
    // Fisher-Yates partiel : n tirages sans remise, sans boucle infinie.
    const bag = [...new Set(source)];
    const count = Math.min(n, bag.length);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(this.random() * (bag.length - i));
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    return bag.slice(0, count);
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
      phase: this.phase,
      settings: this.settings,
      players: this.publicPlayers(),
      drawerId: this.drawerId,
      round: this.round,
      endsAt: this.endsAt,
      hint,
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
  return next;
}
