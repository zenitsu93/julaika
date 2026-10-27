// Dessin des trois jeux d'action sur le canvas, à partir d'une image (interpolée) du monde.
// Le joueur de droite voit le monde retourné : X() convertit les abscisses du serveur.

import {
  ARCADE_H,
  ARCADE_W,
  BED_LEFT,
  BED_RIGHT,
  BED_TOP,
  DRAP_FLOOR,
  DRAP_KISS_COOLDOWN,
  DRAP_LIVES,
  DRAP_MAX,
  DRAP_MIN,
  DRAP_Y,
  DrapItem,
  FOOT_BALL_R,
  FOOT_FLOOR,
  FOOT_GOAL_TOP,
  FOOT_GOAL_W,
  FOOT_PLAYER_R,
  RAG_BONES,
  ROOM_FLOOR,
  drapMultiplier,
  drapSag,
  drapView,
  footView,
  pillowAt,
  pillowView,
  type ArcadeKind,
} from '@julaika/shared';
import { heart, type Fx } from './fx';

export interface Paint {
  dark: boolean;
  page: string;
  surface: string;
  edge: string;
  ink: string;
  muted: string;
  cacao: string;
  cacao2: string;
  butter: string;
  gold: string;
  accent: string;
  good: string;
  bad: string;
  rose: string;
}

