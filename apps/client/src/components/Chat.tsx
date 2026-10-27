import { useEffect, useRef, useState } from 'react';
import { net } from '../lib/net';
import { useGame } from '../lib/store';

const KIND_STYLE = {
  msg: '',
  system: 'text-neon-cyan/80 italic',
  correct: 'font-semibold text-neon-lime',
  close: 'text-amber-300',
  guessed: 'text-neon-lime/80',
} as const;

export function Chat() {
  const chat = useGame((s) => s.chat);
  const isDrawer = useGame((s) => s.room!.phase === 'drawing' && s.room!.drawerId === s.selfId);
  const [text, setText] = useState('');
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [chat]);

  return (
    <section className="glass order-3 flex max-h-[70vh] min-h-64 flex-col lg:order-none lg:max-h-none">
      <ul ref={list} className="flex-1 space-y-1 overflow-y-auto p-3 text-sm">
        {chat.map((l, i) => (
          <li key={i} className={`break-words ${KIND_STYLE[l.kind]}`}>
            {l.name && l.kind !== 'correct' && <b className="text-ink">{l.name} : </b>}
            {l.text}
          </li>
        ))}
      </ul>
      <form
        className="border-t border-edge p-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          net.send({ t: 'chat', text });
          setText('');
        }}
      >
        <input
          className="input"
          maxLength={120}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isDrawer ? 'Discute (sans donner le mot !)' : 'Ta réponse…'}
          aria-label="Message"
        />
      </form>
    </section>
  );
}
