import { useEffect, useRef, useState } from 'react';
import type { PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../lib/avatars';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { confetti, Presence, useCountUp } from '../motion';
import { Lobby } from './Lobby';

function Panel({ children, flow = false }: { children: React.ReactNode; flow?: boolean }) {
  // `flow` : sur téléphone, le panneau prend sa hauteur naturelle au lieu d'être coincé dans le cadre 4:3.
  const mobile = flow ? 'max-sm:static max-sm:bg-transparent max-sm:p-0 max-sm:backdrop-blur-none' : '';
  return (
    <div className={`m-veil absolute inset-0 grid place-items-center overflow-y-auto bg-page/85 p-4 backdrop-blur-[2px] ${mobile}`}>
      <div className="m-card w-full max-w-lg text-center">{children}</div>
    </div>
  );
}

/** Gain d'un joueur en fin de tour : la ligne arrive, puis le nombre compte depuis 0. */
function Gain({ player, gain, index }: { player: PlayerPublic; gain: number; index: number }) {
  const shown = useCountUp(gain, { from: 0, delay: 300 + index * 60 });
  return (
    <li className="m-rise flex justify-between px-3 py-2" style={{ animationDelay: `${250 + index * 60}ms` }}>
      <span>
        {avatarOf(player.avatar)} {player.name}
      </span>
      <span className={`font-mono tabular-nums ${gain ? 'text-good' : 'text-muted'}`}>+{shown}</span>
    </li>
  );
}

/** Podium : les marches montent (3e, 2e puis 1er), chaque avatar tombe sur la sienne, puis confettis. */
function Podium({ ranking }: { ranking: PlayerPublic[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop = () => {};
    const t = setTimeout(() => (stop = confetti(canvas.current)), 780);
    return () => {
      clearTimeout(t);
      stop();
    };
  }, []);
  const steps = { 1: 520, 2: 260, 3: 0 } as Record<number, number>;
  return (
    <>
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 z-10 size-full" aria-hidden />
      <h2 className="mb-6 text-2xl font-semibold">
        <span className="accroche text-4xl text-muted">bravo à tous</span>
        Fin de partie
      </h2>
      <ol className="flex items-end justify-center gap-4">
        {[ranking[1], ranking[0], ranking[2]].map((p, i) => {
          if (!p) return null;
          const rank = [2, 1, 3][i]!;
          const delay = steps[rank]!;
          return (
            <li key={p.id} className="flex flex-col items-center">
              <span className="m-drop text-4xl" style={{ animationDelay: `${delay + 260}ms` }}>
                {avatarOf(p.avatar)}
              </span>
              <span className="m-fade font-medium" style={{ animationDelay: `${delay + 260}ms` }}>
                {p.name}
              </span>
              <span className="m-fade font-mono text-sm tabular-nums text-muted" style={{ animationDelay: `${delay + 260}ms` }}>
                {p.score}
              </span>
              <div
                className="m-grow mt-2 grid w-20 place-items-start justify-center rounded-t-md bg-primary pt-1 font-mono text-sm font-bold text-on-primary"
                style={{ height: [70, 110, 50][i], animationDelay: `${delay}ms` }}
              >
                {rank}
              </div>
            </li>
          );
        })}
      </ol>
    </>
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
  // Mot cliqué : il grossit pendant que les autres s'effacent, le temps que le serveur réponde.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [choices]);
  const choose = (index: number) => {
    setPicked(index);
    net.send({ t: 'choose', index });
  };

  useEffect(() => {
    if (!choosing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) choose(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choosing, choices]);

  return <Presence>{content()}</Presence>;

  function content() {
    switch (room.phase) {
      case 'lobby':
        return (
          <Panel key="lobby" flow>
            <Lobby />
          </Panel>
        );
      case 'choosing':
        return (
          <Panel key="choosing">
            {choosing ? (
              <>
                <h2 className="mb-1 text-xl font-semibold">Choisis un mot</h2>
                <p className="mb-4 text-sm text-muted">Touches 1 à {choices.length}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {choices.map((w, i) => (
                    <button
                      key={w}
                      className={`btn-primary m-pop px-5 py-2.5 text-base transition duration-200 ${
                        picked === null ? '' : picked === i ? 'scale-108' : 'scale-95 opacity-0'
                      }`}
                      style={{ animationDelay: `${80 + i * 50}ms` }}
                      disabled={picked !== null}
                      onClick={() => choose(i)}
                    >
                      {w}
                      <kbd className="kbd border-on-primary/30 text-on-primary/70">{i + 1}</kbd>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-lg">
                <span className="m-breathe text-3xl">{drawer && avatarOf(drawer.avatar)}</span>
                <br />
                <b>{drawer?.name}</b> choisit un mot
                <span className="m-dots" aria-hidden>
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </p>
            )}
          </Panel>
        );
      case 'turnEnd':
        if (!turnEnd) return null;
        return (
          <Panel key="turnEnd">
            <p className="text-sm text-muted">Le mot était</p>
            <h2 className="mb-5 font-mono text-4xl font-bold tracking-wide" aria-label={turnEnd.word}>
              {[...turnEnd.word].map((c, i) => (
                <span key={i} className="m-letter" style={{ animationDelay: `${i * 30}ms` }} aria-hidden>
                  {c === ' ' ? '\u00a0' : c}
                </span>
              ))}
            </h2>
            <ul className="panel mx-auto max-w-xs divide-y divide-edge text-left text-sm">
              {[...room.players]
                .sort((a, b) => (turnEnd.gains[b.id] ?? 0) - (turnEnd.gains[a.id] ?? 0))
                .map((p, i) => (
                  <Gain key={p.id} player={p} gain={turnEnd.gains[p.id] ?? 0} index={i} />
                ))}
            </ul>
          </Panel>
        );
      case 'gameEnd':
        if (!ranking) return null;
        return (
          <Panel key="gameEnd">
            <Podium ranking={ranking} />
          </Panel>
        );
      default:
        return null;
    }
  }
}
