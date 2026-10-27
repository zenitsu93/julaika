import {
  SOURIRE_DARES,
  SOURIRE_DUEL,
  SOURIRE_FACEOFF,
  SOURIRE_VERDICT,
  isWarpId,
  sourireGains,
  type ClientMsg,
  type Phase,
  type ServerMsg,
  type SourireResult,
  type SourireState,
  type WarpId,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface SourireHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  /** Duels par joueur : chacun défend `rounds` fois. */
  rounds(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  system(text: string): void;
  /** Ajoute des points au score d'un joueur du salon. */
  addScore(id: string, points: number): void;
  endGame(): void;
}

/** Appuis ignorés au début du duel : un double clic de la manche précédente ne compte pas. */
export const SOURIRE_GRACE_MS = 500;

type SourireMsg = Extract<ClientMsg, { t: 'sourire' }>;

/**
 * Une partie de Pas un sourire !. Les duels s'enchaînent dans un ordre figé au départ :
 * le défenseur du duel k est order[k], l'attaquant son voisin. N'importe qui peut siffler
 * le sourire ; sinon le défenseur tient jusqu'au bout et empoche tout.
 */
export class Sourire {
  phase: 'faceoff' | 'duel' | 'verdict' | 'done' = 'faceoff';
  turn = -1;
  readonly turns: number;
  readonly order: string[];
  defenderId = '';
  attackerId = '';
  dare: string | null = null;
  warp: WarpId | null = null;
  result: SourireResult | null = null;

  private duelStart = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: SourireHost) {
    this.order = host.playerIds();
    this.turns = Math.max(1, this.order.length * host.rounds());
  }

  start(): void {
    this.host.system(`Pas un sourire ! : ${this.turns} duels, interdit de craquer.`);
    this.nextDuel(0);
  }

  handle(id: string, msg: SourireMsg): void {
    if ('smiled' in msg) {
      if (this.phase !== 'duel' || !this.host.player(id)) return;
      const elapsed = Date.now() - this.duelStart;
      if (elapsed < SOURIRE_GRACE_MS) return;
      this.finish(true, id, Math.min(SOURIRE_DUEL, Math.floor(elapsed / 1000)));
    } else if ('dare' in msg) {
      if (id !== this.attackerId || (this.phase !== 'faceoff' && this.phase !== 'duel')) return;
      this.drawDare();
      this.host.broadcastState();
    } else if ('warp' in msg) {
      if (id !== this.attackerId || this.phase === 'done') return;
      const warp = msg.warp === null ? null : isWarpId(msg.warp) ? msg.warp : undefined;
      if (warp === undefined || warp === this.warp) return;
      this.warp = warp;
      this.host.broadcastState();
    }
  }

  /** Un duelliste part : son duel est clos sans points, on passe au suivant. */
  onLeave(id: string): void {
    if (this.phase !== 'faceoff' && this.phase !== 'duel') return;
    if (id !== this.defenderId && id !== this.attackerId) return;
    this.host.system('Un duelliste est parti : duel suivant.');
    this.nextDuel(this.turn + 1);
  }

  stateFor(id: string): SourireState {
    return {
      defenderId: this.defenderId,
      attackerId: this.attackerId,
      turn: this.turn,
      turns: this.turns,
      dare: id === this.attackerId ? this.dare : null,
      warp: this.warp,
      result: this.result,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  /** Premier duel jouable à partir de k : les duels d'un joueur parti sont sautés. */
  private nextDuel(k: number): void {
    this.clearTimers();
    const present = new Set(this.host.playerIds());
    const n = this.order.length;
    while (k < this.turns && !(present.has(this.order[k % n]!) && present.has(this.order[(k + 1) % n]!))) k++;
    if (k >= this.turns) {
      this.phase = 'done';
      this.host.endGame();
      return;
    }
    this.turn = k;
    this.defenderId = this.order[k % n]!;
    this.attackerId = this.order[(k + 1) % n]!;
    this.warp = null;
    this.result = null;
    this.drawDare();
    this.phase = 'faceoff';
    this.setPhase('faceoff', SOURIRE_FACEOFF);
    this.after(SOURIRE_FACEOFF, () => this.startDuel());
    this.host.broadcastState();
  }

  private startDuel(): void {
    this.clearTimers();
    this.phase = 'duel';
    this.duelStart = Date.now();
    this.setPhase('duel', SOURIRE_DUEL);
    this.after(SOURIRE_DUEL, () => this.finish(false, null, SOURIRE_DUEL));
    this.host.broadcastState();
  }

  private finish(smiled: boolean, by: string | null, held: number): void {
    if (this.phase !== 'duel') return;
    this.clearTimers();
    const pts = sourireGains(held, smiled);
    const gains: Record<string, number> = { [this.defenderId]: pts.defender, [this.attackerId]: pts.attacker };
    this.host.addScore(this.defenderId, pts.defender);
    this.host.addScore(this.attackerId, pts.attacker);
    this.result = { smiled, by, held, gains };
    const defender = this.name(this.defenderId);
    this.host.system(smiled ? `${this.name(this.attackerId)} a fait craquer ${defender} en ${held} s` : `${defender} a tenu ${SOURIRE_DUEL} s sans sourire !`);
    this.phase = 'verdict';
    this.setPhase('verdict', SOURIRE_VERDICT);
    this.after(SOURIRE_VERDICT, () => this.nextDuel(this.turn + 1));
    this.host.broadcastState();
  }

  /** Nouvelle consigne, jamais la même deux fois de suite. */
  private drawDare(): void {
    const prev = this.dare === null ? -1 : SOURIRE_DARES.indexOf(this.dare as (typeof SOURIRE_DARES)[number]);
    let i = Math.floor(this.host.random() * (SOURIRE_DARES.length - (prev < 0 ? 0 : 1)));
    if (prev >= 0 && i >= prev) i++;
    this.dare = SOURIRE_DARES[Math.min(i, SOURIRE_DARES.length - 1)]!;
  }

  private name(id: string): string {
    return this.host.player(id)?.name ?? '?';
  }

  private setPhase(phase: Phase, seconds: number): void {
    this.host.setPhase(phase, Date.now() + seconds * 1000, this.turn + 1);
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, seconds * 1000));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
