import { useEffect, useRef, useState } from 'react';
import type { ChatLine } from '@julaika/shared';
import { useGame } from '../lib/store';
import './annonces.css';

/** Durée d'affichage d'une annonce. */
const SHOW_MS = 3800;
/** Au plus trois annonces à la fois : la plus ancienne laisse sa place. */
const MAX = 3;

/**
 * Les annonces du jeu (« Léa a trouvé le mot ! », « Manche 2 / 3 », arrivées et départs),
 * maintenant qu'il n'y a plus de chat : de petites pastilles qui tombent juste sous la barre du haut,
 * tiennent quelques secondes puis s'envolent. Rien à lire en continu, l'écran reste au jeu.
 */
export function Annonces() {
  const chat = useGame((s) => s.chat);
  const selfId = useGame((s) => s.selfId);
  const [items, setItems] = useState<{ key: number; line: ChatLine; leaving: boolean }[]>([]);
  const seen = useRef(chat.at(-1));
  const next = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const line = chat.at(-1);
    if (!line || line === seen.current) return;
    seen.current = line;
    if (line.kind !== 'system' && line.kind !== 'correct') return;
    const key = ++next.current;
    setItems((l) => [...l.slice(-(MAX - 1)), { key, line, leaving: false }]);
    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.current.delete(id);
        fn();
      }, ms);
      timers.current.add(id);
    };
    // Sortie animée, puis on la retire de la pile.
    later(SHOW_MS, () => setItems((l) => l.map((x) => (x.key === key ? { ...x, leaving: true } : x))));
    later(SHOW_MS + 420, () => setItems((l) => l.filter((x) => x.key !== key)));
  }, [chat]);

  return (
    <div className="an-anchor">
    <ul className="an-stack" role="status" aria-live="polite">
      {items.map(({ key, line, leaving }) => {
        const mine = line.kind === 'correct' && line.from === selfId;
        return (
          <li key={key} className={`an-pill an-${line.kind} ${mine ? 'an-mine' : ''} ${leaving ? 'an-out' : ''}`}>
            {line.kind === 'correct' && (
              <span className="an-badge" aria-hidden>
                {mine ? '★' : '✓'}
              </span>
            )}
            <span className="an-text">{mine ? 'Tu as trouvé le mot !' : line.text}</span>
          </li>
        );
      })}
    </ul>
    </div>
  );
}
