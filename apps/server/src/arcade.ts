import {
  ARCADE_COOP,
  ARCADE_DT,
  ARCADE_DURATION,
  ARCADE_FACEOFF,
  ARCADE_SEND_EVERY,
  ARCADE_VERDICT,
  KEY_MASK,
  arcadeGains,
  createSim,
  encodeFrame,
  type ArcadeEvent,
  type ArcadeKind,
  type ArcadeResult,
  type ArcadeSim,
  type ArcadeState,
  type ClientMsg,
  type Phase,
} from '@julaika/shared';

/** Ce dont un jeu d'action a besoin du salon. */
export interface ArcadeHost {
  playerIds(): string[];
  player(id: string): { name: string } | undefined;
  /** À deux, une partie par manche ; à plus, chacun joue avec son voisin à chaque manche. */
  rounds(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  /** Image binaire du monde, pour tout le salon (spectateurs compris). */
  sendFrame(frame: ArrayBuffer): void;
  sendEvents(ev: ArcadeEvent[]): void;
  system(text: string): void;
  addScore(id: string, points: number): void;
  /** Record du Drap tendu, gardé par le salon d'une partie à l'autre. */
  best(): number;
  setBest(score: number): void;
  endGame(): void;
}

type ArcadeMsg = Extract<ClientMsg, { t: 'arcade' }>;

/** Au plus 5 pas rattrapés d'un coup si la boucle a pris du retard (machine chargée). */
const MAX_CATCH_UP = 5;

const LABEL: Record<ArcadeKind, { win: string; ko: string }> = {
  foot: { win: 'remporte le match', ko: 'gagne 5 buts à' },
  oreillers: { win: 'remporte la bataille', ko: 'envoie l’autre trois fois au tapis :' },
  drap: { win: '', ko: '' },
};

/**
 * Une partie d'un jeu d'action. Le serveur est le seul juge : il fait tourner la physique à
 * 60 Hz avec les dernières touches reçues de chaque joueur, et diffuse le monde 30 fois par
 * seconde. Le score, lui, passe par l'état du salon, seulement quand il change.
 */
export class Arcade {
  phase: 'faceoff' | 'duel' | 'verdict' | 'done' = 'faceoff';
  turn = -1;
  readonly turns: number;
  readonly order: string[];
  leftId = '';
  rightId = '';
  result: ArcadeResult | null = null;

  private sim: ArcadeSim | null = null;
  private keys: [number, number] = [0, 0];
  private loop: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private acc = 0;
  private steps = 0;
  private seq = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    readonly kind: ArcadeKind,
    private readonly host: ArcadeHost,
  ) {
    this.order = host.playerIds();
    const n = this.order.length;
    this.turns = Math.max(1, host.rounds() * (n === 2 ? 1 : n));
  }

  start(): void {
    const intro: Record<ArcadeKind, string> = {
      foot: 'Tête-à-tête : flèches pour courir, haut pour sauter, Espace pour frapper.',
      oreillers: 'Bataille d’oreillers : fais tomber l’autre du lit !',
      drap: 'Le Drap tendu : bougez ensemble, attrapez les cœurs, évitez les orages.',
    };
    this.host.system(intro[this.kind]);
    this.next(0);
  }

  handle(id: string, msg: ArcadeMsg): void {
    const side = id === this.leftId ? 0 : id === this.rightId ? 1 : null;
    if (side === null || typeof msg.k !== 'number' || !Number.isFinite(msg.k)) return;
    this.keys[side] = msg.k & KEY_MASK;
  }

  onLeave(id: string): void {
    if (this.phase !== 'faceoff' && this.phase !== 'duel') return;
    if (id !== this.leftId && id !== this.rightId) return;
    this.host.system('Un joueur est parti : partie suivante.');
    this.next(this.turn + 1);
  }

  stateFor(): ArcadeState {
    return {
      kind: this.kind,
      leftId: this.leftId,
      rightId: this.rightId,
      turn: this.turn,
      turns: this.turns,
      score: this.sim ? [this.sim.score[0], this.sim.score[1]] : [0, 0],
      best: this.host.best(),
      result: this.result,
    };
  }

