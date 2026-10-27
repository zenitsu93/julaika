import { useEffect } from 'react';
import { avatarOf } from '../lib/avatars';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { Lobby } from './Lobby';

function Panel({ children, flow = false }: { children: React.ReactNode; flow?: boolean }) {
  // `flow` : sur téléphone, le panneau prend sa hauteur naturelle au lieu d'être coincé dans le cadre 4:3.
  const mobile = flow ? 'max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none' : '';
  return (
    <div className={`absolute inset-0 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] ${mobile}`}>
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
  const choosing = room.phase === 'choosing' && room.drawerId === selfId && choices;

  useEffect(() => {
    if (!choosing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) net.send({ t: 'choose', index: n - 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choosing, choices]);

  switch (room.phase) {
    case 'lobby':
      return (
        <Panel flow>
          <Lobby />
        </Panel>
      );
    case 'choosing':
      return (
        <Panel>
          {choosing ? (
            <>
              <h2 className="mb-1 text-xl font-semibold">Choisis un mot</h2>
              <p className="mb-4 text-sm text-muted">Touches 1 à {choices.length}</p>
              <div className="flex flex-wrap justify-center gap-3">
                {choices.map((w, i) => (
                  <button key={w} className="btn-primary px-5 py-2.5 text-base" onClick={() => net.send({ t: 'choose', index: i })}>
                    {w}
                    <kbd className="kbd border-on-primary/30 text-on-primary/70">{i + 1}</kbd>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-lg">
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
          <p className="text-sm text-muted">Le mot était</p>
          <h2 className="mb-5 font-mono text-4xl font-bold tracking-wide">
            {turnEnd.word}
          </h2>
          <ul className="panel mx-auto max-w-xs divide-y divide-edge text-left text-sm">
            {[...room.players]
              .sort((a, b) => (turnEnd.gains[b.id] ?? 0) - (turnEnd.gains[a.id] ?? 0))
              .map((p) => (
                <li key={p.id} className="flex justify-between px-3 py-2">
                  <span>{avatarOf(p.avatar)} {p.name}</span>
                  <span className={`font-mono tabular-nums ${turnEnd.gains[p.id] ? 'text-good' : 'text-muted'}`}>+{turnEnd.gains[p.id] ?? 0}</span>
                </li>
              ))}
          </ul>
        </Panel>
      );
    case 'gameEnd':
      if (!ranking) return null;
      return (
        <Panel>
          <h2 className="mb-6 text-2xl font-semibold">Fin de partie</h2>
          <ol className="flex items-end justify-center gap-4">
            {[ranking[1], ranking[0], ranking[2]].map(
              (p, i) =>
                p && (
                  <li key={p.id} className="flex flex-col items-center">
                    <span className="text-4xl">{avatarOf(p.avatar)}</span>
                    <span className="font-medium">{p.name}</span>
                    <span className="font-mono text-sm tabular-nums text-muted">{p.score}</span>
                    <div
                      className="mt-2 grid w-20 place-items-start justify-center rounded-t-md bg-primary pt-1 font-mono text-sm font-bold text-on-primary"
                      style={{ height: [70, 110, 50][i] }}
                    >
                      {[2, 1, 3][i]}
                    </div>
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
