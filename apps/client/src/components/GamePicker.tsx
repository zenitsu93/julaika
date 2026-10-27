import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { GameMode, RoomGame, RoomState } from '@julaika/shared';
import { GAMES, matchesGame, type GameId, type GameInfo } from '../lib/games';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { Presence, reducedMotion } from '../motion';
import { ART } from './Hub';

/** Le temps que la carte choisie s'allume avant que la feuille se referme. */
const PICK_MS = 260;

/** Ce que le serveur appelle un jeu : la carte « Mime » est le Dessin réglé en mime. */
function target(id: GameId): { game: RoomGame; mode?: GameMode } {
  if (id === 'mime') return { game: 'dessin', mode: 'mime' };
  if (id === 'dessin') return { game: 'dessin', mode: 'dessin' };
  return { game: id as RoomGame };
}

/** La carte du catalogue qui correspond au jeu du salon. */
export function currentGameId(room: Pick<RoomState, 'game' | 'settings'>): GameId {
  return room.game === 'dessin' && room.settings.mode === 'mime' ? 'mime' : room.game;
}

/** Les jeux qu'on peut lancer dans un salon (le Mot du jour se joue seul). */
const ROOM_CARDS = GAMES.filter((g) => g.id !== 'motdujour');

/** Deux cartes qui se battent comme un jeu qu'on mélange quand on survole le bouton. */
export function ShuffleGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`sw-glyph ${className}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <rect className="sw-back" x="4" y="5" width="11" height="15" rx="2" fill="var(--color-accent)" fillOpacity=".25" />
      <g className="sw-front">
        <rect x="9" y="4" width="11" height="15" rx="2" fill="var(--color-surface)" />
        <circle cx="14.5" cy="11.5" r="1.6" fill="var(--color-accent)" stroke="none" />
      </g>
    </svg>
  );
}

const PickerContext = createContext<() => void>(() => {});
export const PickerProvider = PickerContext.Provider;

/** Ouvre le sélecteur de jeu (seulement chez l'hôte : le serveur ignore les autres). */
export const useOpenPicker = () => useContext(PickerContext);

/**
 * Sélecteur tenu au niveau de la partie, comme la carte « Quitter » : il survit aux changements
 * de phase (podium → salon) et s'ouvre aussi bien du salon que de la barre du haut.
 */
export function useGamePicker() {
  const [open, setOpen] = useState(false);
  const isHost = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.isHost ?? false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  // L'hôte qui passe la main en cours de route n'a plus rien à choisir.
  useEffect(() => {
    if (!isHost) setOpen(false);
  }, [isHost]);
  const dialog = createPortal(<Presence exit={200}>{open && <PickerSheet onClose={close} />}</Presence>, document.body);
  return { open: show, dialog, isHost };
}

function PickerSheet({ onClose }: { onClose: () => void }) {
  const room = useGame((s) => s.room!);
  const current = currentGameId(room);
  const playing = room.phase !== 'lobby';
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<GameId | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const games = ROOM_CARDS.filter((g) => matchesGame(g, query));

  useEffect(() => {
    // Au doigt, on ne fait pas surgir le clavier sans qu'on l'ait demandé.
    if (matchMedia('(pointer: fine)').matches) search.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose]);

  const pick = (id: GameId) => {
    if (picked) return;
    if (id === current && !playing) return onClose();
    setPicked(id);
    setTimeout(
      () => {
        net.send({ t: 'game', ...target(id) });
        onClose();
      },
      reducedMotion() ? 0 : PICK_MS,
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="m-veil absolute inset-0 bg-page/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sw-title"
        className="sw-sheet panel relative flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-b-none shadow-[0_24px_60px_-24px_rgb(42_26_18/.55)] sm:rounded-b-[inherit]"
      >
        <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-edge sm:hidden" aria-hidden />
        <header className="flex items-start gap-3 px-5 pt-4 pb-3 sm:pt-5">
          <ShuffleGlyph className="sw-glyph-big mt-0.5 size-9 shrink-0 text-ink" />
          <div className="min-w-0 flex-1">
            <h2 id="sw-title" className="text-xl font-semibold tracking-[-0.02em]">
              Changer de jeu
            </h2>
            <p className="mt-0.5 text-sm text-muted">Mêmes joueurs, même code #{room.code} : la visio et la musique continuent.</p>
          </div>
          <button type="button" className="btn-ghost size-9 shrink-0 p-0" onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {playing && (
          <p className="m-rise mx-5 mb-3 flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            <span aria-hidden>⏸</span>
            La partie en cours s'arrête pour tout le monde, et chacun revient au salon.
          </p>
        )}
        <label className="mx-5 mb-3 flex min-h-11 items-center gap-2 rounded-xl border border-edge bg-surface px-3 transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/20">
          <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={search}
            type="search"
            aria-label="Chercher un jeu"
            placeholder="Chercher (visio, duo, dessin…)"
            className="min-h-10 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && games[0]) pick(games[0].id);
            }}
          />
        </label>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.25rem,1fr))] gap-3 overflow-y-auto overscroll-contain px-5 pt-1 pb-5" data-picked={picked ? '' : undefined}>
          {games.map((g, i) => (
            <li key={g.id} className="m-rise" style={{ animationDelay: `${Math.min(i, 14) * 22}ms` }}>
              <PickCard game={g} current={g.id === current} playing={playing} picked={picked === g.id} onPick={() => pick(g.id)} />
            </li>
          ))}
          {games.length === 0 && <li className="col-span-full py-8 text-center text-sm text-muted">Aucun jeu ne s'appelle comme ça.</li>}
        </ul>
      </div>
    </div>
  );
}

function PickCard({ game, current, playing, picked, onPick }: { game: GameInfo; current: boolean; playing: boolean; picked: boolean; onPick: () => void }) {
  const tag = current ? (playing ? 'Retour au salon' : 'En cours') : game.badge === 'À deux' ? 'À deux' : null;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={current ? 'true' : undefined}
      aria-label={`${game.name} : ${game.pitch}${current ? ' (jeu actuel)' : ''}`}
      className={`sw-card hub-card ${current ? 'hub-feat' : ''} ${picked ? 'sw-picked' : ''} relative flex h-full w-full flex-col gap-2 rounded-2xl border border-edge bg-surface p-1.5 pb-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      <span className="hub-panel sw-art grid h-24 place-items-center rounded-xl px-2 text-butter">
        {ART[game.id]}
        {tag && (
          <span className={`absolute top-1.5 right-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold ${current ? 'bg-gold text-cacao' : 'bg-butter/15 text-butter'}`}>{tag}</span>
        )}
      </span>
      <span className="block px-1.5">
        <span className="block text-[15px] leading-tight font-bold tracking-[-0.02em]">{game.name}</span>
        <span className="mt-0.5 block text-xs text-muted">{game.players}</span>
      </span>
    </button>
  );
}

