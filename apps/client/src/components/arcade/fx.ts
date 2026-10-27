// Effets dessinés par-dessus le monde des jeux d'action : plumes, cœurs, étincelles, textes.
// Tout est en coordonnées d'écran (déjà retournées pour le joueur de droite).

export type FxKind = 'feather' | 'heart' | 'spark' | 'confetti' | 'text' | 'ring' | 'star';

interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  life: number;
  max: number;
  size: number;
  color: string;
  text?: string;
}

export class Fx {
  private list: Particle[] = [];
  /** Secousse de l'écran, en pixels, qui s'amortit. */
  shake = 0;

  add(kind: FxKind, x: number, y: number, o: Partial<Omit<Particle, 'kind' | 'x' | 'y'>> = {}) {
    if (this.list.length > 260) this.list.shift();
    this.list.push({ kind, x, y, vx: 0, vy: 0, rot: 0, spin: 0, life: 1, max: 1, size: 10, color: '#fff', ...o, ...(o.max ? { life: o.max } : {}) });
  }

  burst(kind: FxKind, x: number, y: number, n: number, color: string | string[], speed = 180, size = 8, max = 0.9) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.8);
      this.add(kind, x, y, {
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.3,
        rot: Math.random() * 6.3,
        spin: (Math.random() - 0.5) * 8,
        size: size * (0.7 + Math.random() * 0.6),
        color: Array.isArray(color) ? color[i % color.length]! : color,
        max: max * (0.7 + Math.random() * 0.6),
      });
    }
  }

  text(x: number, y: number, text: string, color: string, size = 22, max = 0.9) {
    this.add('text', x, y, { vy: -60, text, color, size, max });
  }

  draw(ctx: CanvasRenderingContext2D, dt: number) {
    this.shake *= Math.pow(0.0015, dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      const k = p.life / p.max;
      // Les plumes planent, les confettis tombent, les cœurs montent.
      const g = p.kind === 'feather' ? 60 : p.kind === 'confetti' ? 320 : p.kind === 'heart' ? -40 : p.kind === 'spark' ? 200 : 0;
      const drag = p.kind === 'feather' ? 2.6 : p.kind === 'text' ? 0 : 0.8;
      p.vx *= Math.exp(-drag * dt);
      p.vy = p.vy * Math.exp(-drag * dt) + g * dt;
      if (p.kind === 'feather') p.vx += Math.sin(p.life * 7 + p.rot) * 40 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.kind) {
        case 'feather':
          feather(ctx, p.size);
          break;
        case 'heart':
          heart(ctx, 0, 0, p.size);
          ctx.fill();
          break;
        case 'spark':
          ctx.lineWidth = 2.5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.lineTo(p.size, 0);
          ctx.stroke();
          break;
        case 'confetti':
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          break;
        case 'star':
          star(ctx, p.size);
          ctx.fill();
          break;
        case 'ring':
          ctx.rotate(-p.rot);
          ctx.lineWidth = 4 * k;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * (1.6 - k), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'text':
          ctx.rotate(-p.rot);
          ctx.font = `800 ${p.size}px Inter, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 5;
          ctx.strokeStyle = 'rgba(42,26,18,.55)';
          ctx.strokeText(p.text!, 0, 0);
          ctx.fillText(p.text!, 0, 0);
          break;
      }
      ctx.restore();
    }
  }

  clear() {
    this.list = [];
    this.shake = 0;
  }
}

/** Un cœur centré en (x, y), de largeur ~2 × size. */
export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const s = size / 10;
  ctx.beginPath();
  ctx.moveTo(x, y + 8 * s);
  ctx.bezierCurveTo(x - 12 * s, y - 1 * s, x - 7 * s, y - 11 * s, x, y - 5 * s);
  ctx.bezierCurveTo(x + 7 * s, y - 11 * s, x + 12 * s, y - 1 * s, x, y + 8 * s);
  ctx.closePath();
}

function star(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function feather(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.ellipse(0, 0, size, size * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha *= 0.5;
  ctx.strokeStyle = 'rgba(122,78,54,.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-size * 1.15, 0);
  ctx.lineTo(size, 0);
  ctx.stroke();
}
