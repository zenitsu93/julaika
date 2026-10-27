import { avatarOf } from '../lib/avatars';
import { useGame } from '../lib/store';

export function PlayerList() {
  const players = useGame((s) => s.room!.players);
  const drawerId = useGame((s) => s.room!.drawerId);
  const selfId = useGame((s) => s.selfId);
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const rank = new Map(ranked.map((p, i) => [p.id, i + 1]));

  return (
    <aside className="glass order-2 p-2 lg:order-none">
      <ul className="space-y-1">
        {players.map((p) => (
          <li
            key={p.id}
            className={`flex items-center gap-3 rounded-xl px-2 py-2 transition ${
              p.guessed ? 'bg-neon-lime/15 ring-1 ring-neon-lime/40' : p.id === drawerId ? 'bg-neon-violet/15' : ''
            }`}
          >
            <span className="w-5 text-right text-xs text-muted">#{rank.get(p.id)}</span>
            <span className="text-2xl" aria-hidden>{avatarOf(p.avatar)}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {p.name}
                {p.id === selfId && <span className="text-muted"> (toi)</span>}
              </div>
              <div className="text-xs text-muted">{p.score} pts</div>
            </div>
            {p.id === drawerId && <span title="Dessine">✏️</span>}
            {p.isHost && <span title="Hôte">👑</span>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
