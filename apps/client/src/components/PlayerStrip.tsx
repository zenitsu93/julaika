import { useEffect, useRef, useState } from 'react';
import type { PlayerPublic } from '@julaika/shared';
import { avatarOf } from '../lib/avatars';
import { useGame } from '../lib/store';
import { useCountUp, useFlip } from '../motion';

function Pill({ player, rank, drawing, self }: { player: PlayerPublic; rank: number; drawing: boolean; self: boolean }) {
  const score = useCountUp(player.score);
  // « +180 » qui s'envole quand le score monte.
  const [gains, setGains] = useState<{ id: number; value: number }[]>([]);
  const prev = useRef(player.score);
  useEffect(() => {
    const diff = player.score - prev.current;
    prev.current = player.score;
    if (diff > 0) setGains((g) => [...g, { id: performance.now(), value: diff }]);
  }, [player.score]);

  return (
    <li
      data-flip={player.id}
      className={`m-pop relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm transition-colors duration-300 ${
        player.guessed ? 'border-good/50 bg-good/10 text-good' : drawing ? 'border-ink bg-surface' : 'border-edge bg-surface'
      }`}
    >
      <span className="font-mono text-[11px] text-muted">{rank}</span>
      <span aria-hidden>{avatarOf(player.avatar)}</span>
      <span className={`max-w-32 truncate ${self ? 'font-semibold' : ''}`}>{player.name}</span>
      <span className="font-mono text-xs tabular-nums text-muted">{score}</span>
      {drawing && (
        <span title="Dessine" className="m-wobble">
          ✏️
        </span>
      )}
      {player.guessed && (
        <span title="A trouvé" className="m-pop">
          ✓
        </span>
      )}
      {player.isHost && (
        <span title="Hôte" className="text-xs">
          👑
        </span>
      )}
      {gains.map((g) => (
        <span
          key={g.id}
          className="m-float-up pointer-events-none absolute -top-2 right-2 font-mono text-[11px] font-semibold text-good"
          onAnimationEnd={() => setGains((all) => all.filter((x) => x.id !== g.id))}
          aria-hidden
        >
          +{g.value}
        </span>
      ))}
    </li>
  );
}

/** Joueurs en pastilles au-dessus du tableau, triés par score ; elles glissent quand le classement change. */
export function PlayerStrip() {
  const players = useGame((s) => s.room!.players);
  const drawerId = useGame((s) => s.room!.drawerId);
  const selfId = useGame((s) => s.selfId);
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const list = useRef<HTMLOListElement>(null);
  useFlip(list, [ranked.map((p) => p.id).join()]);

  return (
    <ol ref={list} className="relative flex flex-wrap justify-center gap-1.5" aria-label="Classement">
      {ranked.map((p, i) => (
        <Pill key={p.id} player={p} rank={i + 1} drawing={p.id === drawerId} self={p.id === selfId} />
      ))}
    </ol>
  );
}
