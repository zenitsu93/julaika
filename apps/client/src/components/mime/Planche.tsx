import { useState } from 'react';
import type { MimeShot } from '@julaika/shared';
import { downloadPlanche, shotTilt, turnBy, turnsOf } from '../../lib/mime';
import { bump } from '../../motion';
import { Polaroid } from '../Polaroid';
import './mime.css';

/** Fin d'un tour de mime : les polaroids des trouvailles, lancés sur la table l'un après l'autre. */
export function TurnShots({ shots }: { shots: MimeShot[] }) {
  if (!shots.length) return null;
  return (
    <div className="mime-planche mb-4 flex justify-center" aria-label="Polaroids du tour">
      {shots.slice(0, 4).map((s, i) => (
        <div key={s.id} className="w-24 sm:w-28">
          <Polaroid image={s.image} avatar={s.avatar} caption={`${s.finderName} !`} tilt={shotTilt(s)} enter="toss" delay={200 + i * 140} download />
        </div>
      ))}
    </div>
  );
}

/**
 * Planche de la partie : un polaroid par mime, en éventail, chacun enregistrable,
 * et un bouton pour tout garder en une seule image. `mini` : tirages réduits (fin de partie).
 */
export function Planche({ shots, delay = 0, mini = false }: { shots: MimeShot[]; delay?: number; mini?: boolean }) {
  const [saving, setSaving] = useState(false);
  const turns = turnsOf(shots);
  if (!turns.length) return null;
  const shown = turns.slice(-8);
  const printable = turns.some((t) => t.shot.image);
  return (
    <div className="text-center">
      <p className="m-rise mb-2 text-sm font-semibold" style={{ animationDelay: `${delay}ms` }}>
        <span className="accroche text-2xl text-muted">souvenirs</span>
        La planche des mimes
      </p>
      <div className={`mime-planche flex flex-wrap justify-center gap-y-3 ${mini ? 'mime-mini' : ''}`}>
        {shown.map((t, i) => (
          <div key={t.shot.id} className={mini ? 'w-[4.5rem]' : 'w-24'} title={turnBy(t)}>
            <Polaroid
              image={t.shot.image}
              avatar={t.shot.avatar}
              caption={t.shot.word}
              name={mini ? undefined : t.shot.mimerName}
              tilt={shotTilt(t.shot)}
              enter="toss"
              delay={delay + 120 + i * 90}
              download={!mini}
            />
          </div>
        ))}
      </div>
      {printable && !mini && (
        <button
          type="button"
          className="btn-ghost m-rise mt-2 text-sm"
          style={{ animationDelay: `${delay + 200 + shown.length * 90}ms` }}
          disabled={saving}
          onClick={(e) => {
            bump(e.currentTarget);
            setSaving(true);
            void downloadPlanche(turns).finally(() => setSaving(false));
          }}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
          </svg>
          {saving ? 'Préparation…' : 'Enregistrer la planche'}
        </button>
      )}
    </div>
  );
}
