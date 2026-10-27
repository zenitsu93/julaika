import { PALETTE } from '@julaika/shared';
import { TRAP_INFO } from '../lib/traps';
import { useGame } from '../lib/store';

/**
 * Manche piégée : un tampon s'écrase au milieu du tableau au début du tour (onde de choc,
 * léger rebond), puis s'envole vers le coin où il reste en pastille jusqu'à la fin du tour.
 */
export function TrapStamp() {
  const trap = useGame((s) => (s.room!.phase === 'drawing' ? s.room!.trap : null));
  const turn = useGame((s) => `${s.room!.round}:${s.room!.drawerId}`);
  const drawing = useGame((s) => s.room!.drawerId === s.selfId);
  if (!trap) return null;
  const info = TRAP_INFO[trap.kind];
  const swatch = trap.kind === 'mono' ? PALETTE[trap.color] : null;

  return (
    <div key={turn} className="pointer-events-none absolute inset-0 z-[5]" aria-live="polite">
      <div className="t-stamp-wrap absolute inset-0 grid place-items-center p-4">
        <div className="t-stamp relative max-w-xs rounded-2xl border-2 border-accent bg-surface/95 px-6 py-4 text-center shadow-2xl backdrop-blur">
          <span className="t-ring absolute inset-0 rounded-2xl border-2 border-accent" aria-hidden />
          <p className="font-mono text-[11px] font-bold tracking-[0.3em] text-accent uppercase">Manche piégée</p>
          <p className="t-icon my-1 text-5xl">{info.icon}</p>
          <p className="text-lg font-semibold">
            {info.name}
            {swatch && <span className="ml-2 inline-block size-3.5 rounded-full align-middle ring-2 ring-edge" style={{ background: swatch }} />}
          </p>
          <p className="mt-1 text-sm text-muted">{drawing ? info.drawer : info.rule}</p>
        </div>
      </div>
      <div
        className="t-badge absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-accent py-1 pr-3 pl-2 text-xs font-semibold text-black shadow-md"
        title={info.rule}
      >
        <span className="t-badge-icon">{info.icon}</span>
        {info.name}
        {swatch && <span className="size-2.5 rounded-full ring-1 ring-black/30" style={{ background: swatch }} />}
      </div>
    </div>
  );
}
