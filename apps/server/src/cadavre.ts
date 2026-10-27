import {
  CAD_NAME_MAX,
  CAD_PARTS,
  cadCreatureFor,
  cadJoinStrokes,
  cadRandomName,
  cadWinner,
  type CadavreState,
  type CadName,
  type ClientMsg,
  type Creature,
  type Phase,
  type ServerMsg,
} from '@julaika/shared';
import { Sketches } from './sketches';

/** Ce dont le jeu a besoin du salon : les joueurs, l'hôte, la diffusion et la phase commune. */
export interface CadavreHost {
  playerIds(): string[];
  player(id: string): { name: string; avatar: number } | undefined;
  isHost(id: string): boolean;
  /** Temps laissé pour dessiner un morceau (s). */
  drawTime(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  sendTo(id: string, msg: ServerMsg): void;
  system(text: string): void;
  toLobby(): void;
}

type CadavreMsg = Extract<ClientMsg, { t: 'cadavre' }>;
interface Seat {
  id: string;
  name: string;
  avatar: number;
}

/**
 * Une partie de Cadavre exquis. Chaque joueur commence une créature par sa tête ; à chaque
 * morceau, elle passe au voisin, qui ne voit que la bande de jonction du morceau d'au-dessus.
 * À deux, on alterne : tête et jambes pour l'un, corps pour l'autre. Puis on dévoile chaque
 * créature et on vote pour son nom.
 */
export class Cadavre {
  phase: 'draw' | 'reveal' = 'draw';
  step = 0;
  readonly seats: Seat[];
  readonly creatures: Creature[];
  readonly done = new Set<string>();
  reveal: number | null = null;
  names: CadName[] = [];
  readonly titles: (string | null)[];

  private sketches = new Sketches();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: CadavreHost) {
    this.seats = host.playerIds().map((id) => ({ id, name: host.player(id)?.name ?? '?', avatar: host.player(id)?.avatar ?? 0 }));
    this.creatures = this.seats.map((s) => ({ owner: s.id, pieces: [] }));
    this.titles = this.seats.map(() => null);
  }

  start(): void {
    this.host.system(`Cadavre exquis : ${this.seats.length} créatures à assembler, en commençant par la tête.`);
    this.startStep(0);
  }

  handle(id: string, msg: CadavreMsg): void {
    if (this.phase === 'reveal') {
      if ('next' in msg && this.host.isHost(id)) this.nextCreature();
      else if ('name' in msg) this.propose(id, msg.name);
      else if ('heart' in msg) this.heart(id, String(msg.heart));
      return;
    }
    if (this.seatIndex(id) < 0) return;
    if ('done' in msg) this.markDone(id);
    else if ('edit' in msg && this.done.delete(id)) this.host.broadcastState();
  }

  /** Paquet de dessin d'un joueur : gardé pour sa créature, jamais relayé. */
  draw(id: string, data: Uint8Array): void {
    if (this.canDraw(id)) this.sketches.draw(id, data);
  }

  undo(id: string): void {
    if (this.canDraw(id)) this.sketches.undo(id);
  }

  clear(id: string): void {
    if (this.canDraw(id)) this.sketches.clear(id);
  }

  /** Un joueur arrive en cours de partie : il regarde, et voit les créatures si elles sont dévoilées. */
  onJoin(id: string): void {
    if (this.phase === 'reveal') this.host.sendTo(id, { t: 'creatures', creatures: this.creatures });
  }

  /** Retour après une coupure : on lui redonne la bande du morceau d'au-dessus. */
  onResume(id: string): void {
    const i = this.seats.findIndex((s) => s.id === id);
    if (i < 0 || this.phase !== 'draw') return;
    this.host.sendTo(id, this.promptAt(i));
  }

  /** Un joueur part : son morceau sera rendu tel quel à la fin du temps, on n'attend plus que les présents. */
  onLeave(_id: string): void {
    this.checkAllDone();
  }

