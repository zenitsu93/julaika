import type { CerveauMode } from '@julaika/shared';
import { useIndicator } from '../../motion';
import { MODE_LABELS } from './info';

/** Réglage du salon : quel mode de Cerveau coupé, la pastille glisse d'un choix à l'autre. */
export function CerveauModes({ value, disabled, onChange }: { value: CerveauMode; disabled: boolean; onChange: (mode: CerveauMode) => void }) {
  const ring = useIndicator(MODE_LABELS.findIndex((m) => m.value === value));
  return (
    <div className="mt-3 text-sm">
      <span className="mb-1 block text-muted">Mode de jeu</span>
      <div ref={ring.container} role="group" aria-label="Mode de jeu" className="relative grid grid-cols-2 gap-1 rounded-md border border-edge p-1 sm:grid-cols-4">
        <span ref={ring.indicator} className="m-indicator rounded bg-primary" />
        {MODE_LABELS.map(({ value: mode, icon, label }) => {
          const active = mode === value;
          return (
            <button
              key={mode}
              type="button"
              data-slot
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(mode)}
              className={`relative flex items-center justify-center gap-1.5 rounded px-2 py-1.5 font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed ${
                active ? 'text-on-primary' : 'text-muted enabled:hover:bg-edge/50'
              }`}
            >
              <span className={active ? 'cv-mode-icon' : ''} aria-hidden>
                {icon}
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
