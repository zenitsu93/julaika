import { avatarOf } from '../lib/avatars';
import { useGame } from '../lib/store';

/** Joueurs en pastilles au-dessus du tableau, triés par score. */
export function PlayerStrip() {
  const players = useGame((s) => s.room!.players);
  const drawerId = useGame((s) => s.room!.drawerId);
  const selfId = useGame((s) => s.selfId);
  const ranked = [...players].sort((a, b) => b.score - a.score);

  return (
    <ol className="flex flex-wrap justify-center gap-1.5" aria-label="Classement">
      {ranked.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition ${
            p.guessed
              ? 'border-good/50 bg-good/10 text-good'
              : p.id === drawerId
                ? 'border-ink bg-surface'
                : 'border-edge bg-surface'
          }`}
        >
          <span className="font-mono text-[11px] text-muted">{i + 1}</span>
          <span aria-hidden>{avatarOf(p.avatar)}</span>
          <span className={`max-w-32 truncate ${p.id === selfId ? 'font-semibold' : ''}`}>{p.name}</span>
          <span className="font-mono text-xs tabular-nums text-muted">{p.score}</span>
          {p.id === drawerId && <span title="Dessine">✏️</span>}
          {p.guessed && <span title="A trouvé">✓</span>}
          {p.isHost && <span title="Hôte" className="text-xs">👑</span>}
        </li>
      ))}
    </ol>
  );
}
