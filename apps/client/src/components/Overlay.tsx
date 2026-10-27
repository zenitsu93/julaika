import { avatarOf } from '../lib/avatars';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { Lobby } from './Lobby';

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-night/80 p-4 backdrop-blur-sm">
      <div className="animate-pop w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

export function Overlay() {
  const room = useGame((s) => s.room!);
  const selfId = useGame((s) => s.selfId);
  const choices = useGame((s) => s.choices);
  const turnEnd = useGame((s) => s.turnEnd);
  const ranking = useGame((s) => s.ranking);
  const drawer = room.players.find((p) => p.id === room.drawerId);

  switch (room.phase) {
    case 'lobby':
      return (
        <Panel>
          <Lobby />
        </Panel>
      );
    case 'choosing':
      return (
        <Panel>
          {room.drawerId === selfId && choices ? (
            <>
              <h2 className="mb-4 text-2xl font-bold">Choisis un mot</h2>
              <div className="flex flex-wrap justify-center gap-3">
                {choices.map((w, i) => (
                  <button key={w} className="btn-neon px-6 py-3 text-lg" onClick={() => net.send({ t: 'choose', index: i })}>
                    {w}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-xl">
              <span className="text-3xl">{drawer && avatarOf(drawer.avatar)}</span>
              <br />
              <b>{drawer?.name}</b> choisit un mot…
            </p>
          )}
        </Panel>
      );
    case 'turnEnd':
      if (!turnEnd) return null;
      return (
        <Panel>
          <p className="text-muted">Le mot était</p>
          <h2 className="mb-4 bg-gradient-to-r from-neon-violet to-neon-cyan bg-clip-text text-4xl font-bold text-transparent">
            {turnEnd.word}
          </h2>
          <ul className="mx-auto max-w-xs space-y-1">
            {[...room.players]
              .sort((a, b) => (turnEnd.gains[b.id] ?? 0) - (turnEnd.gains[a.id] ?? 0))
              .map((p) => (
                <li key={p.id} className="flex justify-between">
                  <span>{avatarOf(p.avatar)} {p.name}</span>
                  <span className={turnEnd.gains[p.id] ? 'text-neon-lime' : 'text-muted'}>+{turnEnd.gains[p.id] ?? 0}</span>
                </li>
              ))}
          </ul>
        </Panel>
      );
    case 'gameEnd':
      if (!ranking) return null;
      return (
        <Panel>
          <h2 className="mb-6 text-3xl font-bold">Fin de partie 🏆</h2>
          <ol className="flex items-end justify-center gap-4">
            {[ranking[1], ranking[0], ranking[2]].map(
              (p, i) =>
                p && (
                  <li key={p.id} className="flex flex-col items-center">
                    <span className="text-4xl">{avatarOf(p.avatar)}</span>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-sm text-muted">{p.score} pts</span>
                    <div
                      className="mt-2 w-20 rounded-t-xl bg-gradient-to-t from-neon-violet/60 to-neon-cyan/60"
                      style={{ height: [70, 110, 50][i] }}
                    />
                  </li>
                ),
            )}
          </ol>
        </Panel>
      );
    default:
      return null;
  }
}