/**
 * En tête du salon : le jeu choisi, et chez l'hôte le bouton pour en changer. Quand le jeu change,
 * la nouvelle carte arrive comme distribuée sur la table.
 */
export function GameSwitch({ isHost }: { isHost: boolean }) {
  const room = useGame((s) => s.room!);
  const open = useOpenPicker();
  const id = currentGameId(room);
  const info = GAMES.find((g) => g.id === id);
  const first = useRef(true);
  useEffect(() => void (first.current = false), []);
  if (!info) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-edge bg-surface p-2 pr-3">
      <span key={id} className={`hub-panel sw-art sw-mini grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg text-butter ${first.current ? '' : 'sw-deal'}`} aria-hidden>
        {ART[id]}
      </span>
      <span key={`n-${id}`} className={`w-0 min-w-0 flex-1 ${first.current ? '' : 'sw-name'}`}>
        <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">Jeu du salon</span>
        <span className="block truncate text-lg leading-tight font-bold tracking-[-0.02em]">{info.name}</span>
        <span className="block truncate text-xs text-muted">{info.pitch}</span>
      </span>
      {isHost ? (
        <button type="button" className="btn-ghost sw-btn shrink-0 px-2.5 py-1.5" onClick={open} aria-haspopup="dialog">
          <ShuffleGlyph className="size-5" />
          <span className="max-sm:sr-only">Changer de jeu</span>
        </button>
      ) : (
        <span className="hidden shrink-0 text-xs text-muted sm:block">L'hôte peut changer de jeu</span>
      )}
    </div>
  );
}

/** Bouton de la barre du haut et du podium : l'hôte change de jeu sans repasser par l'accueil. */
export function SwitchButton({ onClick, label = 'Changer de jeu', className = '', style }: { onClick: () => void; label?: string; className?: string; style?: CSSProperties }) {
  return (
    <button type="button" className={`btn-ghost sw-btn px-2.5 py-1.5 ${className}`} style={style} onClick={onClick} aria-haspopup="dialog" title="Changer de jeu (même salon)">
      <ShuffleGlyph className="size-4" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sr-only sm:hidden">{label}</span>
    </button>
  );
}
