import { useEffect, useRef, useState, type ReactNode } from 'react';
import { reducedMotion } from './animate';

/**
 * Garde le dernier contenu affiché le temps de son animation de sortie. Pendant la sortie,
 * le conteneur porte `data-leaving` : les classes `.m-veil`, `.m-card`, `.m-dock` jouent alors
 * leur animation de départ (voir motion.css).
 */
export function Presence({ children, exit = 170 }: { children: ReactNode; exit?: number }) {
  const shown = children !== null && children !== false && children !== undefined;
  const last = useRef<ReactNode>(null);
  const [, rerender] = useState(0);
  if (shown) last.current = children;

  useEffect(() => {
    if (shown || !last.current) return;
    const t = setTimeout(
      () => {
        last.current = null;
        rerender((n) => n + 1);
      },
      reducedMotion() ? 0 : exit,
    );
    return () => clearTimeout(t);
  }, [shown, exit]);

  const content = shown ? children : last.current;
  return (
    <div className="contents" data-leaving={!shown && content ? '' : undefined}>
      {content}
    </div>
  );
}
