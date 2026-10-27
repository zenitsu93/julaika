import { clampDial, DIAL_MAX, wavePoints, type ClientMsg, type Phase, type ServerMsg, type Spectrum, type WaveRound, type WaveState } from '@julaika/shared';
import { SPECTRUMS } from './spectrums';

/** Ce dont le jeu a besoin du salon : les joueurs, la diffusion et la phase commune. */
export interface WaveHost {
  playerIds(): string[];
  name(id: string): string;
  /** Temps laissé au télépathe pour son indice, puis à l'équipe pour placer l'aiguille (s). */
  turnTime(): number;
  /** Tours par joueur : chacun est télépathe `rounds` fois. */
  rounds(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  system(text: string): void;
  endGame(): void;
}

export const REVEAL_TIME = 7;
const CLUE_MAX = 40;

type WaveMsg = Extract<ClientMsg, { t: 'wave' }>;

/**
 * Une partie de Wavelength. Le télépathe voit la cible et donne un indice ; ses coéquipiers
 * bougent ensemble une seule aiguille, puis valident. Score commun à l'équipe.
 */
export class Wavelength {
  phase: 'clue' | 'guess' | 'reveal' | 'done' = 'clue';
  psychicId: string | null = null;
  spectrum: Spectrum | null = null;
  target = DIAL_MAX / 2;
  clue: string | null = null;
  dial = DIAL_MAX / 2;
  dialBy: string | null = null;
  score = 0;
  turn = 0;
  readonly turns: number;
  points: number | null = null;
  rerolled = false;
  readonly history: WaveRound[] = [];

  private deck: Spectrum[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly host: WaveHost) {
    this.turns = Math.max(1, host.rounds() * host.playerIds().length);
  }

  start(): void {
    this.host.system(`Wavelength : ${this.turns} cartes à deviner ensemble.`);
    this.nextTurn();
  }

  handle(id: string, msg: WaveMsg): void {
    if ('reroll' in msg) {
      if (this.phase === 'clue' && id === this.psychicId && !this.rerolled) {
        this.rerolled = true;
        this.drawCard();
        this.host.broadcastState();
      }
    } else if ('clue' in msg) {
      if (this.phase !== 'clue' || id !== this.psychicId) return;
      const clue = String(msg.clue ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, CLUE_MAX);
      if (clue) this.toGuess(clue);
    } else if ('dial' in msg) {
      if (this.phase !== 'guess' || id === this.psychicId) return;
      const value = clampDial(msg.dial);
      if (value === null || value === this.dial) return;
      this.dial = value;
      this.dialBy = id;
      // Pas d'état complet à chaque mouvement : juste la nouvelle position.
      this.host.broadcast({ t: 'dial', value, by: id }, id);
    } else if ('lock' in msg) {
      if (this.phase === 'guess' && id !== this.psychicId) this.reveal();
    }
  }

  /** Un joueur part : si c'était le télépathe, sa carte est perdue et on passe au tour suivant. */
  onLeave(id: string): void {
    if (id !== this.psychicId || this.phase === 'reveal' || this.phase === 'done') return;
    this.host.system('Le télépathe est parti : carte suivante.');
    this.nextTurn();
  }

  stateFor(id: string): WaveState {
    const open = this.phase === 'reveal' || this.phase === 'done';
    return {
      psychicId: this.psychicId,
      spectrum: this.spectrum,
      target: open || id === this.psychicId ? this.target : null,
      clue: this.clue,
      dial: this.dial,
      dialBy: this.dialBy,
      score: this.score,
      turn: this.turn,
      turns: this.turns,
      points: this.points,
      canReroll: this.phase === 'clue' && !this.rerolled,
      history: this.history,
    };
  }

  dispose(): void {
    this.clearTimers();
  }

  // ---- Boucle -------------------------------------------------------------------

  private nextTurn(): void {
    this.clearTimers();
    const ids = this.host.playerIds();
    if (this.turn >= this.turns || ids.length < 2) {
      this.phase = 'done';
      this.host.endGame();
      return;
    }
    this.turn++;
    this.psychicId = ids[(this.turn - 1) % ids.length]!;
    this.clue = null;
    this.dial = DIAL_MAX / 2;
    this.dialBy = null;
    this.points = null;
    this.rerolled = false;
    this.drawCard();
    this.phase = 'clue';
    this.setPhase('clue', this.host.turnTime());
    this.after(this.host.turnTime(), () => {
      this.host.system(`${this.host.name(this.psychicId!)} n'a pas trouvé d'indice : carte suivante.`);
      this.nextTurn();
    });
    this.host.broadcastState();
  }

  private toGuess(clue: string): void {
    this.clearTimers();
    this.clue = clue;
    this.phase = 'guess';
    this.setPhase('guess', this.host.turnTime());
    this.after(this.host.turnTime(), () => this.reveal());
    this.host.system(`${this.host.name(this.psychicId!)} donne l'indice « ${clue} ».`);
    this.host.broadcastState();
  }

  private reveal(): void {
    if (this.phase !== 'guess') return;
    this.clearTimers();
    this.points = wavePoints(this.target, this.dial);
    this.score += this.points;
    this.history.push({ spectrum: this.spectrum!, clue: this.clue ?? '', target: this.target, dial: this.dial, points: this.points });
    this.phase = 'reveal';
    this.setPhase('reveal', REVEAL_TIME);
    this.after(REVEAL_TIME, () => this.nextTurn());
    this.host.broadcastState();
  }

  /** Carte suivante du paquet mélangé, et nouvelle cible cachée (jamais collée aux bords). */
  private drawCard(): void {
    if (!this.deck.length) {
      this.deck = [...SPECTRUMS];
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.host.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j]!, this.deck[i]!];
      }
    }
    this.spectrum = this.deck.pop()!;
    this.target = Math.round((4 + this.host.random() * (DIAL_MAX - 8)) * 10) / 10;
  }

  private setPhase(phase: Phase, seconds: number): void {
    this.host.setPhase(phase, Date.now() + seconds * 1000, Math.ceil(this.turn / Math.max(1, this.host.playerIds().length)));
  }

  private after(seconds: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, seconds * 1000));
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
