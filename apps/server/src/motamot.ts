import {
  STORY_COUNTDOWN,
  STORY_EVERY,
  STORY_FILLER,
  STORY_LENGTH,
  STORY_PER_PLAYER,
  STORY_POINTS,
  STORY_RULE_FACTOR,
  STORY_WORD_MAX,
  checkStoryRule,
  cleanStoryWord,
  type ClientMsg,
  type StoryRule,
  type StoryRuleKind,
  type StoryState,
  type StoryWord,
  type Phase,
  type ServerMsg,
} from '@julaika/shared';

/** Ce dont le jeu a besoin du salon. */
export interface StoryHost {
  playerIds(): string[];
  name(id: string): string;
  rounds(): number;
  /** Secondes par mot (réglage du salon). */
  wordTime(): number;
  random(): number;
  setPhase(phase: Phase, endsAt: number | null, round: number): void;
  broadcastState(): void;
  broadcast(msg: ServerMsg, except?: string): void;
  system(text: string): void;
  addScore(id: string, points: number): void;
  endGame(): void;
}

type StoryMsg = Extract<ClientMsg, { t: 'motamot' }>;

/** Débuts d'histoire : on part toujours de quelque part. */
export const STORY_STARTERS = [
  'Il était une fois',
  'Hier soir, ma grand-mère',
  'Au fond du frigo,',
  'Personne ne savait que',
  'Ce matin, le chat',
  'Dans la salle de bain,',
  'Le jour de mon mariage,',
  'Un dimanche à la plage,',
  'Mon voisin m’a dit que',
  'Tout a commencé quand',
  'Sur la Lune, un',
  'Pendant le repas de Noël,',
  'Le prof de maths',
  'Si j’étais une licorne,',
  'En vacances au camping,',
  'Le premier rendez-vous',
];

/** Mots à placer coûte que coûte. */
export const STORY_IMPOSED = [
  'mayonnaise', 'licorne', 'chaussette', 'brocoli', 'trampoline', 'moustache', 'crocodile', 'aspirateur',
  'pyjama', 'raclette', 'kangourou', 'parapluie', 'sardine', 'saucisson', 'bisou', 'tutu', 'pingouin',
  'cornichon', 'croissant', 'flamant', 'banane', 'karaoké', 'tracteur', 'fondue',
];

const LETTERS = 'abcdefgilmnoprstv';

const RULE_TEXT: Record<Exclude<StoryRuleKind, 'mot' | 'lettre'>, string> = {
  long: 'Un mot d’au moins 9 lettres',
  court: 'Un tout petit mot (3 lettres max)',
  sansE: 'Un mot sans la lettre E',
  prenom: 'Le prénom d’un joueur',
  verbe: 'Un verbe',
  adjectif: 'Un adjectif',
  animal: 'Un animal',
  couleur: 'Une couleur',
  miam: 'Quelque chose qui se mange',
  bruit: 'Un bruit (boum, splash…)',
  doux: 'Un mot doux',
};

/** Contraintes que le serveur vérifie lui-même ; les autres passent par le jury. */
const CHECKED = new Set<StoryRuleKind>(['mot', 'lettre', 'long', 'court', 'sansE', 'prenom']);

/** Le mot imposé revient plus souvent : c'est la contrainte la plus drôle. */
const RULE_POOL: StoryRuleKind[] = ['mot', 'mot', 'mot', 'lettre', 'lettre', 'long', 'court', 'sansE', 'prenom', 'verbe', 'adjectif', 'animal', 'couleur', 'miam', 'bruit', 'doux'];

/**
 * Une partie de Mot à mot. Le serveur tient le tour, le minuteur et l'histoire ; quand le temps
 * file, il prend ce qui était tapé (ou « euh… ») pour que l'histoire ne s'arrête jamais.
 */