  dispose(): void {
    this.stop();
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private next(k: number): void {
    this.stop();
    this.clearTimers();
    const present = new Set(this.host.playerIds());
    const n = this.order.length;
    // À deux, on change de côté à chaque partie ; à plus, chacun joue avec son voisin.
    const pair = (j: number): [string, string] =>
      n === 2 ? (j % 2 ? [this.order[1]!, this.order[0]!] : [this.order[0]!, this.order[1]!]) : [this.order[j % n]!, this.order[(j + 1) % n]!];
    while (k < this.turns && !pair(k).every((p) => present.has(p))) k++;
    if (k >= this.turns) {
      this.phase = 'done';
      this.host.endGame();
      return;
    }
    this.turn = k;
    [this.leftId, this.rightId] = pair(k);
    this.result = null;
    this.keys = [0, 0];
    this.sim = createSim(this.kind, () => this.host.random());
    this.phase = 'faceoff';
    this.setPhase('faceoff', ARCADE_FACEOFF);
    this.after(ARCADE_FACEOFF, () => this.play());
    this.host.broadcastState();
    // Une première image : le terrain s'affiche déjà pendant le 3, 2, 1.
    this.sendFrame();
  }

  private play(): void {
    this.clearTimers();
    this.phase = 'duel';
    this.setPhase('duel', ARCADE_DURATION[this.kind]);
    this.after(ARCADE_DURATION[this.kind], () => this.finish(false));
    this.host.broadcastState();
    this.last = Date.now();
    this.acc = 0;
    this.loop = setInterval(() => this.tick(), 1000 / 60);
  }

  private tick(): void {
    const now = Date.now();
    this.acc += (now - this.last) / 1000;
    this.last = now;
    let n = 0;
    while (this.acc >= ARCADE_DT && n < MAX_CATCH_UP && this.phase === 'duel') {
      this.acc -= ARCADE_DT;
      this.stepOnce();
      n++;
    }
    if (n === MAX_CATCH_UP) this.acc = 0;
  }

  private stepOnce(): void {
    const sim = this.sim!;
    const before = sim.score[0] + sim.score[1];
    const ev = sim.step(this.keys, () => this.host.random());
    this.steps++;
    if (ev.length) this.host.sendEvents(ev);
    if (this.steps % ARCADE_SEND_EVERY === 0) this.sendFrame();
    if (sim.over) return this.finish(true);
    if (sim.score[0] + sim.score[1] !== before) this.host.broadcastState();
  }

  private sendFrame(): void {
    if (this.sim) this.host.sendFrame(encodeFrame(this.kind, this.seq++, this.sim.frame()));
  }

  private finish(ko: boolean): void {
    if (this.phase !== 'duel' || !this.sim) return;
    this.stop();
    this.clearTimers();
    this.sendFrame();
    const score = this.sim.score;
    const g = arcadeGains(this.kind, score, ko);
    const gains = { [this.leftId]: g.left, [this.rightId]: g.right };
    for (const [id, pts] of Object.entries(gains)) this.host.addScore(id, pts);
    if (ARCADE_COOP[this.kind]) {
      const record = score[0] > this.host.best();
      if (record) this.host.setBest(score[0]);
      this.result = { winner: null, ko, gains, team: score[0], record };
      this.host.system(`${this.name(this.leftId)} et ${this.name(this.rightId)} : ${score[0]} point${score[0] > 1 ? 's' : ''} ensemble${record ? ', nouveau record !' : '.'}`);
    } else {
      const winner = score[0] > score[1] ? this.leftId : score[1] > score[0] ? this.rightId : null;
      this.result = { winner, ko, gains };
      const l = LABEL[this.kind];
      const hi = Math.max(score[0], score[1]);
      const lo = Math.min(score[0], score[1]);
      this.host.system(winner ? `${this.name(winner)} ${ko ? `${l.ko} ${lo}` : `${l.win}, ${hi} à ${lo}`} !` : `Égalité ${hi} à ${lo}, personne ne cède.`);
    }
    this.phase = 'verdict';
    this.setPhase('verdict', ARCADE_VERDICT);
    this.after(ARCADE_VERDICT, () => this.next(this.turn + 1));
    this.host.broadcastState();
  }

  private stop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
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
