import { reducedMotion } from './animate';

const COLORS = ['#f5b700', '#dc2626', '#2563eb', '#16a34a', '#a855f7'];

/** Courte pluie de confettis (1,4 s) sur un canvas posé par-dessus ; s'efface toute seule. */
export function confetti(canvas: HTMLCanvasElement | null, count = 90) {
  if (!canvas || reducedMotion()) return () => {};
  const { width, height } = canvas.getBoundingClientRect();
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const parts = Array.from({ length: count }, () => ({
    x: width / 2 + (Math.random() - 0.5) * 60,
    y: height * 0.4,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 8 - 4,
    a: Math.random() * 6,
    va: (Math.random() - 0.5) * 0.3,
    w: 5 + Math.random() * 4,
    c: COLORS[(Math.random() * COLORS.length) | 0]!,
  }));
  const t0 = performance.now();
  let raf = 0;
  const step = (t: number) => {
    const k = (t - t0) / 1400;
    ctx.clearRect(0, 0, width, height);
    if (k >= 1) return;
    ctx.globalAlpha = Math.min(1, (1 - k) / 0.4);
    for (const p of parts) {
      p.vy += 0.18;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.a += p.va;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -2.5, p.w, 5);
      ctx.restore();
    }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, width, height);
  };
}
