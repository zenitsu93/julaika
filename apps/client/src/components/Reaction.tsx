import { useEffect, useRef, useState } from 'react';
import { useGame } from '../lib/store';
import { FROWN, playReaction, SMILE } from '../motion/reaction';

type Kind = 'win' | 'lose';

/**
 * Sourire quand tu trouves le mot, moue quand le tour finit sans que tu l'aies trouvé.
 * Le dessinateur ne voit rien. Posé au-dessus du tableau, sans bloquer le jeu.
 */
export function Reaction() {
  const me = useGame((s) => s.room!.players.find((p) => p.id === s.selfId));
  const phase = useGame((s) => s.room!.phase);
  const drawing = useGame((s) => s.room!.drawerId === s.selfId);
  const [kind, setKind] = useState<Kind | null>(null);
  const prev = useRef({ guessed: me?.guessed ?? false, phase });

  useEffect(() => {
    const before = prev.current;
    prev.current = { guessed: me?.guessed ?? false, phase };
    if (drawing || !me) return;
    // Le dernier à trouver clôt le tour : le passage à « trouvé » et la fin du tour arrivent ensemble.
    if (me.guessed && !before.guessed) setKind('win');
    else if (phase === 'turnEnd' && before.phase === 'drawing' && !me.guessed) setKind('lose');
  }, [me?.guessed, phase, drawing, me]);

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!kind || !el) return;
    const q = <T extends Element>(s: string) => el.querySelector<T>(s)!;
    const abort = new AbortController();
    void playReaction(
      {
        veil: q('[data-veil]'),
        face: q('[data-face]'),
        pencil: q('[data-pencil]'),
        head: q('[data-head]'),
        eyes: [...el.querySelectorAll<SVGPathElement>('[data-eye]')],
        mouth: q('[data-mouth]'),
        drop: q('[data-drop]'),
        joy: q('[data-joy]'),
      },
      kind === 'win',
      abort.signal,
    ).then(() => !abort.signal.aborted && setKind(null));
    return () => abort.abort();
  }, [kind]);

  if (!kind) return null;
  const win = kind === 'win';
  const line = win ? '#18181b' : '#71717a';

  return (
    <div ref={root} className="pointer-events-none absolute inset-0 z-20 grid place-items-center" aria-hidden>
      <div data-veil className="absolute inset-0 bg-white/85 opacity-0" />
      {/* Taille fixe de 200 px : le trajet du crayon est en pixels. Réduit sur téléphone. */}
      <div className="size-[200px] max-sm:scale-75">
        <div data-face className="relative size-full opacity-0">
          <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path data-head d="M100 28c40 0 72 30 72 72s-32 72-72 72-72-30-72-72c0-38 28-70 68-72" stroke={line} strokeWidth="5" pathLength={1} />
            <path data-eye d="M74 82v10" stroke={line} strokeWidth="7" pathLength={1} />
            <path data-eye d="M126 82v10" stroke={line} strokeWidth="7" pathLength={1} />
            <path data-mouth d={win ? SMILE : FROWN} stroke={win ? '#f5b700' : '#a1a1aa'} strokeWidth="8" pathLength={1} />
            <path data-drop d="M150 70c6 10 8 16 3 19s-9-3-3-19z" fill="#60a5fa" stroke="none" opacity="0" />
            <g data-joy stroke="#f5b700" strokeWidth="5" opacity="0" style={{ transformOrigin: '100px 100px' }}>
              <path d="M30 30 16 16" />
              <path d="M100 10V-8" />
              <path d="m170 30 14-14" />
              <path d="M190 100h18" />
              <path d="M10 100H-8" />
            </g>
          </svg>
          {/* Le crayon du logo ; sa pointe suit le trait dessiné. */}
          <div data-pencil className="absolute left-0 top-0 h-16 w-[26px] opacity-0" style={{ offsetAnchor: '50% 100%', offsetRotate: '0deg' }}>
            <svg viewBox="30 2 18 44" className="size-full origin-bottom rotate-[28deg]">
              <rect x="32" y="4" width="14" height="7" rx="3" fill="#f5b700" />
              <rect x="32" y="13" width="14" height="22" fill="#18181b" />
              <path d="M32 37.5H46L42.4 43.6H35.6Z" fill="#18181b" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