export class MotAMot {
  private story = 0;
  private readonly stories: number;
  private order: string[] = [];
  private words: StoryWord[] = [];
  private length = 0;
  private written = 0;
  private turn: string | null = null;
  private rule: StoryRule | null = null;
  private typing = '';
  private stars = new Map<string, number>();
  private ready = new Set<string>();
  private tales: StoryWord[][] = [];
  private placed = new Map<string, number>();
  private kept = new Map<string, number>();
  private lastRule: StoryRuleKind | null = null;
  private usedStarters = new Set<string>();
  private usedImposed = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: StoryHost) {
    this.stories = Math.max(1, Math.min(10, host.rounds()));
  }

  start(): void {
    this.host.system(`Mot à mot : un mot chacun, ${this.host.wordTime()} secondes, et gare aux contraintes !`);
    this.nextStory();
  }

  handle(id: string, msg: StoryMsg): void {
    if ('typing' in msg) {
      if (id !== this.turn) return;
      this.typing = String(msg.typing ?? '').slice(0, STORY_WORD_MAX);
      this.host.broadcast({ t: 'storyTyping', by: id, text: this.typing }, id);
    } else if ('word' in msg) {
      if (id !== this.turn) return;
      const word = cleanStoryWord(String(msg.word ?? ''));
      if (word) this.place(id, word, false);
    } else if ('veto' in msg) {
      this.veto(id, Number(msg.veto));
    } else if ('star' in msg) {
      this.star(id, Number(msg.star));
    } else if ('ready' in msg) {
      if (this.turn !== null || !this.length || this.written < this.length) return;
      this.ready.add(id);
      this.host.broadcastState();
      this.checkReady();
    }
  }

  /** Un joueur part : s'il écrivait, la main passe au suivant ; ses votes disparaissent. */
  onLeave(id: string): void {
    this.stars.delete(id);
    this.ready.delete(id);
    for (const w of this.words) w.vetoes = w.vetoes.filter((v) => v !== id);
    for (const [voter, index] of this.stars) if (this.words[index]?.by === id) this.stars.delete(voter);
    if (this.turn === id) this.beginTurn();
    else if (this.written >= this.length && this.turn === null) this.checkReady();
  }

  state(): StoryState {
    return {
      story: this.story,
      stories: this.stories,
      order: this.order,
      turn: this.turn,
      rule: this.rule,
      nextRule: STORY_EVERY - 1 - (this.written % STORY_EVERY),
      words: this.words,
      length: this.length,
      written: this.written,
      stars: Object.fromEntries(this.stars),
      ready: [...this.ready],
      tales: this.tales,
      placed: Object.fromEntries(this.placed),
      kept: Object.fromEntries(this.kept),
    };
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  // ---- Boucle -------------------------------------------------------------------

  private nextStory(): void {
    if (this.story > 0) this.settle();
    if (this.story >= this.stories) return this.finish();
    this.story++;
    const players = this.present();
    // Chaque histoire commence chez un joueur différent.
    const shift = (this.story - 1) % Math.max(1, players.length);
    this.order = [...players.slice(shift), ...players.slice(0, shift)];
    this.length = Math.max(STORY_LENGTH[0], Math.min(STORY_LENGTH[1], STORY_PER_PLAYER * players.length));
    this.written = 0;
    this.words = this.pickStarter()
      .split(' ')
      .map((text) => ({ by: null, text, rule: null, ok: null, late: false, vetoes: [] }));
    this.stars.clear();
    this.ready.clear();
    this.turn = null;
    this.rule = null;
    this.host.setPhase('write', Date.now() + STORY_COUNTDOWN, this.story);
    this.host.broadcastState();
    this.arm(STORY_COUNTDOWN, () => this.beginTurn());
  }

  /** La main passe au joueur suivant ; tous les STORY_EVERY mots, une contrainte tombe. */
  private beginTurn(): void {
    const present = new Set(this.present());
    this.order = this.order.filter((id) => present.has(id));
    if (this.order.length < 2) return this.finish();
    this.turn = this.order[this.written % this.order.length]!;
    this.rule = this.written % STORY_EVERY === STORY_EVERY - 1 ? this.pickRule() : null;
    this.typing = '';
    const seconds = this.host.wordTime() * (this.rule ? STORY_RULE_FACTOR : 1);
    this.host.setPhase('write', Date.now() + seconds * 1000, this.story);
    this.host.broadcastState();
    this.arm(seconds * 1000, () => this.timeout());
  }

  /** Temps écoulé : le mot à moitié tapé compte quand même, sinon « euh… ». */
  private timeout(): void {
    const id = this.turn;
    if (!id) return;
    this.place(id, cleanStoryWord(this.typing) ?? STORY_FILLER, true);
  }

  private place(id: string, text: string, late: boolean): void {
    const rule = this.rule;
    const ok = rule ? checkStoryRule(rule, text, this.present().map((p) => this.host.name(p))) : null;
    this.words.push({ by: id, text, rule, ok, late, vetoes: [] });
    this.written++;
    if (!late) {
      this.placed.set(id, (this.placed.get(id) ?? 0) + 1);
      this.host.addScore(id, STORY_POINTS.word);
    }
    if (ok === true) this.keep(id);
    if (this.written >= this.length) return this.read();
    this.beginTurn();
  }

  /** L'histoire est finie : place à la lecture, le temps de l'écouter et de voter. */
  private read(): void {
    // Une histoire finit sur un point, même si le dernier l'a oublié.
    const end = this.words.at(-1);
    if (end && !/[.!?…]$/.test(end.text)) end.text = end.text.replace(/[,;:]$/, '') + '.';
    this.turn = null;
    this.rule = null;
    const seconds = Math.max(25, Math.min(80, Math.round(this.words.length * 0.6) + 15));
    this.host.setPhase('album', Date.now() + seconds * 1000, this.story);
    this.host.broadcastState();
    this.arm(seconds * 1000, () => this.nextStory());
  }

  private checkReady(): void {
    const present = this.present();
    if (present.length && present.every((id) => this.ready.has(id))) this.nextStory();
  }

  /** Fin de l'histoire : le jury tranche les contraintes, les étoiles rapportent. */
  private settle(): void {
    for (const w of this.words) {
      if (!w.by || !w.rule || w.ok !== null) continue;
      const judges = this.present().filter((id) => id !== w.by).length;
      w.ok = w.vetoes.length < Math.max(1, Math.ceil(judges / 2));
      if (w.ok) this.keep(w.by);
    }
    for (const index of this.stars.values()) {
      const by = this.words[index]?.by;
      if (by) this.host.addScore(by, STORY_POINTS.star);
    }
    this.tales.push(this.words);
  }

  private finish(): void {
    this.dispose();
    this.turn = null;
    this.rule = null;
    this.host.endGame();
  }

  // ---- Votes --------------------------------------------------------------------

  /** Recaler (ou gracier) un mot sous contrainte du jury, jusqu'à la fin de la lecture. */
  private veto(id: string, index: number): void {
    const w = this.words[index];
    if (!w || !w.rule?.jury || w.ok !== null || !w.by || w.by === id) return;
    w.vetoes = w.vetoes.includes(id) ? w.vetoes.filter((v) => v !== id) : [...w.vetoes, id];
    this.host.broadcastState();
  }

  /** Mot préféré pendant la lecture : un seul par joueur, jamais le sien. */
  private star(id: string, index: number): void {
    if (this.turn !== null || this.written < this.length) return;
    const w = this.words[index];
    if (!w || !w.by || w.by === id || w.late) return;
    if (this.stars.get(id) === index) this.stars.delete(id);
    else this.stars.set(id, index);
    this.host.broadcastState();
  }

  // ---- Outils -------------------------------------------------------------------

  private keep(id: string): void {
    this.kept.set(id, (this.kept.get(id) ?? 0) + 1);
    this.host.addScore(id, STORY_POINTS.rule);
  }

  private present(): string[] {
    return this.host.playerIds();
  }

  private pickRule(): StoryRule {
    const pool = RULE_POOL.filter((k) => k !== this.lastRule);
    const kind = pool[Math.floor(this.host.random() * pool.length)] ?? 'mot';
    this.lastRule = kind;
    if (kind === 'mot') {
      const word = this.pickFrom(STORY_IMPOSED, this.usedImposed);
      const shown = word[0]!.toUpperCase() + word.slice(1);
      return { kind, text: `Place le mot « ${shown} »`, arg: word, jury: false };
    }
    if (kind === 'lettre') {
      const letter = LETTERS[Math.floor(this.host.random() * LETTERS.length)]!;
      return { kind, text: `Un mot qui commence par ${letter.toUpperCase()}`, arg: letter, jury: false };
    }
    return { kind, text: RULE_TEXT[kind], jury: !CHECKED.has(kind) };
  }

  private pickStarter(): string {
    return this.pickFrom(STORY_STARTERS, this.usedStarters);
  }

  /** Tirage sans remise tant que la liste n'est pas épuisée. */
  private pickFrom(list: string[], used: Set<string>): string {
    if (used.size >= list.length) used.clear();
    const left = list.filter((w) => !used.has(w));
    const pick = left[Math.floor(this.host.random() * left.length)] ?? list[0]!;
    used.add(pick);
    return pick;
  }

  private arm(ms: number, fn: () => void): void {
    this.dispose();
    this.timer = setTimeout(fn, ms);
  }
}
