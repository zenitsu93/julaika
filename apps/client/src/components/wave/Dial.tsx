import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
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
}

/**
 * Cadran de Wavelength. L'aiguille suit un ressort (voir motion/useSpring) : tirée au doigt,
 * elle colle au pointeur avec un soupçon d'élasticité ; bougée par un coéquipier, elle glisse.
 */
export function Dial({ spectrum, target, open, value, movable, onMove, onLock }: DialProps) {
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
        </defs>

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
