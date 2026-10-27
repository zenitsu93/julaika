import {
  BRUSH_SIZES,
  CANVAS_H,
  CANVAS_W,
  DrawOp,
  PALETTE,
  TRAP_COLORS,
  encodeDraw,
  floodFill,
  hexToRgb,
  type DrawPacket,
  type Trap,
} from '@julaika/shared';

interface Stroke {
  color: number;
  size: number;
  op: DrawOp;
  points: number[];
}

/**
 * Modèle + rendu du tableau. Les traits sont gardés en mémoire (pour annuler et pour
 * redessiner si le canvas est remonté) ; le rendu est incrémental, sauf après une annulation.
 */
export class BoardCanvas {
  private strokes: Stroke[] = [];
  private ctx: CanvasRenderingContext2D | null = null;
  /** Encre invisible : le modèle suit les traits mais rien n'est peint tant que c'est vrai. */
  private hidden = false;

  /** `transparent` : calque sans fond blanc (aperçu des lignes droites, trait fantôme). */
  constructor(private readonly transparent = false) {}

  attach(canvas: HTMLCanvasElement | null) {
    this.ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    this.redraw();
  }

  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    this.redraw();
  }

  /** Les traits du dessin actuel, tels qu'on les rejoue (ralenti de fin de tour). */
  packets(): DrawPacket[] {
    return this.strokes.map((s) => ({ op: s.op, color: s.color, size: s.size, points: [...s.points] }));
  }

  reset() {
    this.strokes = [];
    this.redraw();
  }

  undo() {
    this.strokes.pop();
    this.redraw();
  }

  apply(p: DrawPacket) {
    if (p.op === DrawOp.Extend) {
      const s = this.strokes.at(-1);
      if (!s || s.op !== DrawOp.Begin) return;
      const from = s.points.length - 2;
      s.points.push(...p.points);
      if (!this.hidden) this.paintLine(s, Math.max(0, from));
      return;
    }
    const s: Stroke = { op: p.op, color: p.color, size: p.size, points: [...p.points] };
    this.strokes.push(s);
    if (!this.hidden) this.paint(s);
  }

  private redraw() {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.transparent) ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    else {
      ctx.fillStyle = PALETTE[0];
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
    if (this.hidden) return;
    for (const s of this.strokes) this.paint(s);
  }

  private paint(s: Stroke) {
    if (s.op === DrawOp.Fill) this.paintFill(s);
    else this.paintLine(s, 0);
  }

  private paintLine(s: Stroke, from: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const pts = s.points;
    ctx.strokeStyle = ctx.fillStyle = PALETTE[s.color] ?? '#000';
    ctx.lineWidth = s.size;
    ctx.lineCap = ctx.lineJoin = 'round';
    if (pts.length === 2 && from === 0) {
      ctx.beginPath();
      ctx.arc(pts[0]!, pts[1]!, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[from]!, pts[from + 1]!);
    for (let i = from + 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    ctx.stroke();
  }

  private paintFill(s: Stroke) {
    const ctx = this.ctx;
    if (!ctx) return;
    const img = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    floodFill(img.data, CANVAS_W, CANVAS_H, s.points[0]!, s.points[1]!, hexToRgb(PALETTE[s.color] ?? '#000'));
    ctx.putImageData(img, 0, 0);
  }
}

export const board = new BoardCanvas();

/**
 * Rejoue un dessin trait par trait sur `target`, en `ms` millisecondes au total (album du
 * Téléphone dessiné). Renvoie de quoi l'arrêter ; en mouvement réduit, tout s'affiche d'un coup.
 */
export function replay(target: BoardCanvas, packets: DrawPacket[], ms: number, instant = false): () => void {
  target.reset();
  const total = packets.reduce((n, p) => n + Math.max(1, p.points.length / 2), 0);
  if (instant || !total) {
    for (const p of packets) target.apply(p);
    return () => {};
  }
  let drawn = 0; // points déjà posés, tous traits confondus
  let index = 0; // trait en cours
  let inStroke = 0; // points posés du trait en cours
  let raf = 0;
  const t0 = performance.now();
  const step = (t: number) => {
    const goal = Math.min(total, Math.ceil((total * (t - t0)) / ms));
    while (drawn < goal && index < packets.length) {
      const p = packets[index]!;
      const count = Math.max(1, p.points.length / 2);
      const take = Math.min(count - inStroke, goal - drawn);
      const pts = p.points.slice(inStroke * 2, (inStroke + take) * 2);
      if (inStroke === 0) target.apply({ ...p, points: pts });
      else target.apply({ ...p, op: DrawOp.Extend, points: pts });
      inStroke += take;
      drawn += take;
      if (inStroke >= count) {
        index++;
        inStroke = 0;
      }
    }
    if (index < packets.length) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

export type Tool = 'pen' | 'eraser' | 'fill';

/**
 * Saisie du dessinateur : les points (y compris les événements « coalescés » du navigateur)
 * sont regroupés et envoyés une fois par frame, soit ~60 paquets/s au maximum.
 * Les manches piégées changent la saisie : couleur imposée ou tirée à chaque trait, lignes
 * droites tracées à l'élastique sur le calque `ghost`, ou encre invisible (seul le trait en
 * cours y apparaît, puis s'efface).
 */
export class Pen {
  tool: Tool = 'pen';
  color = 12;
  sizeIndex = 1;
  trap: Trap | null = null;
  /** Couleur du trait en cours avec le pinceau farceur. */
  luckyColor = 12;
  /** Calque d'aperçu local, jamais envoyé ; `onLift` sert à l'effacer en fondu. */
  ghost: BoardCanvas | null = null;
  onLift: (() => void) | null = null;
  private pending: number[] = [];
  private raf = 0;
  private down = false;
  private origin: [number, number] | null = null;
  private tip: [number, number] | null = null;

  constructor(
    private readonly send: (buf: ArrayBuffer) => void,
    readonly target: BoardCanvas = board,
    private readonly random: () => number = Math.random,
  ) {}

  /** Couleur réellement posée, une fois les pièges appliqués. */
  get inkColor(): number {
    if (this.tool === 'eraser') return 0;
    if (this.trap?.kind === 'mono') return this.trap.color;
    if (this.trap?.kind === 'shifty') return this.luckyColor;
    return this.color;
  }

  private draft(op: DrawOp, points: number[]): DrawPacket {
    return { op, color: this.inkColor, size: BRUSH_SIZES[this.sizeIndex] ?? 10, points };
  }

  private packet(op: DrawOp, points: number[]): void {
    const p = this.draft(op, points);
    this.target.apply(p);
    if (this.trap?.kind === 'invisible') this.ghost?.apply(p);
    this.send(encodeDraw(p));
  }

  start(x: number, y: number) {
    if (this.trap?.kind === 'shifty') {
      const others = TRAP_COLORS.filter((c) => c !== this.luckyColor);
      this.luckyColor = others[Math.floor(this.random() * others.length)] ?? 12;
    }
    const at: [number, number] = [Math.round(x), Math.round(y)];
    if (this.tool === 'fill') {
      this.packet(DrawOp.Fill, at);
      return;
    }
    this.down = true;
    if (this.trap?.kind === 'straight') {
      // Rien ne part tant que le trait n'est pas lâché : on tire un élastique depuis l'origine.
      this.origin = this.tip = at;
      this.stretch();
      return;
    }
    this.ghost?.reset();
    this.packet(DrawOp.Begin, at);
  }

  move(points: number[]) {
    if (!this.down) return;
    if (this.origin) {
      this.tip = [Math.round(points.at(-2)!), Math.round(points.at(-1)!)];
      if (!this.raf) this.raf = requestAnimationFrame(() => ((this.raf = 0), this.stretch()));
      return;
    }
    for (let i = 0; i < points.length; i++) this.pending.push(Math.round(points[i]!));
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }

  end() {
    if (this.origin) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      const [x0, y0] = this.origin;
      const [x1, y1] = this.tip ?? this.origin;
      this.origin = this.tip = null;
      this.ghost?.reset();
      this.packet(DrawOp.Begin, [x0, y0]);
      if (x1 !== x0 || y1 !== y0) this.packet(DrawOp.Extend, [x1, y1]);
      this.down = false;
      return;
    }
    this.flush();
    if (this.down) this.onLift?.();
    this.down = false;
  }

  private stretch() {
    if (!this.origin || !this.ghost) return;
    this.ghost.reset();
    this.ghost.apply(this.draft(DrawOp.Begin, [...this.origin, ...(this.tip ?? this.origin)]));
  }

  private flush() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (!this.pending.length) return;
    const pts = dedupe(this.pending);
    this.pending = [];
    if (pts.length) this.packet(DrawOp.Extend, pts);
  }
}

/** Retire les points consécutifs identiques (fréquents avec les pointeurs haute fréquence). */
function dedupe(pts: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    if (out.length && out.at(-2) === pts[i] && out.at(-1) === pts[i + 1]) continue;
    out.push(pts[i]!, pts[i + 1]!);
  }
  return out;
}
