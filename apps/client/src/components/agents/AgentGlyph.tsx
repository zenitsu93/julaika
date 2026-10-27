import type { AgentsColor } from '@julaika/shared';

/**
 * Silhouette d'une carte retournée : l'agent au chapeau et lunettes noires, le passant
 * en simple buste, l'assassin avec sa lame. Tout en currentColor.
 */
export function AgentGlyph({ kind = 'or', className = '' }: { kind?: AgentsColor; className?: string }) {
  if (kind === 'neutre') {
    return (
      <svg viewBox="0 0 48 48" className={className} fill="currentColor" aria-hidden>
        <circle cx="24" cy="17" r="8" opacity=".55" />
        <path d="M9 44c1-9 7-14 15-14s14 5 15 14z" opacity=".55" />
      </svg>
    );
  }
  if (kind === 'assassin') {
    return (
      <svg viewBox="0 0 48 48" className={className} fill="currentColor" aria-hidden>
        <path d="M24 5c-8 0-13 6-13 13 0 5 2 8 5 10v5h16v-5c3-2 5-5 5-10 0-7-5-13-13-13z" />
        <circle cx="18.5" cy="19" r="3.5" fill="var(--ag-hole, #000)" />
        <circle cx="29.5" cy="19" r="3.5" fill="var(--ag-hole, #000)" />
        <path d="M22 26h4l-2 3z" fill="var(--ag-hole, #000)" />
        <path d="M19 33v5M24 33v5M29 33v5" stroke="var(--ag-hole, #000)" strokeWidth="1.6" />
        <path d="M38 30l7-7M41 33l-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" className={className} fill="currentColor" aria-hidden>
      {/* Chapeau mou, ruban, visage, lunettes noires et col relevé. */}
      <path d="M8 17c4 1 8 1.6 16 1.6S36 18 40 17c-1.5 2.6-6 4.2-16 4.2S9.5 19.6 8 17z" />
      <path d="M14 16c0-6 3-10 10-10s10 4 10 10c-3 .8-6.5 1.2-10 1.2S17 16.8 14 16z" />
      <path d="M14.2 14.4c3 .8 6.4 1.2 9.8 1.2s6.8-.4 9.8-1.2" stroke="var(--ag-hole, #000)" strokeOpacity=".35" strokeWidth="1.6" fill="none" />
      <path d="M16 22h16v4c0 5-3.6 8-8 8s-8-3-8-8z" opacity=".7" />
      <path d="M15.5 23.5h7.5l-1 3.2h-5.5zM25 23.5h7.5l-1 3.2H26z" fill="var(--ag-hole, #000)" />
      <path d="M8 46c0-7 4-11 9-12.5l7 6 7-6c5 1.5 9 5.5 9 12.5z" />
    </svg>
  );
}
