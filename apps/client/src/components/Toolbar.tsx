import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { BRUSH_SIZES, PALETTE, type Trap } from '@julaika/shared';
import type { Pen, Tool } from '../lib/board';
import { net } from '../lib/net';
import { TRAP_INFO } from '../lib/traps';
import { animate, reducedMotion, useIndicator, wipeBoard } from '../motion';

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'pen', label: 'Pinceau (B)', icon: '✏️', key: 'b' },
  { id: 'eraser', label: 'Gomme (E)', icon: '🧽', key: 'e' },
  { id: 'fill', label: 'Remplissage (F)', icon: '🪣', key: 'f' },
];

/** Dock flottant (pattern « Dock » de 21st.dev), qui monte quand vient ton tour. Raccourcis : B, E, F, Ctrl+Z. */
export function Toolbar({ pen, trap = null, tools: allowed }: { pen: Pen; trap?: Trap | null; tools?: Tool[] }) {
  const [, force] = useState(0);
  const update = (fn: () => void) => {
    fn();
    force((n) => n + 1);
  };
  const undo = () => {
    pen.target.undo();
    net.send({ t: 'undo' });
    spin(undoBtn.current);
  };
  const undoBtn = useRef<HTMLButtonElement>(null);
  const spin = (el: Element | null) =>
    animate(el, [{ transform: 'rotate(0)' }, { transform: 'rotate(-25deg)' }, { transform: 'rotate(0)' }], { duration: 260, fill: 'none' });

  // Pièges : couleur imposée (une seule pastille active) ou tirée au sort (palette en sommeil).
  const lockedPalette = trap?.kind === 'mono' || trap?.kind === 'shifty';
  const activeColor = pen.tool === 'eraser' || trap?.kind === 'shifty' ? -1 : trap?.kind === 'mono' ? trap.color : pen.color;

  // Les anneaux de la couleur, de la taille et de l'outil actifs glissent d'un élément à l'autre.
  const colorRing = useIndicator(activeColor);
  const sizeRing = useIndicator(pen.sizeIndex);
  const shown = allowed ? TOOLS.filter((t) => allowed.includes(t.id)) : TOOLS;
  const toolRing = useIndicator(shown.findIndex((t) => t.id === pen.tool));

  // Effet « dock » discret, à la souris seulement : l'outil survolé grossit, ses voisins un peu.
  const tools = useRef<HTMLDivElement>(null);
  const magnify = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || reducedMotion()) return;
    for (const b of tools.current!.querySelectorAll<HTMLElement>('button')) {
      const r = b.getBoundingClientRect();
      const near = Math.max(0, 1 - Math.abs(e.clientX - (r.left + r.width / 2)) / 60);
      b.style.scale = String(1 + 0.25 * near);
    }
  };
  const settle = () => tools.current?.querySelectorAll<HTMLElement>('button').forEach((b) => (b.style.scale = ''));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      const tool = shown.find((t) => t.key === e.key.toLowerCase());
      if (tool) update(() => (pen.tool = tool.id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pen]);

  const ring = 'm-indicator rounded-full bg-on-primary/20 ring-1 ring-on-primary/60';
  const tile = 'relative grid size-8 origin-bottom place-items-center rounded-full text-base transition hover:bg-on-primary/15';

  return (
    <div className="flex justify-center">
      <div className="m-dock flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-primary px-3 py-2 text-on-primary shadow-lg sm:rounded-full">
        {trap && (
          <span
            className="m-pop flex items-center gap-1.5 rounded-full bg-accent py-1 pr-3 pl-2 text-xs font-semibold whitespace-nowrap text-black"
            title={TRAP_INFO[trap.kind].drawer}
          >
            {trap.kind === 'shifty' ? <span className="t-dice size-3.5 rounded-full" aria-hidden /> : <span>{TRAP_INFO[trap.kind].icon}</span>}
            {TRAP_INFO[trap.kind].name}
          </span>
        )}
        <div ref={colorRing.container} className="relative grid grid-cols-12 gap-1">
          <span ref={colorRing.indicator} className="m-indicator rounded-full ring-2 ring-on-primary ring-offset-2 ring-offset-primary" />
          {PALETTE.map((c, i) => {
            const locked = lockedPalette && !(trap?.kind === 'mono' && trap.color === i);
            return (
              <button
                key={c}
                data-slot
                aria-label={`Couleur ${c}`}
                disabled={locked}
                onClick={() => update(() => ((pen.color = i), pen.tool === 'eraser' && (pen.tool = 'pen')))}
                className={`size-5 rounded-full transition duration-300 ${locked ? 'scale-75 opacity-20 grayscale' : 'hover:scale-110'}`}
                style={{ background: c, transitionDelay: locked ? `${(i % 12) * 15}ms` : undefined }}
              />
            );
          })}
        </div>
        <span className="hidden h-6 w-px bg-on-primary/20 sm:block" />
        <div ref={sizeRing.container} className="relative flex gap-1">
          <span ref={sizeRing.indicator} className={ring} />
          {BRUSH_SIZES.map((s, i) => (
            <button key={s} data-slot aria-label={`Taille ${s}`} onClick={() => update(() => (pen.sizeIndex = i))} className={tile}>
              <span className="rounded-full bg-on-primary" style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
            </button>
          ))}
        </div>
        <span className="hidden h-6 w-px bg-on-primary/20 sm:block" />
        <div
          ref={(el) => void ((tools.current = el), (toolRing.container.current = el))}
          className="relative flex items-end gap-1"
          onPointerMove={magnify}
          onPointerLeave={settle}
        >
          <span ref={toolRing.indicator} className={ring} />
          {shown.map((t) => (
            <button
              key={t.id}
              title={t.label}
              aria-label={t.label}
              data-slot
              aria-pressed={pen.tool === t.id}
              onClick={() => update(() => (pen.tool = t.id))}
              className={tile}
            >
              {t.icon}
            </button>
          ))}
          <button ref={undoBtn} title="Annuler (Ctrl+Z)" aria-label="Annuler" onClick={undo} className={tile}>
            ↩️
          </button>
          <button
            title="Tout effacer"
            aria-label="Tout effacer"
            onClick={(e) => {
              spin(e.currentTarget);
              wipeBoard();
              pen.target.reset();
              net.send({ t: 'clear' });
            }}
            className={tile}
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}