  state(): CadavreState {
    return {
      step: this.step,
      players: this.seats.map((s) => s.id),
      done: [...this.done],
      reveal: this.reveal,
      names: this.names,
      titles: this.titles,
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
    const seconds = this.host.drawTime();
    this.host.setPhase('draw', Date.now() + seconds * 1000, step + 1);
    this.seats.forEach((s, i) => this.host.sendTo(s.id, this.promptAt(i)));
    // Une seconde de grâce : le dernier trait envoyé au gong arrive à temps.
    this.timers.push(setTimeout(() => this.endStep(), (seconds + 1) * 1000));
    this.host.broadcastState();
  }

  private promptAt(i: number): ServerMsg {
    const above = this.step === 0 ? null : this.creatureAt(i).pieces[this.step - 1];
    return { t: 'cadPrompt', step: this.step, above: above ? { name: above.name, strokes: cadJoinStrokes(above.strokes) } : null };
  }

  private endStep(): void {
    this.clearTimers();
    this.seats.forEach((s, i) => {
      this.creatureAt(i).pieces[this.step] = { by: s.id, name: s.name, avatar: s.avatar, strokes: this.sketches.strokesOf(s.id) };
    });
    if (this.step + 1 < CAD_PARTS.length) return this.startStep(this.step + 1);

    this.phase = 'reveal';
    this.done.clear();
    this.reveal = 0;
    this.names = [];
    this.host.setPhase('reveal', null, CAD_PARTS.length);
    for (const id of this.host.playerIds()) this.host.sendTo(id, { t: 'creatures', creatures: this.creatures });
    this.host.system('Les créatures sont assemblées : place au dévoilement !');
    this.host.broadcastState();
  }

  /** Un nom proposé pour la créature affichée : un par joueur, le nouveau remplace l'ancien. */
  private propose(id: string, raw: unknown): void {
    if (!this.onCreature()) return;
    const text = String(raw ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CAD_NAME_MAX);
    if (!text) return;
    const mine = this.names.find((n) => n.by === id);
    if (mine) {
      if (mine.text === text) return;
      mine.text = text;
      mine.hearts = [];
    } else this.names.push({ by: id, text, hearts: [] });
    this.host.broadcastState();
  }

  /** Un cœur pour le nom d'un autre : un seul par joueur, donné ailleurs il change de nom. */
  private heart(id: string, author: string): void {
    if (!this.onCreature() || author === id) return;
    const target = this.names.find((n) => n.by === author);
    if (!target) return;
    const had = target.hearts.includes(id);
    for (const n of this.names) n.hearts = n.hearts.filter((h) => h !== id);
    if (!had) target.hearts.push(id);
    this.host.broadcastState();
  }

  /** L'hôte passe à la suite : le nom gagnant est gravé, puis créature suivante, bestiaire, salon. */
  private nextCreature(): void {
    const i = this.reveal!;
    if (i >= this.creatures.length) return this.host.toLobby();
    this.titles[i] = cadWinner(this.names)?.text ?? cadRandomName(() => this.host.random());
    this.reveal = i + 1;
    this.names = [];
    if (this.reveal === this.creatures.length) this.host.system('Voici le bestiaire au complet !');
    this.host.broadcastState();
  }

  private onCreature(): boolean {
    return this.reveal !== null && this.reveal < this.creatures.length;
  }

  private markDone(id: string): void {
    this.done.add(id);
    this.host.broadcastState();
    this.checkAllDone();
  }

  private checkAllDone(): void {
    if (this.phase !== 'draw') return;
    const present = new Set(this.host.playerIds());
    if (this.seats.every((s) => !present.has(s.id) || this.done.has(s.id))) this.endStep();
  }

  private canDraw(id: string): boolean {
    return this.phase === 'draw' && this.seatIndex(id) >= 0 && !this.done.has(id);
  }

  private seatIndex(id: string): number {
    return this.seats.findIndex((s) => s.id === id);
  }

  private creatureAt(seat: number): Creature {
    return this.creatures[cadCreatureFor(seat, this.step, this.seats.length)]!;
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
