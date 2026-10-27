import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ChatLine } from '@julaika/shared';
import { net } from '../lib/net';
import { useGame } from '../lib/store';
import { animate, bump, shake } from '../motion';
import './guess.css';

/** Durée d'affichage d'un essai en bulle au-dessus de la boîte. */
const ECHO_MS = 4500;

/**
 * Boîte de réponse posée sur le jeu : on tape sa réponse sans quitter des yeux le tableau ou le
 * mimeur, et les derniers essais (les siens, ceux des autres, « tu chauffes ») remontent en bulles.
 * Il n'y a plus de chat libre : on se parle en visio, la boîte ne sert qu'à deviner.
 * `stage` : par-dessus la vidéo du mime ; `bar` : juste sous le tableau du dessin ou la carte.
 */
export function GuessBox({
  variant,
  onFocusChange,
  lead,
  above,
  inputRef,
}: {
  variant: 'stage' | 'bar';
  onFocusChange?: (focused: boolean) => void;
  /** Bouton posé à gauche du champ (les bruitages du mime). */
  lead?: ReactNode;
  /** Posé juste au-dessus du champ, sous les bulles (le plateau de bruitages). */
  above?: ReactNode;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState('');
  const own = useRef<HTMLInputElement>(null);
  const input = inputRef ?? own;
  const form = useRef<HTMLFormElement>(null);
  const selfId = useGame((s) => s.selfId);
  const guessed = useGame((s) => s.room!.players.find((p) => p.id === s.selfId)?.guessed ?? false);
  const echo = useEcho();

  // Bonne réponse : la boîte s'allume en vert ; « tu chauffes » : elle frissonne.
  const last = useGame((s) => s.chat.at(-1));
  const seen = useRef(last);
  useEffect(() => {
    if (!last || last === seen.current) return;
    seen.current = last;
    if (last.kind === 'correct' && last.from === selfId) {
      bump(form.current, 1.04);
      animate(form.current, [{ boxShadow: '0 0 0 3px color-mix(in srgb, var(--color-good) 55%, transparent)' }, {}], { duration: 900, fill: 'none' });
    } else if (last.kind === 'close' && last.from === selfId) shake(form.current);
  }, [last, selfId]);

  // « / » ou « Entrée » hors champ : focus direct sur la réponse (clavier physique).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
      if (e.key === '/' || e.key === 'Enter') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input]);

  return (
    <div className={`gb gb-${variant} ${guessed ? 'gb-done' : ''}`}>
      {echo.length > 0 && (
        <ul className="gb-echo" aria-hidden>
          {echo.map((e) => (
            <li key={e.key} className={`gb-line gb-${e.line.kind}`}>
              {e.line.name && e.line.kind !== 'correct' && <b>{e.line.name} </b>}
              {e.line.text}
            </li>
          ))}
        </ul>
      )}
      {above}
      <form
        ref={form}
        className="gb-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || guessed) return;
          net.send({ t: 'chat', text });
          setText('');
        }}
      >
        {lead}
        <input
          ref={input}
          className="gb-input"
          maxLength={120}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          disabled={guessed}
          placeholder={guessed ? 'Trouvé ! Attends les autres…' : 'Ta réponse…'}
          aria-label="Ta réponse"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        {/* mousedown annulé : le clavier reste ouvert pour enchaîner les essais. */}
        <button type="submit" className="gb-send" disabled={guessed || !text.trim()} onPointerDown={(e) => e.preventDefault()} aria-label="Valider ma réponse">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12h13M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/**
 * Les derniers essais arrivés depuis l'ouverture de la boîte, chacun s'efface après ECHO_MS.
 * Les annonces du jeu (trouvé, système) passent par les Annonces, en haut de l'écran.
 */
function useEcho() {
  const chat = useGame((s) => s.chat);
  const [items, setItems] = useState<{ key: number; line: ChatLine }[]>([]);
  const seen = useRef(chat.at(-1));
  const next = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const line = chat.at(-1);
    if (!line || line === seen.current) return;
    seen.current = line;
    if (line.kind !== 'msg' && line.kind !== 'close') return;
    const key = ++next.current;
    setItems((l) => [...l.slice(-2), { key, line }]);
    const id = setTimeout(() => {
      timers.current.delete(id);
      setItems((l) => l.filter((x) => x.key !== key));
    }, ECHO_MS);
    timers.current.add(id);
  }, [chat]);
  return items;
}
