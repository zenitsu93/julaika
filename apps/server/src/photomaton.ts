import {
  PHOTO_ALL_RATED_MS,
  PHOTO_DEVELOP_MS,
  PHOTO_MAX_STARS,
  PHOTO_POSE_TIME,
  PHOTO_PROMPTS,
  PHOTO_REVEAL_TIME,
  PHOTO_STAR_POINTS,
  PHOTO_UPLOAD_GRACE,
  PHOTO_VOTE_INTRO,
  PHOTO_VOTE_TIME,
  isPhotoDataUrl,
  type ClientMsg,
  type Phase,
  type PhotoShot,
  type PhotoState,
  type ServerMsg,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon : les joueurs, les scores, la diffusion et la phase commune. */
export interface PhotoHost {
  playerIds(): string[];
  player(id: string): { name: string; avatar: number } | undefined;
  /** Manches de la partie. */
  rounds(): number;
  random(): number;
  /** Seul l'hôte peut mettre la partie en pause. */
  isHost(id: string): boolean;
  addScore(id: string, points: number): void;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  sendTo(id: string, msg: ServerMsg): void;
  system(text: string): void;
  endGame(): void;
}

type PhotoMsg = Extract<ClientMsg, { t: 'photo' }>;
interface Seat {
  id: string;
  name: string;
  avatar: number;
}

/**
 * Une partie de Photomaton. À chaque manche, une consigne, un flash, et chacun envoie sa photo ;
 * puis tout le monde note les photos des autres, et chaque étoile reçue rapporte des points.
 * Les photos ne vivent qu'en mémoire, le temps d'une manche.
 */
export class Photomaton {
  phase: 'pose' | 'vote' | 'reveal' | 'done' = 'pose';
  round = 0;
  readonly rounds: number;
  readonly seats: Seat[];
  readonly done = new Set<string>();
  prompt = '';
  stars: PhotoState['stars'] = {};

  private shots = new Map<string, string | null>();
  /** Notes de la manche : votant → (photo notée → étoiles). */
  private votes = new Map<string, Map<string, number>>();
  private prompts: string[] = [...PHOTO_PROMPTS];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Prochaine étape de la boucle et son heure (ms) : un seul minuteur, qu'on peut figer. */
  private step: { at: number; fn: () => void } | null = null;
  /** Heure du flash de la manche (ms). */
  private flashAt = 0;
  /** Vote : ouverture des étoiles (ms). */
  private opensAt = 0;
  /** Fin de la phase affichée aux joueurs (ms). */
  private endsAt: number | null = null;
  /** Début de la pause en cours (ms), null hors pause. */
  private pausedAt: number | null = null;

  constructor(private readonly host: PhotoHost) {
    this.seats = host.playerIds().map((id) => ({ id, name: host.player(id)?.name ?? '?', avatar: host.player(id)?.avatar ?? 0 }));
    this.rounds = host.rounds();
  }

  start(): void {
    this.host.system(`Photomaton : ${this.rounds} manche${this.rounds > 1 ? 's' : ''}, prenez la pose !`);
    this.startRound(1);
  }

  handle(id: string, msg: PhotoMsg): void {
    if ('pause' in msg) return this.setPaused(id, msg.pause === true);
    if (!this.seats.some((s) => s.id === id)) return;
    if ('image' in msg) {
      if (this.phase !== 'pose' || this.shots.has(id)) return;
      this.shots.set(id, isPhotoDataUrl(msg.image) ? msg.image : null);
      this.markDone(id);
    } else if ('vote' in msg) {
      if (this.phase !== 'vote' || Date.now() < this.opensAt || this.done.has(id)) return;
      const target = String(msg.vote);
      if (target === id || !this.shots.get(target)) return;
      const stars = typeof msg.stars === 'number' && Number.isFinite(msg.stars) ? Math.round(msg.stars) : NaN;
      if (!(stars >= 1)) return;
      const mine = this.votes.get(id) ?? new Map<string, number>();
      mine.set(target, Math.min(PHOTO_MAX_STARS, stars));
      this.votes.set(id, mine);
    } else if ('ready' in msg) {
      // Les notes ne comptent comme finies qu'une fois validées : un clic de trop ne coupe plus la parole aux autres.
      if (this.phase !== 'vote' || Date.now() < this.opensAt || this.done.has(id)) return;
      this.markDone(id);
    }
  }

  /** Un joueur arrive en cours de partie : il regarde, et voit les polaroids s'ils sont sortis. */
  onJoin(id: string): void {
    if (this.phase === 'vote' || this.phase === 'reveal') this.host.sendTo(id, this.photosMsg());
  }

  /** Un joueur part : les autres n'attendent plus que les présents. */
  onLeave(_id: string): void {
    this.checkAllDone();
  }

  state(): PhotoState {
    return {
      round: this.round,
      rounds: this.rounds,
      prompt: this.prompt,
      players: this.seats.map((s) => s.id),
      done: [...this.done],
      stars: this.stars,
      opensAt: this.phase === 'vote' ? this.opensAt : null,
      paused: this.pausedAt !== null,
      pausedLeft: this.pausedAt !== null && this.endsAt ? Math.max(0, this.endsAt - this.pausedAt) : null,
    };
  }

  dispose(): void {
    this.clearTimers();
    this.shots.clear();
    this.votes.clear();
  }

  // ---- Boucle -------------------------------------------------------------------

  private startRound(round: number): void {
    this.clearTimers();
    this.round = round;
    this.phase = 'pose';
    this.done.clear();
    this.shots.clear();
    this.votes.clear();
    this.stars = {};
    // Tirage sans remise : pas deux fois la même consigne dans une partie.
    if (!this.prompts.length) this.prompts = [...PHOTO_PROMPTS];
    this.prompt = this.prompts.splice(Math.floor(this.host.random() * this.prompts.length), 1)[0]!;
    this.flashAt = Date.now() + PHOTO_POSE_TIME * 1000;
    this.enter('pose', this.flashAt);
    // Après le flash, un délai pour que les photos arrivent.
    this.after(PHOTO_POSE_TIME + PHOTO_UPLOAD_GRACE, () => this.startVote());
    this.host.broadcastState();
  }

  private startVote(): void {
    this.clearTimers();
    this.phase = 'vote';
    this.done.clear();
    // Rien à noter (aucune autre photo) : on a fini d'office.
    for (const s of this.seats) if (this.hasRatedAll(s.id)) this.done.add(s.id);
    // D'abord l'annonce (la consigne en rappel), puis les étoiles s'ouvrent.
    this.opensAt = Date.now() + PHOTO_VOTE_INTRO * 1000;
    this.enter('vote', this.opensAt + PHOTO_VOTE_TIME * 1000);
    this.host.broadcast(this.photosMsg());
    this.after(PHOTO_VOTE_INTRO + PHOTO_VOTE_TIME, () => this.reveal());
    this.host.broadcastState();
    this.checkAllDone();
  }

  private reveal(): void {
    this.clearTimers();
    this.phase = 'reveal';
    this.done.clear();
    const stars: PhotoState['stars'] = {};
    for (const [by, image] of this.shots) if (image) stars[by] = { total: 0, votes: 0 };
    for (const mine of this.votes.values()) {
      for (const [target, n] of mine) {
        const s = stars[target];
        if (!s) continue;
        s.total += n;
        s.votes++;
      }
    }
    this.stars = stars;
    for (const [by, s] of Object.entries(stars)) if (s.total) this.host.addScore(by, s.total * PHOTO_STAR_POINTS);
    this.enter('reveal', Date.now() + PHOTO_REVEAL_TIME * 1000);
    this.after(PHOTO_REVEAL_TIME, () => this.nextRound());
    this.host.broadcastState();
  }

  private nextRound(): void {
    if (this.round < this.rounds) return this.startRound(this.round + 1);
    this.clearTimers();
    this.phase = 'done';
    this.shots.clear();
    this.votes.clear();
    this.host.endGame();
  }

  private markDone(id: string): void {
    this.done.add(id);
    this.host.broadcastState();
    this.checkAllDone();
  }

  private checkAllDone(): void {
    if (this.phase !== 'pose' && this.phase !== 'vote') return;
    const present = new Set(this.host.playerIds());
    const waiting = this.seats.filter((s) => present.has(s.id) && !this.done.has(s.id));
    if (waiting.length) return;
    if (this.phase === 'vote') {
      // Personne n'a rien à noter : la révélation peut venir tout de suite. Sinon, un souffle après le dernier « fini ».
      const rated = [...this.votes.values()].some((m) => m.size);
      return this.schedule(Date.now() + (rated ? PHOTO_ALL_RATED_MS : 0), () => this.reveal());
    }
    // Toutes les photos sont là : on laisse au tirage le temps de sortir et de se révéler.
    this.schedule(Math.max(Date.now(), this.flashAt + PHOTO_DEVELOP_MS), () => this.startVote());
  }

  /** Pause de l'hôte : le minuteur se fige, puis repart avec le temps qui restait. */
  private setPaused(id: string, on: boolean): void {
    if (!this.host.isHost(id) || this.phase === 'done' || on === (this.pausedAt !== null)) return;
    const now = Date.now();
    if (on) {
      this.pausedAt = now;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.host.setPhase(this.phase, null, this.round);
      this.host.system('⏸ Partie en pause');
    } else {
      const since = this.pausedAt!;
      const d = now - since;
      this.pausedAt = null;
      // Ce qui n'était pas encore arrivé glisse d'autant ; un flash déjà passé ne se rejoue pas.
      if (this.flashAt > since) this.flashAt += d;
      if (this.opensAt > since) this.opensAt += d;
      if (this.endsAt && this.endsAt > since) this.endsAt += d;
      this.host.setPhase(this.phase, this.endsAt, this.round);
      if (this.step) this.arm(this.step.at + d, this.step.fn);
      this.host.system('▶ Ça repart !');
    }
    this.host.broadcastState();
  }

  /** Le votant a noté toutes les photos des autres. */
  private hasRatedAll(id: string): boolean {
    const mine = this.votes.get(id);
    return this.seats.every((s) => s.id === id || !this.shots.get(s.id) || mine?.has(s.id));
  }

  private photosMsg(): ServerMsg {
    const shots: PhotoShot[] = this.seats.map((s) => ({ by: s.id, name: s.name, avatar: s.avatar, image: this.shots.get(s.id) ?? null }));
    return { t: 'photos', round: this.round, shots };
  }

  /** Nouvelle phase : son heure de fin, figée si la partie est en pause. */
  private enter(phase: 'pose' | 'vote' | 'reveal', endsAt: number): void {
    this.endsAt = endsAt;
    if (this.pausedAt !== null) {
      // Une phase qui commence pendant la pause démarre à la reprise, avec tout son temps.
      const d = Date.now() - this.pausedAt;
      this.endsAt -= d;
      if (phase === 'pose') this.flashAt -= d;
      if (phase === 'vote') this.opensAt -= d;
    }
    this.host.setPhase(phase, this.pausedAt === null ? this.endsAt : null, this.round);
  }

  private after(seconds: number, fn: () => void): void {
    this.schedule(Date.now() + seconds * 1000, fn);
  }

  /** Prévoit la prochaine étape ; en pause, elle attend la reprise. */
  private schedule(at: number, fn: () => void): void {
    if (this.pausedAt !== null) at -= Date.now() - this.pausedAt;
    this.step = { at, fn };
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pausedAt === null) this.arm(at, fn);
  }

  private arm(at: number, fn: () => void): void {
    this.step = { at, fn };
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.step = null;
      fn();
    }, Math.max(0, at - Date.now()));
  }

  private clearTimers(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.step = null;
  }
}
