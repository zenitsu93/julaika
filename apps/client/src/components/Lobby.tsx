import { SETTINGS_LIMITS, type RoomSettings } from '@julaika/shared';
import { net } from '../lib/net';
import { useGame } from '../lib/store';

const FIELDS: { key: keyof typeof SETTINGS_LIMITS; label: string; step?: number }[] = [
  { key: 'rounds', label: 'Manches' },
  { key: 'drawTime', label: 'Temps de dessin (s)', step: 10 },
  { key: 'maxPlayers', label: 'Joueurs max' },
  { key: 'wordChoices', label: 'Mots proposés' },
  { key: 'hints', label: 'Indices' },
];

export function Lobby() {
  const room = useGame((s) => s.room!);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const error = useGame((s) => s.error);
  const set = (settings: Partial<RoomSettings>) => net.send({ t: 'settings', settings });

  return (
    <div className="glass p-5 text-left">
      <h2 className="mb-4 text-center text-2xl font-bold">Salon #{room.code}</h2>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map(({ key, label, step }) => {
          const [min, max] = SETTINGS_LIMITS[key];
          return (
            <label key={key} className="text-sm">
              <span className="mb-1 block text-muted">{label}</span>
              <input
                type="number"
                className="input"
                min={min}
                max={max}
                step={step ?? 1}
                disabled={!isHost}
                value={room.settings[key]}
                onChange={(e) => set({ [key]: Number(e.target.value) })}
              />
            </label>
          );
        })}
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
        <button className="btn-neon mt-5 w-full py-3 text-lg" disabled={room.players.length < 2} onClick={() => net.send({ t: 'start' })}>
          {room.players.length < 2 ? 'En attente de joueurs…' : 'Lancer la partie'}
        </button>
      ) : (
        <p className="mt-5 text-center text-muted">L'hôte va lancer la partie…</p>
      )}
      {error && <p className="mt-2 text-center text-sm text-neon-pink">{error}</p>}
    </div>
  );
}
