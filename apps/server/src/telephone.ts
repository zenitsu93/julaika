import {
  TEL_PROMPTS,
  TEL_TEXT_MAX,
  TEL_WRITE_TIME,
  telChainFor,
  telKind,
  type ClientMsg,
  type DrawPacket,
  type Phase,
  type ServerMsg,
  type TelChain,
  type TelEntry,
  type TelState,
} from '@julaika/shared';
import { Sketches } from './sketches';

/** Ce dont le jeu a besoin du salon : les joueurs, l'hôte, la diffusion et la phase commune. */
export interface TelHost {
  playerIds(): string[];
  player(id: string): { name: string; avatar: number } | undefined;
  isHost(id: string): boolean;
  /** Temps laissé pour dessiner (s). */
  drawTime(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  sendTo(id: string, msg: ServerMsg): void;
  system(text: string): void;
  toLobby(): void;
}

type TelMsg = Extract<ClientMsg, { t: 'tel' }>;
interface Seat {
  id: string;
  name: string;
  avatar: number;
}

/**
 * Une partie de Téléphone dessiné. Chaque joueur ouvre une chaîne ; à chaque étape, elle passe
 * au voisin suivant, qui dessine la phrase reçue ou décrit le dessin reçu. Tous jouent en même
 * temps, et personne ne voit les chaînes avant l'album.
 */
export class Telephone {
  phase: 'write' | 'draw' | 'describe' | 'album' = 'write';
  step = 0;
  readonly steps: number;
  readonly seats: Seat[];
  readonly chains: TelChain[];
  readonly done = new Set<string>();
  album: { chain: number; entry: number } | null = null;

  private sketches = new Sketches();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: TelHost) {
    this.seats = host.playerIds().map((id) => ({ id, name: host.player(id)?.name ?? '?', avatar: host.player(id)?.avatar ?? 0 }));
    // Une étape par joueur : chaque chaîne passe une fois chez tout le monde.
    this.steps = this.seats.length;
    this.chains = this.seats.map((s) => ({ owner: s.id, name: s.name, avatar: s.avatar, entries: [] }));
  }

  start(): void {
    this.host.system(`Téléphone dessiné : ${this.steps} étapes, chacun écrit sa phrase de départ.`);
    this.startStep(0);
  }

  handle(id: string, msg: TelMsg): void {
    if ('next' in msg) {
      if (this.phase === 'album' && this.host.isHost(id)) this.nextPage();
      return;
    }
    const seat = this.seatIndex(id);
    if (seat < 0 || this.phase === 'album') return;
    if ('text' in msg) {
      if (this.phase === 'draw') return;
      const text = String(msg.text ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TEL_TEXT_MAX);
      if (!text) return;
      this.chainAt(seat).entries[this.step] = this.entry(seat, { kind: 'text', text });
      this.markDone(id);
    } else if ('done' in msg) {
      if (this.phase === 'draw') this.markDone(id);
    } else if ('edit' in msg) {
      if (this.done.delete(id)) this.host.broadcastState();
    }
  }

  /** Paquet de dessin d'un joueur : gardé pour sa chaîne, jamais relayé (c'est une surprise). */
  draw(id: string, data: Uint8Array): void {
    if (this.canDraw(id)) this.sketches.draw(id, data);
  }

  undo(id: string): void {
    if (this.canDraw(id)) this.sketches.undo(id);
  }

  clear(id: string): void {
    if (this.canDraw(id)) this.sketches.clear(id);
  }

  /** Un joueur arrive en cours de partie : il regarde, et voit l'album s'il est ouvert. */
  onJoin(id: string): void {
    if (this.phase === 'album') this.host.sendTo(id, { t: 'album', chains: this.chains });
  }

  /** Un joueur part : sa page sera remplie à la fin de l'étape, les autres n'attendent plus que les présents. */
  onLeave(_id: string): void {
    this.checkAllDone();
  }

  state(): TelState {
    return {
      step: this.step,
      steps: this.steps,
      kind: telKind(this.step),
      players: this.seats.map((s) => s.id),
      done: [...this.done],
      album: this.album,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private startStep(step: number): void {
    this.clearTimers();
    this.step = step;
    this.done.clear();
    this.sketches.clear();
    const kind = telKind(step);
    this.phase = kind;
    const seconds = kind === 'draw' ? this.host.drawTime() : TEL_WRITE_TIME;
    this.host.setPhase(kind, Date.now() + seconds * 1000, step + 1);
    this.seats.forEach((s, i) => {
      const prompt = step === 0 ? null : this.chainAt(i).entries[step - 1] ?? null;
      this.host.sendTo(s.id, { t: 'telPrompt', step, prompt });
    });
    // Une seconde de grâce : le brouillon envoyé au dernier moment arrive à temps.
    this.timers.push(setTimeout(() => this.endStep(), (seconds + 1) * 1000));
    this.host.broadcastState();
  }

  private endStep(): void {
    this.clearTimers();
    const kind = telKind(this.step);
    this.seats.forEach((_, i) => {
      const chain = this.chainAt(i);
      if (kind === 'draw') {
        chain.entries[this.step] = this.entry(i, { kind: 'drawing', strokes: this.sketches.strokesOf(this.seats[i]!.id) });
      } else if (!chain.entries[this.step]) {
        const text = kind === 'write' ? TEL_PROMPTS[Math.floor(this.host.random() * TEL_PROMPTS.length)]! : '… (pas de réponse)';
        chain.entries[this.step] = this.entry(i, { kind: 'text', text });
      }
    });
    if (this.step + 1 < this.steps) return this.startStep(this.step + 1);

    this.phase = 'album';
    this.done.clear();
    this.album = { chain: 0, entry: 0 };
    this.host.setPhase('album', null, this.steps);
    for (const id of this.host.playerIds()) this.host.sendTo(id, { t: 'album', chains: this.chains });
    this.host.system('Les chaînes sont prêtes : place à l’album !');
    this.host.broadcastState();
  }

  /** L'hôte tourne la page : étape suivante, chaîne suivante, puis retour au salon. */
  private nextPage(): void {
    const a = this.album!;
    const entries = this.chains[a.chain]!.entries.length;
    if (a.entry + 1 < entries) this.album = { chain: a.chain, entry: a.entry + 1 };
    else if (a.chain + 1 < this.chains.length) this.album = { chain: a.chain + 1, entry: 0 };
    else return this.host.toLobby();
    this.host.broadcastState();
  }

  private markDone(id: string): void {
    this.done.add(id);
    this.host.broadcastState();
    this.checkAllDone();
  }

  private checkAllDone(): void {
    if (this.phase === 'album') return;
    const present = new Set(this.host.playerIds());
    const waiting = this.seats.filter((s) => present.has(s.id) && !this.done.has(s.id));
    if (!waiting.length) this.endStep();
  }

  private canDraw(id: string): boolean {
    return this.phase === 'draw' && this.seatIndex(id) >= 0 && !this.done.has(id);
  }

  private seatIndex(id: string): number {
    return this.seats.findIndex((s) => s.id === id);
  }

  private chainAt(seat: number): TelChain {
    return this.chains[telChainFor(seat, this.step, this.seats.length)]!;
  }

  private entry(seat: number, body: { kind: 'text'; text: string } | { kind: 'drawing'; strokes: DrawPacket[] }): TelEntry {
    const s = this.seats[seat]!;
    return { ...body, by: s.id, name: s.name, avatar: s.avatar } as TelEntry;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
