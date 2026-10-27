import type { CSSProperties } from 'react';
import { AgentGlyph } from './AgentGlyph';
import './agents.css';

const TONES = ['var(--color-gold)', '#f2e6b3', 'var(--color-gold)', '#a0694a', '#f2e6b3', 'var(--color-gold)', '#a0694a', '#f2e6b3', '#a0694a', 'var(--color-gold)', '#f2e6b3', '#a0694a'];

/** La grille des agents : les cases se retournent sur l'or et le cacao, l'espion veille au milieu. */
export function AgentsArt() {
  return (
    <span className="relative mx-auto block w-full max-w-[13rem]" aria-hidden>
      <svg viewBox="0 0 200 140" className="w-full" fill="none" stroke="currentColor" strokeLinejoin="round">
        {TONES.map((tone, i) => (
          <rect
            key={i}
            className="ag-art-cell"
            style={{ '--ag-art': tone, animationDelay: `${((i * 5) % 12) * 260}ms` } as CSSProperties}
            x={14 + (i % 4) * 44}
            y={14 + Math.floor(i / 4) * 40}
            width="38"
            height="32"
            rx="6"
            strokeWidth="2.5"
            strokeOpacity=".7"
          />
        ))}
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span className="ag-art-hat grid size-16 place-items-center rounded-full bg-cacao text-gold shadow-lg ring-4 ring-butter/80">
          <AgentGlyph className="h-11" />
        </span>
      </span>
    </span>
  );
}
