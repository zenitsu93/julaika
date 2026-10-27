import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { MOT_LENGTH, MOT_TRIES, foldMot, shareMot, type LetterMark, type MotError, type MotState } from '@julaika/shared';
import { AVATARS, avatarOf } from '../../lib/avatars';
import { MOT_ERRORS, fetchMot, sendGuess } from '../../lib/mot';
import { bump, confetti, reducedMotion, shake, Ticker } from '../../motion';
import { PencilReaction } from '../Reaction';
import { MotBoard } from './MotBoard';
import { TILE } from './tiles';

/** Temps d'une case qui se retourne et décalage entre deux cases. */
const FLIP = 500;
const STAGGER = 250;
const REVEAL = FLIP + STAGGER * (MOT_LENGTH - 1);

const ROWS = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];
const RANK: Record<LetterMark, number> = { ok: 3, near: 2, no: 1 };

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

/** Mot du jour : 5 lettres, 6 essais, et le classement de chaque jour à côté. */
export function MotDuJour({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<MotState | null>(null);
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  /** Rangée qui vient d'être validée : elle se retourne, le clavier attend la fin. */
  const [fresh, setFresh] = useState<number | null>(null);
  const [hop, setHop] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const [reaction, setReaction] = useState<'win' | 'lose' | null>(null);
  const [name, setName] = useState(() => load('julaika:name', ''));
  const [avatar, setAvatar] = useState(() => load('julaika:avatar', Math.floor(Math.random() * AVATARS.length)));
  const [editing, setEditing] = useState(() => !load('julaika:name', '').trim());
  const row = useRef<HTMLDivElement>(null);
  const sky = useRef<HTMLCanvasElement>(null);

  const say = (text: string) => setToast({ text, id: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const reload = useCallback(() => {
    fetchMot()
      .then((s) => {
        setState(s);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(reload, [reload]);

  // Le classement du jour se met à jour tout seul pendant que des amis jouent.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetchMot()
        .then((s) => setState((prev) => (prev && prev.date === s.date ? { ...prev, board: s.board, playing: s.playing } : s)))
        .catch(() => {});
    }, 20_000);
    return () => clearInterval(t);
  }, []);

  const done = Boolean(state?.done);
  const revealing = fresh !== null;
  const locked = !state || done || busy || revealing || editing;

  const submit = async () => {
    if (locked) return;
    if (current.length < MOT_LENGTH) {
      shake(row.current);
      return say(MOT_ERRORS.longueur);
    }
    setBusy(true);
    let out: MotState | MotError | 'reseau';
    try {
      out = await sendGuess(current, name, avatar);
    } catch {
      out = 'reseau';
    }
    setBusy(false);
    if (typeof out === 'string') {
      shake(row.current);
      if (out === 'pseudo') setEditing(true);
      if (out === 'fini') reload();
      return say(MOT_ERRORS[out]);
    }
    const index = out.guesses.length - 1;
    setState(out);
    setCurrent('');
    setFresh(index);
    const won = out.won;
    const delay = reducedMotion() ? 0 : REVEAL;
    setTimeout(() => {
      setFresh(null);
      if (won) {
        setHop(true);
        setTimeout(() => {
          confetti(sky.current, 140);
          setReaction('win');
        }, reducedMotion() ? 0 : 450);
        say(['Génial !', 'Magnifique !', 'Bravo !', 'Bien joué !', 'Ouf !', 'De justesse !'][index] ?? 'Bravo !');
      } else if (out.done) {
        setReaction('lose');
        say(`Le mot était ${out.answer?.toUpperCase()}`);
      }
    }, delay);
  };

  const type = (key: string) => {
    if (locked) return;
    if (key === 'Enter') return void submit();
    if (key === 'Backspace') return setCurrent((c) => c.slice(0, -1));
    const letter = foldMot(key);
    if (letter.length === 1) setCurrent((c) => (c.length < MOT_LENGTH ? c + letter : c));
  };

  // Clavier physique (les lettres accentuées comptent sans accent).
  const typeRef = useRef(type);
  typeRef.current = type;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      if (e.key === 'Enter' || e.key === 'Backspace' || /^\p{L}$/u.test(e.key)) {
        e.preventDefault();
        typeRef.current(e.key);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);

  // Couleurs du clavier : la rangée qui se retourne ne compte qu'une fois retournée.
  const keys = new Map<string, LetterMark>();
  state?.guesses.forEach((g, r) => {
    if (r === fresh) return;
    [...g.word].forEach((c, i) => {
      const m = g.marks[i]!;
      if (!keys.has(c) || RANK[m] > RANK[keys.get(c)!]) keys.set(c, m);
    });
  });

  const saveName = (n: string, a: number) => {
    try {
      localStorage.setItem('julaika:name', JSON.stringify(n));
      localStorage.setItem('julaika:avatar', JSON.stringify(a));
    } catch {}
  };

  return (
    <main className="min-h-full pb-10">
      <canvas ref={sky} className="pointer-events-none fixed inset-0 z-30 size-full" aria-hidden />
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <button type="button" onClick={onBack} className="btn -ml-3 text-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Tous les jeux
        </button>
        {!editing && name && (
          <button type="button" className="btn-ghost m-pop" onClick={() => setEditing(true)} title="Changer de pseudo">
            <span className="text-lg leading-none">{avatarOf(avatar)}</span>
            {name}
          </button>
        )}
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section className="flex flex-col items-center">
          <div className="m-rise mb-5 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-muted">{state ? `n° ${state.number}` : '…'}</p>
            <h1 className="text-4xl font-semibold leading-none tracking-[-0.045em] sm:text-5xl">
              <span className="accroche text-4xl text-muted sm:text-5xl">devine le</span>
              Mot du jour
            </h1>
          </div>

          {editing && (
            <NameForm
              name={name}
              avatar={avatar}
              onDone={(n, a) => {
                setName(n);
                setAvatar(a);
                saveName(n, a);
                setEditing(false);
              }}
            />
          )}

          <div className="relative">
            <div className="grid gap-1.5 [perspective:600px]" role="grid" aria-label="Grille du mot du jour">
              {Array.from({ length: MOT_TRIES }, (_, r) => {
                const guess = state?.guesses[r];
                const live = !done && r === (state?.guesses.length ?? 0);
                return (
                  <div key={r} ref={live ? row : undefined} role="row" className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: MOT_LENGTH }, (_, i) => {
                      if (guess) {
                        const t = TILE[guess.marks[i]!];
                        const flipping = r === fresh;
                        const hopping = hop && r === state!.guesses.length - 1;
                        const style = {
                          '--c': t.c,
                          animationDelay: flipping ? `${i * STAGGER}ms` : hopping ? `${i * 90}ms` : undefined,
                        } as CSSProperties;
                        return (
                          <Tile key={`${i}-${flipping}-${hopping}`} className={`${t.className} ${flipping ? 'mot-reveal' : hopping ? 'mot-hop' : ''}`} style={style}>
                            {guess.word[i]}
                          </Tile>
                        );
                      }
                      const c = live ? current[i] : undefined;
                      return (
                        <Tile key={`${i}-${c ?? ''}`} className={c ? 'mot-type border-muted bg-surface' : 'border-edge bg-surface'}>
                          {c}
                        </Tile>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {reaction && <PencilReaction kind={reaction} onDone={() => setReaction(null)} />}
          </div>

          <div className="relative mt-4 h-10 w-full max-w-sm" aria-live="polite">
            {toast && (
              <p key={toast.id} className="m-pop mx-auto w-fit rounded-md bg-primary px-3 py-2 text-sm font-medium text-on-primary shadow-lg">
                {toast.text}
              </p>
            )}
            {!toast && failed && (
              <p className="m-rise text-center text-sm text-bad">
                Connexion impossible.{' '}
                <button type="button" className="underline" onClick={reload}>
                  Réessayer
                </button>
              </p>
            )}
          </div>

          {state && done && !revealing ? (
            <EndCard state={state} onNext={reload} />
          ) : (
            <Keyboard keys={keys} disabled={locked} onKey={type} />
          )}
        </section>

        <MotBoard today={state} />
      </div>
    </main>
  );
}

function Tile({ className, style, children }: { className: string; style?: CSSProperties; children?: string }) {
  return (
    <div
      role="gridcell"
      style={style}
      className={`grid size-14 place-items-center rounded-lg border-2 text-3xl font-bold uppercase select-none sm:size-16 ${className}`}
    >
      {children}
    </div>
  );
}

function Keyboard({ keys, disabled, onKey }: { keys: Map<string, LetterMark>; disabled: boolean; onKey: (k: string) => void }) {
  const press = (k: string, el: HTMLElement) => {
    bump(el, 1.08);
    onKey(k);
  };
  const base = 'btn h-13 min-w-0 flex-1 rounded-md px-0 text-base font-semibold sm:h-14';
  return (
    <div className="w-full max-w-lg space-y-1.5 select-none" aria-label="Clavier">
      {ROWS.map((letters, r) => (
        <div key={r} className="flex gap-1.5">
          {r === 2 && (
            <button type="button" disabled={disabled} className={`${base} flex-[1.6] bg-edge text-xs`} onClick={(e) => press('Enter', e.currentTarget)}>
              Entrée
            </button>
          )}
          {[...letters].map((c) => {
            const m = keys.get(c);
            return (
              <button
                key={`${c}-${m ?? ''}`}
                type="button"
                disabled={disabled}
                aria-label={c}
                className={`${base} ${m ? `mot-key ${TILE[m].className}` : 'bg-edge'}`}
                onClick={(e) => press(c, e.currentTarget)}
              >
                {c}
              </button>
            );
          })}
          {r === 2 && (
            <button type="button" disabled={disabled} aria-label="Effacer" className={`${base} flex-[1.6] bg-edge`} onClick={(e) => press('Backspace', e.currentTarget)}>
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 5H9l-6 7 6 7h12zM17 9l-6 6M11 9l6 6" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function NameForm({ name, avatar, onDone }: { name: string; avatar: number; onDone: (name: string, avatar: number) => void }) {
  const [value, setValue] = useState(name);
  const [face, setFace] = useState(avatar);
  const faceRef = useRef<HTMLButtonElement>(null);
  return (
    <form
      className="panel m-rise mb-5 flex w-full max-w-sm items-end gap-2 p-3 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onDone(value.trim(), face);
      }}
    >
      <button
        ref={faceRef}
        type="button"
        title="Changer d'avatar"
        className="btn-ghost size-10 shrink-0 p-0 text-xl"
        onClick={() => {
          setFace((f) => (f + 1) % AVATARS.length);
          bump(faceRef.current);
        }}
      >
        {avatarOf(face)}
      </button>
      <label className="flex-1">
        <span className="mb-1 block text-xs font-medium text-muted">Ton pseudo pour le classement</span>
        <input autoFocus className="input" maxLength={20} value={value} placeholder="Ton pseudo" onChange={(e) => setValue(e.target.value)} />
      </label>
      <button className="btn-primary h-10" disabled={!value.trim()}>
        OK
      </button>
    </form>
  );
}

/** Fin de partie : le mot, le rang, le partage et le temps avant le prochain mot. */
function EndCard({ state, onNext }: { state: MotState; onNext: () => void }) {
  const [copied, setCopied] = useState(false);
  const shareBtn = useRef<HTMLButtonElement>(null);
  const rank = state.board.findIndex((e) => e.you) + 1;
  const left = useCountdown(state.nextAt, onNext);

  const share = async () => {
    const text = shareMot(state.number, state.guesses, state.won);
    bump(shareBtn.current);
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  return (
    <div className="panel m-rise w-full max-w-sm p-5 text-center shadow-sm">
      <p className="text-sm text-muted">{state.won ? `Trouvé en ${state.guesses.length} essai${state.guesses.length > 1 ? 's' : ''}` : 'Pas cette fois…'}</p>
      <p className="mt-1 text-4xl font-semibold uppercase tracking-[0.12em]">{state.answer}</p>
      {rank > 0 && (
        <p className="mt-2 text-sm">
          <span className="font-semibold">{rank === 1 ? '1er' : `${rank}e`}</span> sur {state.board.length} aujourd'hui
        </p>
      )}
      <button ref={shareBtn} type="button" className="btn-primary mt-4 w-full py-2.5" onClick={share}>
        {copied ? 'Copié !' : 'Partager mon résultat'}
      </button>
      <p className="mt-4 text-xs uppercase tracking-widest text-muted">Prochain mot dans</p>
      <Ticker value={left} className="mt-1 font-mono text-2xl font-semibold" />
    </div>
  );
}

function useCountdown(at: number, onEnd: () => void) {
  const [now, setNow] = useState(Date.now);
  const ended = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((at - now) / 1000));
  useEffect(() => {
    if (s === 0 && !ended.current) {
      ended.current = true;
      setTimeout(onEnd, 1500);
    }
  }, [s, onEnd]);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
