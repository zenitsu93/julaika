import { useEffect, useState } from 'react';
import { BRUSH_SIZES, PALETTE } from '@julaika/shared';
import type { Pen, Tool } from '../lib/board';
import { board } from '../lib/board';
import { net } from '../lib/net';

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'pen', label: 'Pinceau (B)', icon: '✏️', key: 'b' },
  { id: 'eraser', label: 'Gomme (E)', icon: '🧽', key: 'e' },
  { id: 'fill', label: 'Remplissage (F)', icon: '🪣', key: 'f' },
];

/** Dock flottant (pattern « Dock » de 21st.dev). Raccourcis : B, E, F, Ctrl+Z. */
export function Toolbar({ pen }: { pen: Pen }) {
  const [, force] = useState(0);
  const update = (fn: () => void) => {
    fn();
    force((n) => n + 1);
  };
  const undo = () => {
    board.undo();
    net.send({ t: 'undo' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      const tool = TOOLS.find((t) => t.key === e.key.toLowerCase());
      if (tool) update(() => (pen.tool = tool.id));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pen]);

  const on = 'bg-on-primary/20 ring-1 ring-on-primary/60';
  const tile = 'grid size-8 place-items-center rounded-full text-base transition hover:bg-on-primary/15';

  return (
    <div className="flex justify-center">
      <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-primary px-3 py-2 text-on-primary shadow-lg sm:rounded-full">
        <div className="grid grid-cols-12 gap-1">
          {PALETTE.map((c, i) => (
            <button
              key={c}
              aria-label={`Couleur ${c}`}
              onClick={() => update(() => ((pen.color = i), pen.tool === 'eraser' && (pen.tool = 'pen')))}
              className={`size-5 rounded-full transition hover:scale-110 ${pen.color === i && pen.tool !== 'eraser' ? 'ring-2 ring-on-primary ring-offset-2 ring-offset-primary' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <span className="hidden h-6 w-px bg-on-primary/20 sm:block" />
        <div className="flex gap-1">
          {BRUSH_SIZES.map((s, i) => (
            <button key={s} aria-label={`Taille ${s}`} onClick={() => update(() => (pen.sizeIndex = i))} className={`${tile} ${pen.sizeIndex === i ? on : ''}`}>
              <span className="rounded-full bg-on-primary" style={{ width: 3 + i * 4, height: 3 + i * 4 }} />
            </button>
          ))}
        </div>
        <span className="hidden h-6 w-px bg-on-primary/20 sm:block" />
        <div className="flex gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              title={t.label}
              aria-label={t.label}
              aria-pressed={pen.tool === t.id}
              onClick={() => update(() => (pen.tool = t.id))}
              className={`${tile} ${pen.tool === t.id ? on : ''}`}
            >
              {t.icon}
            </button>
          ))}
          <button title="Annuler (Ctrl+Z)" aria-label="Annuler" onClick={undo} className={tile}>↩️</button>
          <button
            title="Tout effacer"
            aria-label="Tout effacer"
            onClick={() => {
              board.reset();
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
