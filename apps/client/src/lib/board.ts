import {
  BRUSH_SIZES,
  CANVAS_H,
  CANVAS_W,
  DrawOp,
  PALETTE,
  encodeDraw,
  floodFill,
  hexToRgb,
  type DrawPacket,
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
class Board {
  private strokes: Stroke[] = [];
  private ctx: CanvasRenderingContext2D | null = null;

  attach(canvas: HTMLCanvasElement | null) {
    this.ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    this.redraw();
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
      this.paintLine(s, Math.max(0, from));
      return;
    }
    const s: Stroke = { op: p.op, color: p.color, size: p.size, points: [...p.points] };
    this.strokes.push(s);
    this.paint(s);
  }

  private redraw() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.fillStyle = PALETTE[0];
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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

export const board = new Board();

export type Tool = 'pen' | 'eraser' | 'fill';

/**
 * Saisie du dessinateur : les points (y compris les événements « coalescés » du navigateur)
 * sont regroupés et envoyés une fois par frame, soit ~60 paquets/s au maximum.
 */
export class Pen {
  tool: Tool = 'pen';
  color = 12;
  sizeIndex = 1;
  private pending: number[] = [];
  private raf = 0;
  private down = false;

  constructor(private readonly send: (buf: ArrayBuffer) => void) {}

  private packet(op: DrawOp, points: number[]): void {
    const color = this.tool === 'eraser' ? 0 : this.color;
    const p: DrawPacket = { op, color, size: BRUSH_SIZES[this.sizeIndex] ?? 10, points };
    board.apply(p);
    this.send(encodeDraw(p));
  }

  start(x: number, y: number) {
    if (this.tool === 'fill') {
      this.packet(DrawOp.Fill, [Math.round(x), Math.round(y)]);
      return;
    }
    this.down = true;
    this.packet(DrawOp.Begin, [Math.round(x), Math.round(y)]);
  }

  move(points: number[]) {
    if (!this.down) return;
    for (let i = 0; i < points.length; i++) this.pending.push(Math.round(points[i]!));
    if (!this.raf) this.raf = requestAnimationFrame(() => this.flush());
  }

  end() {
    this.flush();
    this.down = false;
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
