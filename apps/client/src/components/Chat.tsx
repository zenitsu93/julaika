import { useEffect, useRef, useState } from 'react';
import { net } from '../lib/net';
import { useGame } from '../lib/store';

const KIND_STYLE = {
  msg: '',
  system: 'text-muted',
  correct: 'font-semibold text-good',
  close: 'text-warn',
  guessed: 'text-good',
} as const;

export function Chat() {
  const chat = useGame((s) => s.chat);
  const isDrawer = useGame((s) => s.room!.phase === 'drawing' && s.room!.drawerId === s.selfId);
  const [text, setText] = useState('');
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat]);

  // « / » ou « Entrée » hors champ : focus direct sur la réponse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/' || e.key === 'Enter') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className="panel flex max-h-[60vh] min-h-64 flex-col lg:max-h-none">
      <ul ref={list} className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {chat.map((l, i) => (
          <li key={i} className={`break-words ${KIND_STYLE[l.kind]}`}>
            {l.name && l.kind !== 'correct' && <b className="font-semibold text-ink">{l.name} </b>}
            {l.text}
          </li>
        ))}
      </ul>
      <form
        className="flex items-center gap-2 border-t border-edge p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          net.send({ t: 'chat', text });
          setText('');
        }}
      >
        <input
          ref={input}
          className="input font-mono"
          maxLength={120}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isDrawer ? 'Discute sans donner le mot' : 'Ta réponse'}
          aria-label="Message"
          enterKeyHint="send"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <kbd className="kbd hidden sm:block">/</kbd>
        {/* Bouton visible pour le téléphone ; mousedown annulé pour garder le clavier ouvert. */}
        <button
          type="submit"
          className="btn-primary shrink-0 px-3"
          disabled={!text.trim()}
          onPointerDown={(e) => e.preventDefault()}
          aria-label={isDrawer ? 'Envoyer le message' : 'Valider ma réponse'}
        >
          {isDrawer ? 'Envoyer' : 'Valider'}
        </button>
      </form>
    </section>
  );
}
