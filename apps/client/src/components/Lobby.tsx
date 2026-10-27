import { SETTINGS_LIMITS, type Difficulty, type GameMode, type RoomSettings } from '@julaika/shared';
import { useEffect, useRef } from 'react';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { bump, Ticker, useIndicator } from '../motion';

const FIELDS: { key: keyof typeof SETTINGS_LIMITS; label: string; step?: number }[] = [
  { key: 'rounds', label: 'Manches' },
  { key: 'drawTime', label: 'Temps de dessin (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
  { key: 'wordChoices', label: 'Mots proposés' },
  { key: 'hints', label: 'Indices' },
];

const MODES: { value: GameMode; label: string; hint: string }[] = [
  { value: 'dessin', label: '✏️ Dessin', hint: 'On dessine le mot, les autres devinent.' },
  { value: 'mime', label: '🎭 Mime', hint: 'On mime le mot devant la caméra (ou en vrai), sans parler.' },
  { value: 'mixte', label: '🎲 Mixte', hint: 'Chaque tour, dessin ou mime au hasard.' },
];

const LEVELS: { value: Difficulty; label: string }[] = [
  { value: 'facile', label: 'Facile' },
  { value: 'moyen', label: 'Moyen' },
  { value: 'difficile', label: 'Difficile' },
];

export function Lobby() {
  const room = useGame((s) => s.room!);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const error = useGame((s) => s.error);
  const set = (settings: Partial<RoomSettings>) => net.send({ t: 'settings', settings });
  const level = useIndicator(LEVELS.findIndex((l) => l.value === room.settings.difficulty));
  const modeIndex = Math.max(0, MODES.findIndex((m) => m.value === room.settings.mode));
  const mode = useIndicator(modeIndex);
  const canStart = room.players.length >= 2;
  const start = useRef<HTMLButtonElement>(null);

  // Le bouton s'éclaire quand le deuxième joueur arrive.
  useEffect(() => {
    if (canStart) bump(start.current, 1.04);
  }, [canStart]);

  return (
    <div className="panel p-5 text-left shadow-sm">
      <h2 className="mb-4 text-lg font-semibold">Réglages du salon <span className="font-mono text-muted">#{room.code}</span></h2>
      <div className="mb-3 text-sm">
        <span className="mb-1 block text-muted">Mode de jeu</span>
        <div ref={mode.container} role="group" aria-label="Mode de jeu" className="relative grid grid-cols-3 gap-1 rounded-md border border-edge p-1">
          <span ref={mode.indicator} className="m-indicator rounded bg-primary" />
          {MODES.map(({ value, label }) => {
            const active = room.settings.mode === value;
            return (
              <button
                key={value}
                type="button"
                data-slot
                aria-pressed={active}
                disabled={!isHost}
                onClick={() => set({ mode: value })}
                className={`relative rounded px-2 py-1.5 font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed ${
                  active ? 'text-on-primary' : 'text-muted enabled:hover:bg-edge/50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <p key={modeIndex} className="m-fade mt-1 text-xs text-muted">{MODES[modeIndex]!.hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label: base, step }) => {
          const label = key === 'drawTime' && room.settings.mode !== 'dessin' ? 'Temps par tour (s)' : base;
          const [min, max] = SETTINGS_LIMITS[key];
          return (
            <label key={key} className="text-sm">
              <span className="mb-1 block text-muted">{label}</span>
              {/* Chez les invités, la valeur roule quand l'hôte la change. */}
              {!isHost ? (
                <div className="input font-mono opacity-80" aria-label={label}>
                  <Ticker value={room.settings[key]} />
                </div>
              ) : (
              <input
                type="number"
                className="input font-mono tabular-nums"
                min={min}
                max={max}
                step={step ?? 1}
                disabled={!isHost}
                value={room.settings[key]}
                onChange={(e) => set({ [key]: Number(e.target.value) })}
              />
              )}
            </label>
          );
        })}
      </div>
      <div className="mt-3 text-sm">
        <span className="mb-1 block text-muted">Difficulté des mots</span>
        <div ref={level.container} role="group" aria-label="Difficulté des mots" className="relative grid grid-cols-3 gap-1 rounded-md border border-edge p-1">
          <span ref={level.indicator} className="m-indicator rounded bg-primary" />
          {LEVELS.map(({ value, label }) => {
            const active = room.settings.difficulty === value;
            return (
              <button
                key={value}
                type="button"
                data-slot
                aria-pressed={active}
                disabled={!isHost}
                onClick={() => set({ difficulty: value })}
                className={`relative rounded px-3 py-1.5 font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed ${
                  active ? 'text-on-primary' : 'text-muted enabled:hover:bg-edge/50'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-muted">Mots perso (séparés par des virgules)</span>
        <textarea
          className="input h-16 resize-none"
          disabled={!isHost}
          defaultValue={room.settings.customWords.join(', ')}
          onBlur={(e) => set({ customWords: e.target.value.split(',') })}
        />
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" disabled={!isHost} checked={room.settings.customOnly} onChange={(e) => set({ customOnly: e.target.checked })} />
        Uniquement mes mots
      </label>
      {isHost ? (
        <button ref={start} className="btn-primary mt-5 w-full py-2.5" disabled={!canStart} onClick={() => net.send({ t: 'start' })}>
          {canStart ? 'Lancer la partie' : 'En attente de joueurs…'}
        </button>
      ) : (
        <p className="mt-5 text-center text-muted">L'hôte va lancer la partie…</p>
      )}
      {error && (
        <p key={error} className="m-rise mt-2 text-center text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
