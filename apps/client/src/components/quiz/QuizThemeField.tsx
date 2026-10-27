import { useEffect, useState } from 'react';
import { QUIZ_MAX_THEMES, QUIZ_SUGGESTIONS, QUIZ_THEME_MAX, parseQuizThemes } from '@julaika/shared';
import { net } from '../../lib/net';
import { useGame } from '../../lib/store';

const send = (quizTheme: string) => net.send({ t: 'settings', settings: { quizTheme } });

/** Exemples qui s'écrivent tout seuls dans le champ vide, lettre à lettre. */
const EXAMPLES = ['les Jeux olympiques', 'Harry Potter', 'la Côte d’Ivoire', 'les dinosaures', 'le rap français', 'Disney', 'la Coupe du monde'];

function useTypedExample(active: boolean) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active) return;
    let word = 0;
    let len = 0;
    let dir = 1;
    let pause = 0;
    const t = setInterval(() => {
      if (pause > 0) return void pause--;
      const full = EXAMPLES[word % EXAMPLES.length]!;
      len += dir;
      // Mot complet : on le laisse lire, puis on l'efface et on passe au suivant.
      if (len >= full.length) [dir, pause] = [-1, 22];
      else if (len <= 0) [dir, pause, word] = [1, 5, word + 1];
      setText(full.slice(0, Math.max(0, len)));
    }, 70);
    return () => clearInterval(t);
  }, [active]);
  return text;
}

/** Le thème du quiz : champ libre pour l'hôte, idées d'un clic, jusqu'à quatre thèmes mélangés. */
export function QuizThemeField({ isHost }: { isHost: boolean }) {
  const theme = useGame((s) => s.room!.settings.quizTheme);
  const [draft, setDraft] = useState(theme);
  const [focus, setFocus] = useState(false);
  useEffect(() => setDraft(theme), [theme]);
  const typed = useTypedExample(isHost && !draft && !focus);
  const themes = theme.trim() ? parseQuizThemes(theme) : [];
  const has = (t: string) => themes.some((x) => x.toLowerCase() === t.toLowerCase());

  const toggle = (t: string) => {
    const next = has(t) ? themes.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...themes, t].slice(-QUIZ_MAX_THEMES);
    const value = next.join(', ');
    setDraft(value);
    send(value);
  };

  if (!isHost) {
    return (
      <div className="mt-3 text-left text-sm">
        <span className="mb-1 block text-muted">Thème</span>
        <div className="flex flex-wrap gap-1.5">
          {(themes.length ? themes : ['Culture générale']).map((t, i) => (
            <span key={t} className="m-pop rounded-full bg-cacao px-2.5 py-1 font-semibold text-butter" style={{ animationDelay: `${i * 60}ms` }}>
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 text-left text-sm">
      <label htmlFor="quiz-theme" className="mb-1 flex items-center justify-between text-muted">
        <span>Thème des questions</span>
        <span className="text-xs">jusqu’à {QUIZ_MAX_THEMES}, séparés par des virgules</span>
      </label>
      <div className="relative">
        <input
          id="quiz-theme"
          className="input pr-10 text-base"
          maxLength={QUIZ_THEME_MAX}
          value={draft}
          onFocus={() => setFocus(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocus(false);
            if (draft !== theme) send(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-describedby="quiz-theme-hint"
        />
        {!draft && !focus && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted" aria-hidden>
            Ex. : {typed}
            <span className="m-breathe ml-px inline-block h-5 w-px bg-accent" />
          </span>
        )}
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-lg" aria-hidden>
          ✨
        </span>
      </div>
      <p id="quiz-theme-hint" className="mt-1 text-xs text-muted">
        L’IA écrit les questions selon ton thème. Vide, c’est de la culture générale.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Idées de thèmes">
        {QUIZ_SUGGESTIONS.map((t, i) => {
          const on = has(t);
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(t)}
              className={`m-pop rounded-full border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-95 ${
                on ? 'border-cacao bg-cacao text-butter' : 'border-edge bg-surface text-muted hover:border-ink/40 hover:text-ink'
              }`}
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {on ? '✓ ' : '+ '}
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