export function readPaint(): Paint {
  const css = getComputedStyle(document.documentElement);
  const c = (n: string, fallback: string) => css.getPropertyValue(`--color-${n}`).trim() || fallback;
  const page = c('page', '#fbf8f3');
  return {
    dark: luminance(page) < 0.3,
    page,
    surface: c('surface', '#ffffff'),
    edge: c('edge', '#ece2d1'),
    ink: c('ink', '#2a1a12'),
    muted: c('muted', '#86705f'),
    cacao: c('cacao', '#4b2e21'),
    cacao2: c('cacao-2', '#7a4e36'),
    butter: c('butter', '#f2e6b3'),
    gold: c('gold', '#d9a441'),
    accent: c('accent', '#b07d2c'),
    good: c('good', '#16a34a'),
    bad: c('bad', '#dc2626'),
    rose: '#d4607a',
  };
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 1;
  const n = parseInt(m[1]!, 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

export interface Scene {
  ctx: CanvasRenderingContext2D;
  v: Float32Array;
  paint: Paint;
  /** Retourné pour le joueur de droite : il se voit toujours à gauche. */
  mirror: boolean;
  /** Avatars (émojis) du camp 0 et du camp 1. */
  faces: [string, string];
  /** Camp du joueur qui regarde, null pour un spectateur. */
  self: 0 | 1 | null;
  /** Secondes écoulées, pour les petites animations d'ambiance. */
  t: number;
  dt: number;
  fx: Fx;
}

/** Chocolat à gauche, or à droite ; en sombre, le chocolat s'éclaircit pour rester lisible. */
export const sideColor = (p: Paint, side: number) => (side === 0 ? (p.dark ? '#b07a52' : p.cacao2) : p.gold);

export function render(kind: ArcadeKind, s: Scene) {
  if (kind === 'foot') drawFoot(s);
  else if (kind === 'oreillers') drawPillows(s);
  else drawDrap(s);
}

const mapX = (s: Scene) => (x: number) => (s.mirror ? ARCADE_W - x : x);

function face(ctx: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number) {
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x, y + size * 0.06);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

// ---- Tête-à-tête ---------------------------------------------------------------------------

function drawFoot(s: Scene) {
  const { ctx, paint: p, fx } = s;
  const X = mapX(s);
  const v = footView(s.v);

  // Ciel du stade, puis pelouse caramel en bandes et la ligne de fond crème.
  const sky = ctx.createLinearGradient(0, 0, 0, FOOT_FLOOR);
  sky.addColorStop(0, p.dark ? '#1c120d' : '#fffaf0');
  sky.addColorStop(1, p.dark ? '#2a1b13' : '#f4e9cc');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, ARCADE_W, FOOT_FLOOR);
  // Tribunes : des rangées de petits points qui ondulent comme une ola.
  ctx.fillStyle = p.dark ? 'rgba(244,234,210,.05)' : 'rgba(75,46,33,.05)';
  ctx.fillRect(0, 26, ARCADE_W, 160);
  ctx.fillStyle = p.dark ? p.cacao2 : p.cacao;
  ctx.fillRect(0, 18, ARCADE_W, 10);
  for (let row = 0; row < 6; row++) {
    for (let i = 0; i < 46; i++) {
      const x = 12 + i * 17.4 + (row % 2) * 8;
      const y = 44 + row * 25 + Math.sin(s.t * 3 - i * 0.35 - row * 0.5) * 2.5;
      ctx.fillStyle = (i + row) % 5 === 0 ? p.gold : p.dark ? 'rgba(244,234,210,.12)' : 'rgba(75,46,33,.12)';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = p.dark ? 'rgba(244,234,210,.06)' : 'rgba(75,46,33,.06)';
  ctx.fillRect(0, 186, ARCADE_W, 6);

  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? (p.dark ? '#33231a' : '#e6d6a3') : p.dark ? '#2b1d15' : '#ddca91';
    ctx.fillRect(i * 80, 240, 80, FOOT_FLOOR - 240);
  }
  const turf = ctx.createLinearGradient(0, 240, 0, FOOT_FLOOR);
  turf.addColorStop(0, p.dark ? 'rgba(17,11,8,.65)' : 'rgba(255,250,240,.75)');
  turf.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = turf;
  ctx.fillRect(0, 240, ARCADE_W, FOOT_FLOOR - 240);
  ctx.fillStyle = p.dark ? '#140c08' : p.cacao;
  ctx.fillRect(0, FOOT_FLOOR, ARCADE_W, ARCADE_H - FOOT_FLOOR);
  ctx.fillStyle = p.butter;
  ctx.fillRect(0, FOOT_FLOOR, ARCADE_W, 3);
  ctx.fillRect(ARCADE_W / 2 - 1.5, FOOT_FLOOR, 3, ARCADE_H - FOOT_FLOOR);

  // Cages : filet en losanges, poteau et barre.
  for (const side of [0, 1]) {
    const x0 = side === 0 ? 0 : ARCADE_W - FOOT_GOAL_W;
    const mouth = X(side === 0 ? FOOT_GOAL_W : ARCADE_W - FOOT_GOAL_W);
    const back = X(side === 0 ? 0 : ARCADE_W);
    const l = Math.min(X(x0), X(x0 + FOOT_GOAL_W));
    ctx.save();
    ctx.beginPath();
    ctx.rect(l, FOOT_GOAL_TOP, FOOT_GOAL_W, FOOT_FLOOR - FOOT_GOAL_TOP);
    ctx.clip();
    ctx.fillStyle = p.dark ? 'rgba(244,234,210,.05)' : 'rgba(75,46,33,.05)';
    ctx.fillRect(l, FOOT_GOAL_TOP, FOOT_GOAL_W, FOOT_FLOOR - FOOT_GOAL_TOP);
    ctx.strokeStyle = p.dark ? 'rgba(244,234,210,.28)' : 'rgba(75,46,33,.28)';
    ctx.lineWidth = 1;
    for (let k = -10; k < 20; k++) {
      ctx.beginPath();
      ctx.moveTo(l + k * 12, FOOT_GOAL_TOP);
      ctx.lineTo(l + k * 12 + 150, FOOT_FLOOR);
      ctx.moveTo(l + k * 12 + 150, FOOT_GOAL_TOP);
      ctx.lineTo(l + k * 12, FOOT_FLOOR);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = p.dark ? p.butter : p.surface;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(back, FOOT_GOAL_TOP);
    ctx.lineTo(mouth, FOOT_GOAL_TOP);
    ctx.lineTo(mouth, FOOT_FLOOR);
    ctx.stroke();
    ctx.strokeStyle = sideColor(p, side);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(back, FOOT_GOAL_TOP);
    ctx.lineTo(mouth, FOOT_GOAL_TOP);
    ctx.stroke();
  }

  // Ombres au sol : plus l'objet est haut, plus elle est petite et pâle.
  const shadow = (x: number, y: number, r: number) => {
    const h = Math.max(0, FOOT_FLOOR - y);
    const k = Math.max(0.25, 1 - h / 260);
    ctx.fillStyle = `rgba(42,26,18,${0.28 * k})`;
    ctx.beginPath();
    ctx.ellipse(X(x), FOOT_FLOOR + 2, r * k, 5 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  shadow(v.ball.x, v.ball.y + FOOT_BALL_R, FOOT_BALL_R);
  v.players.forEach((pl) => shadow(pl.x, pl.y + FOOT_PLAYER_R, FOOT_PLAYER_R * 0.9));

  // Joueurs : une grosse tête à l'avatar, une chaussure qui part en avant quand on frappe.
  v.players.forEach((pl, side) => {
    const x = X(pl.x);
    const toward = (side === 0 ? 1 : -1) * (s.mirror ? -1 : 1);
    const color = sideColor(p, side);
    // Jauge de frappe bisou : un anneau qui se remplit, qui palpite une fois plein.
    if (pl.meter > 0.02) {
      const full = pl.meter >= 1;
      ctx.strokeStyle = full ? p.rose : p.gold;
      ctx.globalAlpha = full ? 0.6 + Math.sin(s.t * 10) * 0.35 : 0.55;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, pl.y, FOOT_PLAYER_R + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pl.meter);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (full) {
        ctx.fillStyle = p.rose;
        heart(ctx, x, pl.y - FOOT_PLAYER_R - 16 + Math.sin(s.t * 6) * 2, 7);
        ctx.fill();
      }
    }
    // Chaussure.
    const swing = pl.kick > 0 ? Math.sin(pl.kick * Math.PI) : 0;
    const fx0 = x + toward * (10 + swing * 22);
    const fy0 = pl.y + FOOT_PLAYER_R - 4 - swing * 14;
    ctx.save();
    ctx.translate(fx0, fy0);
    ctx.rotate(-toward * swing * 0.7);
    ctx.fillStyle = p.dark ? p.butter : p.cacao;
    roundRect(ctx, toward > 0 ? -8 : -14, -6, 22, 11, 5);
    ctx.fill();
    ctx.restore();
    // Tête.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, pl.y, FOOT_PLAYER_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.dark ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.45)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, pl.y, FOOT_PLAYER_R - 5, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
    face(ctx, s.faces[side]!, x + toward * 3, pl.y + 2, 34);
    if (s.self === side) {
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(x - 7, pl.y - FOOT_PLAYER_R - 22);
      ctx.lineTo(x + 7, pl.y - FOOT_PLAYER_R - 22);
      ctx.lineTo(x, pl.y - FOOT_PLAYER_R - 13);
      ctx.fill();
    }
  });

  // Ballon : crème, motif chocolat qui tourne avec sa course ; traînée de cœurs en frappe bisou.
  const bx = X(v.ball.x);
  if (v.ball.kiss > 0 && Math.random() < 0.7) fx.add('heart', bx, v.ball.y, { vy: -20, size: 6 + Math.random() * 5, color: p.rose, max: 0.6 });
  ctx.save();
  ctx.translate(bx, v.ball.y);
  ctx.rotate((v.ball.x / FOOT_BALL_R) * (s.mirror ? -1 : 1));
  ctx.fillStyle = '#fffaf0';
  ctx.beginPath();
  ctx.arc(0, 0, FOOT_BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.cacao;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = p.cacao;
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 9, Math.sin(a) * 9, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---- Bataille d'oreillers ------------------------------------------------------------------

function drawPillows(s: Scene) {
  const { ctx, paint: p } = s;
  const X = mapX(s);
  const v = pillowView(s.v);

  // Chambre : papier peint à pois, tête de lit, plancher.
  ctx.fillStyle = p.dark ? '#1e140f' : '#f8efdc';
  ctx.fillRect(0, 0, ARCADE_W, ROOM_FLOOR);
  ctx.fillStyle = p.dark ? 'rgba(214,162,74,.08)' : 'rgba(176,125,44,.12)';
  for (let y = 18; y < ROOM_FLOOR; y += 34) {
    for (let x = (y / 34) % 2 ? 18 : 35; x < ARCADE_W; x += 34) {
      heart(ctx, x, y, 4);
      ctx.fill();
    }
  }
  // Fenêtre avec la lune (ou le soleil), et un cadre au mur.
  ctx.fillStyle = p.dark ? '#0d1220' : '#cfe3ee';
  roundRect(ctx, 50, 60, 110, 120, 10);
  ctx.fill();
  ctx.fillStyle = p.dark ? '#f2e6b3' : '#f6d27a';
  ctx.beginPath();
  ctx.arc(126, 96, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = p.cacao2;
  ctx.lineWidth = 6;
  roundRect(ctx, 50, 60, 110, 120, 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(105, 60);
  ctx.lineTo(105, 180);
  ctx.moveTo(50, 120);
  ctx.lineTo(160, 120);
  ctx.stroke();
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 4;
  roundRect(ctx, 655, 80, 80, 60, 6);
  ctx.stroke();
  ctx.fillStyle = p.rose;
  heart(ctx, 695, 110, 12);
  ctx.fill();

  // Plancher.
  ctx.fillStyle = p.dark ? '#3a2418' : '#c99a62';
  ctx.fillRect(0, ROOM_FLOOR, ARCADE_W, ARCADE_H - ROOM_FLOOR);
  ctx.strokeStyle = 'rgba(42,26,18,.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x < ARCADE_W; x += 90) {
    ctx.beginPath();
    ctx.moveTo(x + ((x / 90) % 2) * 40, ROOM_FLOOR);
    ctx.lineTo(x + ((x / 90) % 2) * 40, ARCADE_H);
    ctx.stroke();
  }
  // Le lit : tête de lit, cadre, matelas matelassé, couette.
  const bl = Math.min(X(BED_LEFT), X(BED_RIGHT));
  const bw = BED_RIGHT - BED_LEFT;
  ctx.fillStyle = p.cacao2;
  roundRect(ctx, bl - 14, BED_TOP - 120, 26, 220, 10);
  ctx.fill();
  roundRect(ctx, bl + bw - 12, BED_TOP - 70, 26, 170, 10);
  ctx.fill();
  ctx.fillStyle = p.cacao;
  ctx.fillRect(bl, BED_TOP + 34, bw, 30);
  ctx.fillRect(bl + 8, BED_TOP + 60, 12, ROOM_FLOOR - BED_TOP - 60);
  ctx.fillRect(bl + bw - 20, BED_TOP + 60, 12, ROOM_FLOOR - BED_TOP - 60);
  ctx.fillStyle = '#fffaf0';
  roundRect(ctx, bl, BED_TOP, bw, 40, 14);
  ctx.fill();
  ctx.fillStyle = p.butter;
  roundRect(ctx, bl, BED_TOP + 12, bw, 30, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(176,125,44,.45)';
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1.5;
  for (let x = bl + 50; x < bl + bw; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, BED_TOP + 16);
    ctx.lineTo(x, BED_TOP + 38);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Pantins.
  v.rags.forEach((r, side) => {
    const color = sideColor(p, side);
    const pts = r.pts.map((q) => ({ x: X(q.x), y: q.y }));
    // Ombre sur le matelas ou le plancher.
    const pel = pts[2]!;
    const floor = r.pts[2]!.x >= BED_LEFT && r.pts[2]!.x <= BED_RIGHT && r.pts[2]!.y < BED_TOP + 10 ? BED_TOP + 4 : ROOM_FLOOR + 3;
    ctx.fillStyle = 'rgba(42,26,18,.18)';
    ctx.beginPath();
    ctx.ellipse(pel.x, floor, 22, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    for (const [a, b] of RAG_BONES) {
      if (a === 0) continue;
      ctx.lineWidth = a === 1 && b === 2 ? 15 : 9;
      ctx.beginPath();
      ctx.moveTo(pts[a]!.x, pts[a]!.y);
      ctx.lineTo(pts[b]!.x, pts[b]!.y);
      ctx.stroke();
    }
    // Oreiller au bout de la main avant, avec la trace de l'élan.
    const pillow = pillowAt(pts[4]!, pts[1]!);
    if (r.swing > 0.15 && r.swing < 0.95) {
      ctx.strokeStyle = p.dark ? 'rgba(242,230,179,.25)' : 'rgba(122,78,54,.18)';
      ctx.lineWidth = 18;
      ctx.beginPath();
      const a = Math.atan2(pillow.y - pts[1]!.y, pillow.x - pts[1]!.x);
      const d = Math.hypot(pillow.x - pts[1]!.x, pillow.y - pts[1]!.y);
      const back = (s.mirror ? -1 : 1) * r.facing > 0 ? -1 : 1;
      ctx.arc(pts[1]!.x, pts[1]!.y, d, a + back * 0.9, a, back < 0 ? false : true);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(pillow.x, pillow.y);
    ctx.rotate(pillow.angle);
    ctx.fillStyle = '#fffdf7';
    roundRect(ctx, -14, -20, 28, 40, 12);
    ctx.fill();
    ctx.strokeStyle = p.cacao2;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = p.gold;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    roundRect(ctx, -9, -15, 18, 30, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Tête.
    const h = pts[0]!;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 17, 0, Math.PI * 2);
    ctx.fill();
    face(ctx, s.faces[side]!, h.x, h.y + 1, 22);
    // Étourdi : des étoiles tournent autour de la tête.
    if (r.stun) {
      ctx.fillStyle = p.gold;
      for (let i = 0; i < 3; i++) {
        const a = s.t * 6 + (i * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(h.x + Math.cos(a) * 22, h.y - 20 + Math.sin(a) * 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Dégâts : plus ils montent, plus on vole loin.
    if (r.dmg > 0) {
      const hot = Math.min(1, r.dmg / 120);
      ctx.font = '800 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hot > 0.6 ? p.bad : hot > 0.3 ? p.accent : p.muted;
      ctx.fillText(`${Math.round(r.dmg)} %`, h.x, h.y - 32);
    }
    if (s.self === side) {
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(h.x - 6, h.y - 52);
      ctx.lineTo(h.x + 6, h.y - 52);
      ctx.lineTo(h.x, h.y - 44);
      ctx.fill();
    }
  });
}

// ---- Le Drap tendu -------------------------------------------------------------------------

function drawDrap(s: Scene) {
  const { ctx, paint: p } = s;
  const v = drapView(s.v);
  const [h0, h1] = v.hands;

  const sky = ctx.createLinearGradient(0, 0, 0, ARCADE_H);
  sky.addColorStop(0, p.dark ? '#140d0a' : '#fff4d8');
  sky.addColorStop(1, p.dark ? '#2a1b13' : '#f4e2b5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, ARCADE_W, ARCADE_H);
  // Nuages d'ambiance qui dérivent.
  ctx.fillStyle = p.dark ? 'rgba(244,234,210,.05)' : 'rgba(255,255,255,.7)';
  for (let i = 0; i < 4; i++) {
    const x = ((s.t * (8 + i * 3) + i * 230) % (ARCADE_W + 200)) - 100;
    const y = 50 + i * 55;
    cloud(ctx, x, y, 0.8 + (i % 2) * 0.4);
  }
  ctx.fillStyle = p.dark ? '#140c08' : p.cacao;
  ctx.fillRect(0, DRAP_FLOOR - 2, ARCADE_W, ARCADE_H - DRAP_FLOOR + 2);

  // Objets qui tombent.
  for (const it of v.items) {
    if (it.kind === DrapItem.Storm) {
      ctx.fillStyle = p.dark ? '#5d5a66' : '#7d7884';
      cloud(ctx, it.x, it.y - 6, 0.55);
      ctx.fillStyle = '#f6d27a';
      ctx.beginPath();
      ctx.moveTo(it.x + 2, it.y);
      ctx.lineTo(it.x - 7, it.y + 14);
      ctx.lineTo(it.x, it.y + 13);
      ctx.lineTo(it.x - 4, it.y + 26);
      ctx.lineTo(it.x + 9, it.y + 9);
      ctx.lineTo(it.x + 2, it.y + 10);
      ctx.closePath();
      ctx.fill();
    } else {
      const gold = it.kind === DrapItem.Gold;
      const beat = 1 + Math.sin(s.t * 8 + it.id) * 0.08;
      ctx.fillStyle = gold ? p.gold : p.rose;
      heart(ctx, it.x, it.y, (gold ? 15 : 12) * beat);
      ctx.fill();
      if (gold) {
        ctx.strokeStyle = '#fffaf0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  // Les deux porteurs, sous les coins du drap.
  const tension = Math.max(0, Math.min(1, (h1 - h0 - DRAP_MIN) / (DRAP_MAX - DRAP_MIN)));
  [h0, h1].forEach((hx, side) => {
    const out = side === 0 ? -1 : 1;
    const bx = hx + out * 20;
    const head = DRAP_Y + 26;
    ctx.strokeStyle = sideColor(p, side);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Corps, jambes un peu écartées, bras levé qui tient le coin.
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(bx, head + 18);
    ctx.lineTo(bx, head + 52);
    ctx.stroke();
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(bx, head + 50);
    ctx.lineTo(bx - 9, DRAP_FLOOR - 3);
    ctx.moveTo(bx, head + 50);
    ctx.lineTo(bx + 9, DRAP_FLOOR - 3);
    ctx.moveTo(bx, head + 24);
    ctx.lineTo(hx, DRAP_Y);
    ctx.moveTo(bx, head + 26);
    ctx.lineTo(bx + out * 14, head + 46);
    ctx.stroke();
    ctx.fillStyle = sideColor(p, side);
    ctx.beginPath();
    ctx.arc(bx, head, 17, 0, Math.PI * 2);
    ctx.fill();
    face(ctx, s.faces[side]!, bx, head + 1, 22);
    if (s.self === side) {
      ctx.fillStyle = p.ink;
      ctx.beginPath();
      ctx.moveTo(bx - 6, head - 32);
      ctx.lineTo(bx + 6, head - 32);
      ctx.lineTo(bx, head - 24);
      ctx.fill();
    }
  });

  // Le drap : une parabole, tissu crème à liseré or ; tendu au maximum, il vire à l'or.
  const sag = drapSag(v.hands);
  const mid = (h0 + h1) / 2;
  ctx.beginPath();
  ctx.moveTo(h0, DRAP_Y);
  ctx.quadraticCurveTo(mid, DRAP_Y + sag * 2, h1, DRAP_Y);
  ctx.quadraticCurveTo(mid, DRAP_Y + sag * 2 + 16, h0, DRAP_Y);
  ctx.closePath();
  ctx.fillStyle = tension > 0.92 ? p.butter : '#fffaf0';
  ctx.fill();
  ctx.strokeStyle = tension > 0.92 ? p.accent : p.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(h0, DRAP_Y);
  ctx.quadraticCurveTo(mid, DRAP_Y + sag * 2, h1, DRAP_Y);
  ctx.stroke();
  ctx.fillStyle = p.gold;
  for (const hx of [h0, h1]) {
    ctx.beginPath();
    ctx.arc(hx, DRAP_Y, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Onde du bisou.
  if (v.wave > 0) {
    ctx.strokeStyle = p.rose;
    ctx.globalAlpha = v.wave;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(mid, DRAP_Y, 40 + (1 - v.wave) * 220, Math.PI, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Interface : vies, série, bisou prêt.
  for (let i = 0; i < DRAP_LIVES; i++) {
    ctx.fillStyle = i < v.lives ? p.rose : p.dark ? 'rgba(244,234,210,.15)' : 'rgba(75,46,33,.15)';
    heart(ctx, 26 + i * 28, 26, 11);
    ctx.fill();
  }
  const mult = drapMultiplier(v.combo);
  if (v.combo > 1) {
    ctx.font = '800 16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = mult > 1 ? p.accent : p.muted;
    ctx.fillText(`${v.combo} d'affilée${mult > 1 ? `  ×${mult}` : ''}`, ARCADE_W / 2, 24);
  }
  const ready = v.kiss <= 0;
  const kx = ARCADE_W - 34;
  ctx.strokeStyle = p.dark ? 'rgba(244,234,210,.2)' : 'rgba(75,46,33,.2)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(kx, 28, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = p.rose;
  ctx.beginPath();
  ctx.arc(kx, 28, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - v.kiss / DRAP_KISS_COOLDOWN));
  ctx.stroke();
  ctx.globalAlpha = ready ? 0.75 + Math.sin(s.t * 6) * 0.25 : 0.4;
  face(ctx, '💋', kx, 28, 16);
  ctx.globalAlpha = 1;
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, k: number) {
  ctx.beginPath();
  ctx.arc(x, y, 18 * k, 0, Math.PI * 2);
  ctx.arc(x + 20 * k, y + 4 * k, 14 * k, 0, Math.PI * 2);
  ctx.arc(x - 20 * k, y + 5 * k, 13 * k, 0, Math.PI * 2);
  ctx.arc(x + 4 * k, y + 8 * k, 16 * k, 0, Math.PI * 2);
  ctx.fill();
}
