import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { DIAL_MAX, WAVE_BANDS, type Spectrum } from '@julaika/shared';
import { useSpring } from '../../motion';

// Demi-disque : centre en bas, 0 à gauche, 100 à droite.
const W = 400;
const CX = 200;
const CY = 206;
const R = 186;

const angleOf = (v: number) => Math.PI * (1 - v / DIAL_MAX);
const at = (v: number, r: number) => [CX + r * Math.cos(angleOf(v)), CY - r * Math.sin(angleOf(v))] as const;

/** Part de disque entre deux valeurs, depuis le centre. */
function sector(from: number, to: number) {
  const a = Math.max(0, from);
  const b = Math.min(DIAL_MAX, to);
  const [x1, y1] = at(a, R);
  const [x2, y2] = at(b, R);
  return `M${CX} ${CY}L${x1.toFixed(1)} ${y1.toFixed(1)}A${R} ${R} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}Z`;
}

const HALF_DISC = `M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}Z`;

// Du plus large au plus précis : bleu 2 pts, orange 3 pts, jaune de la marque 4 pts.
const BAND_FILL: Record<number, string> = { 2: '#3b82f6', 3: '#f97316', 4: '#f5b700' };

export interface DialProps {
  spectrum: Spectrum | null;
  /** Cible visible (télépathe, ou révélation) ; null = cachée derrière le volet. */
  target: number | null;
  /** Le volet s'ouvre sur la cible. */
  open: boolean;
  value: number;
  /** Peut-on tirer l'aiguille ? */
  movable: boolean;
  onMove?: (v: number) => void;
  onLock?: () => void;
  /** Révélation trop loin de la cible : le cadran vole en éclats puis se recompose. */
  boom?: boolean;
}

// Éclats : deux couronnes de parts du demi-disque, chacune projetée le long de sa bissectrice.
const SHARDS = Array.from({ length: 14 }, (_, i) => {
  const outer = i < 8;
  const n = outer ? 8 : 6;
  const k = outer ? i : i - 8;
  const from = (k / n) * DIAL_MAX;
  const to = ((k + 1) / n) * DIAL_MAX;
  const r0 = outer ? R * 0.55 : 22;
  const r1 = outer ? R : R * 0.55;
  const [ax, ay] = at(from, r1);
  const [bx, by] = at(to, r1);
  const [cx, cy] = at(to, r0);
  const [dx, dy] = at(from, r0);
  const mid = angleOf((from + to) / 2);
  const dist = (outer ? 150 : 90) + ((i * 37) % 50);
  return {
    d: `M${dx.toFixed(1)} ${dy.toFixed(1)}L${ax.toFixed(1)} ${ay.toFixed(1)}A${r1} ${r1} 0 0 1 ${bx.toFixed(1)} ${by.toFixed(1)}L${cx.toFixed(1)} ${cy.toFixed(1)}A${r0} ${r0} 0 0 0 ${dx.toFixed(1)} ${dy.toFixed(1)}Z`,
    dx: Math.cos(mid) * dist,
    dy: -Math.sin(mid) * dist,
    rot: (i % 2 ? 1 : -1) * (40 + ((i * 53) % 120)),
    dark: i % 3 === 0,
    delay: (i * 13) % 60,
  };
});

// Étincelles : petits points brûlants qui partent en étoile.
const SPARKS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2 + (i % 3) * 0.2;
  const dist = 110 + ((i * 41) % 90);
  return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist, r: 2 + (i % 3), color: i % 2 ? '#f5b700' : '#f97316', delay: (i * 7) % 50 };
});

// Le volet s'ouvre en 0,9 s ; on laisse voir l'aiguille loin de la cible avant que tout saute.
export const BOOM_AT = 1500;
const BOOM_X = CX;
const BOOM_Y = CY - R * 0.42;

