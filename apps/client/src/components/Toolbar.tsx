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

/** Barre d'outils flottante façon « dock » (pattern 21st.dev). */
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

  return (
    <div className="glass flex flex-wrap items-center justify-center gap-3 p-2">
      <div className="grid grid-cols-12 gap-1">
        {PALETTE.map((c, i) => (
          <button
            key={c}
            aria-label={`Couleur ${c}`}
            onClick={() => update(() => ((pen.color = i), pen.tool === 'eraser' && (pen.tool = 'pen')))}
            className={`size-6 rounded-md transition hover:scale-110 ${pen.color === i ? 'ring-2 ring-neon-cyan ring-offset-2 ring-offset-night' : ''}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex gap-1">
        {BRUSH_SIZES.map((s, i) => (
          <button
            key={s}
            aria-label={`Taille ${s}`}
            onClick={() => update(() => (pen.sizeIndex = i))}
            className={`grid size-9 place-items-center rounded-xl ${pen.sizeIndex === i ? 'bg-neon-violet/30 ring-1 ring-neon-violet' : 'bg-white/5'}`}
          >
            <span className="rounded-full bg-ink" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            title={t.label}
            aria-label={t.label}
            aria-pressed={pen.tool === t.id}
            onClick={() => update(() => (pen.tool = t.id))}
            className={`grid size-9 place-items-center rounded-xl text-lg ${pen.tool === t.id ? 'bg-neon-violet/30 ring-1 ring-neon-violet' : 'bg-white/5'}`}
          >
            {t.icon}
          </button>
        ))}
        <button title="Annuler (Ctrl+Z)" aria-label="Annuler" onClick={undo} className="grid size-9 place-items-center rounded-xl bg-white/5 text-lg">↩️</button>
        <button
          title="Tout effacer"
          aria-label="Tout effacer"
          onClick={() => {
            board.reset();
            net.send({ t: 'clear' });
          }}
          className="grid size-9 place-items-center rounded-xl bg-white/5 text-lg"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