/** L'explosion, par-dessus le cadran : éclair, onde de choc, éclats, étincelles, fumée et « BOUM ». */
function Boom() {
  const v = (o: Record<string, string | number>) => o as CSSProperties;
  return (
    <g className="w-boom-fx" aria-hidden>
      <circle cx={BOOM_X} cy={BOOM_Y} r="70" fill="url(#w-flash)" className="w-flash" style={{ transformOrigin: `${BOOM_X}px ${BOOM_Y}px`, animationDelay: `${BOOM_AT}ms` }} />
      {[0, 120].map((d) => (
        <circle key={d} cx={BOOM_X} cy={BOOM_Y} r="60" fill="none" stroke="#f97316" strokeWidth="5" className="w-ring" style={{ transformOrigin: `${BOOM_X}px ${BOOM_Y}px`, animationDelay: `${BOOM_AT + d}ms` }} />
      ))}
      {SHARDS.map((sh, i) => (
        <path
          key={i}
          d={sh.d}
          fill={sh.dark ? '#18181b' : 'var(--color-page)'}
          stroke="var(--color-edge)"
          strokeWidth="2"
          className="w-shard"
          style={v({ '--dx': `${sh.dx.toFixed(0)}px`, '--dy': `${sh.dy.toFixed(0)}px`, '--rot': `${sh.rot}deg`, transformOrigin: `${CX}px ${CY - R / 2}px`, animationDelay: `${BOOM_AT + sh.delay}ms` })}
        />
      ))}
      {SPARKS.map((sp, i) => (
        <circle
          key={i}
          cx={BOOM_X}
          cy={BOOM_Y}
          r={sp.r}
          fill={sp.color}
          className="w-spark"
          style={v({ '--dx': `${sp.dx.toFixed(0)}px`, '--dy': `${sp.dy.toFixed(0)}px`, animationDelay: `${BOOM_AT + sp.delay}ms` })}
        />
      ))}
      {[-46, 0, 46].map((x, i) => (
        <circle key={x} cx={BOOM_X + x} cy={BOOM_Y + (i === 1 ? -14 : 10)} r="34" className="w-smoke fill-muted" style={{ transformOrigin: `${BOOM_X + x}px ${BOOM_Y}px`, animationDelay: `${BOOM_AT + 100 + i * 80}ms` }} />
      ))}
      <text x={BOOM_X} y={BOOM_Y} textAnchor="middle" dominantBaseline="central" className="w-boom-word font-black" style={{ transformOrigin: `${BOOM_X}px ${BOOM_Y}px`, animationDelay: `${BOOM_AT + 50}ms` }}>
        BOUM !
      </text>
    </g>
  );
}

/**
 * Cadran de Wavelength. L'aiguille suit un ressort (voir motion/useSpring) : tirée au doigt,
 * elle colle au pointeur avec un soupçon d'élasticité ; bougée par un coéquipier, elle glisse.
 */
export function Dial({ spectrum, target, open, value, movable, onMove, onLock, boom = false }: DialProps) {
  const svg = useRef<SVGSVGElement>(null);
  const needle = useRef<SVGGElement>(null);
  const dragging = useRef(false);

  useSpring(value, (v) => needle.current?.setAttribute('transform', `rotate(${((v - DIAL_MAX / 2) * 180) / DIAL_MAX} ${CX} ${CY})`), {
    stiffness: 260,
    damping: 22,
  });

  const fromPointer = (e: PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const scale = W / r.width; // le SVG garde son ratio : une seule échelle
    const x = (e.clientX - r.left) * scale - CX;
    const y = CY - (e.clientY - r.top) * scale;
    // Sous le centre, on garde le bord le plus proche plutôt que de sauter de l'autre côté.
    const angle = Math.atan2(Math.max(0, y), x);
    return Math.round((1 - angle / Math.PI) * DIAL_MAX * 10) / 10;
  };

  const onKey = (e: KeyboardEvent) => {
    if (!movable) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onMove?.(Math.max(0, value - step));
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onMove?.(Math.min(DIAL_MAX, value + step));
    else if (e.key === 'Home') onMove?.(0);
    else if (e.key === 'End') onMove?.(DIAL_MAX);
    else if (e.key === 'Enter') onLock?.();
    else return;
    e.preventDefault();
  };

  const bands = [...WAVE_BANDS].reverse();
  const label = spectrum ? `Aiguille entre ${spectrum.left} et ${spectrum.right}` : 'Aiguille';

  return (
    <div className="relative mx-auto w-full max-w-[34rem] select-none">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${CY + 14}`}
        className={`block w-full touch-none overflow-visible outline-none ${movable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        role="slider"
        tabIndex={movable ? 0 : -1}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={DIAL_MAX}
        aria-valuenow={Math.round(value)}
        aria-disabled={!movable}
        onKeyDown={onKey}
        onPointerDown={(e) => {
          if (!movable || e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          onMove?.(fromPointer(e));
        }}
        onPointerMove={(e) => dragging.current && onMove?.(fromPointer(e))}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <defs>
          <clipPath id="w-upper">
            <rect x="0" y="0" width={W} height={CY} />
          </clipPath>
          <radialGradient id="w-shine" cx="50%" cy="100%" r="100%">
            <stop offset="0" stopColor="#fff" stopOpacity=".14" />
            <stop offset=".7" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="w-flash">
            <stop offset="0" stopColor="#fff" />
            <stop offset=".35" stopColor="#fde68a" />
            <stop offset=".7" stopColor="#f97316" stopOpacity=".6" />
            <stop offset="1" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Le cadran entier : il disparaît le temps de l'explosion, puis se recompose. */}
        <g className={boom ? 'w-crumble' : undefined} style={{ transformOrigin: `${CX}px ${CY}px`, animationDelay: `${BOOM_AT}ms` }}>
          {/* Fond du cadran et graduations. */}
          <path d={HALF_DISC} className="fill-page stroke-edge" strokeWidth="2" />
          {Array.from({ length: 21 }, (_, i) => {
            const v = i * 5;
            const [x1, y1] = at(v, R - (i % 2 ? 8 : 14));
            const [x2, y2] = at(v, R - 2);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-muted" strokeOpacity=".35" strokeWidth={i % 2 ? 1.5 : 2.5} strokeLinecap="round" />;
          })}

          {/* Zones de points autour de la cible. */}
          {target !== null && (
            <g key={target} clipPath="url(#w-upper)">
              {bands.map((b, i) => (
                <path
                  key={b.points}
                  d={sector(target - b.half, target + b.half)}
                  fill={BAND_FILL[b.points]}
                  fillOpacity={b.points === 4 ? 1 : 0.85}
                  className="w-fan"
                  style={{ transformOrigin: `${CX}px ${CY}px`, animationDelay: `${120 + i * 70}ms` }}
                />
              ))}
              {[-14, -7, 0, 7, 14].map((d) => {
                const v = target + d;
                if (v < 1 || v > DIAL_MAX - 1) return null;
                const [x, y] = at(v, R * 0.84);
                return (
                  <text key={d} x={x} y={y} textAnchor="middle" dominantBaseline="central" className="w-fan fill-[#18181b] font-mono text-[15px] font-bold" style={{ transformOrigin: `${CX}px ${CY}px`, animationDelay: '320ms' }}>
                    {WAVE_BANDS.find((b) => Math.abs(d) <= b.half)?.points}
                  </text>
                );
              })}
            </g>
          )}

          {/* Volet : couvre la cible, puis balaie le demi-disque vers le bas pour la dévoiler. */}
          <g clipPath="url(#w-upper)">
            <g className="w-shutter" style={{ transformOrigin: `${CX}px ${CY}px`, transform: open ? 'rotate(180deg)' : 'none' }}>
              <path d={HALF_DISC} fill="#18181b" />
              <path d={HALF_DISC} fill="url(#w-shine)" />
              {Array.from({ length: 9 }, (_, i) => {
                const [x, y] = at(10 + i * 10, R - 6);
                return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#fafafa" strokeOpacity=".05" strokeWidth="2" />;
              })}
              <path d={`M${CX - R * 0.62} ${CY}A${R * 0.62} ${R * 0.62} 0 0 1 ${CX + R * 0.62} ${CY}`} fill="none" stroke="#f5b700" strokeOpacity=".35" strokeWidth="2" strokeDasharray="2 8" strokeLinecap="round" />
            </g>
          </g>

          {/* Aiguille : posée sur 50 puis tournée par le ressort. */}
          <g ref={needle} transform={`rotate(${((value - DIAL_MAX / 2) * 180) / DIAL_MAX} ${CX} ${CY})`}>
            <line x1={CX} y1={CY} x2={CX} y2={CY - R + 10} stroke="#dc2626" strokeWidth="6" strokeLinecap="round" />
            <circle cx={CX} cy={CY - R + 10} r="9" fill="#dc2626" stroke="#fff" strokeWidth="3" />
            {movable && <circle cx={CX} cy={CY - R + 10} r="14" fill="none" stroke="#dc2626" strokeWidth="3" className="w-halo" />}
          </g>
          <circle cx={CX} cy={CY} r="20" className="fill-ink" />
          <circle cx={CX} cy={CY} r="7" fill="#f5b700" />
        </g>
        {boom && <Boom key={target} />}
      </svg>

      {/* Les deux extrêmes de la carte. */}
      {spectrum && (
        <div key={spectrum.left + spectrum.right} className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold sm:text-base">
          <span className="m-rise flex items-center gap-1.5 rounded-lg bg-[#3b82f6]/12 px-3 py-2 text-left">
            <span aria-hidden>←</span>
            {spectrum.left}
          </span>
          <span className="m-rise flex items-center justify-end gap-1.5 rounded-lg bg-accent/20 px-3 py-2 text-right" style={{ animationDelay: '60ms' }}>
            {spectrum.right}
            <span aria-hidden>→</span>
          </span>
        </div>
      )}
    </div>
  );
}
