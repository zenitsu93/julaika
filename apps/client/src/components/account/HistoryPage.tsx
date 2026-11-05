import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { HistoryParty } from '@julaika/shared';
import { api, useAccount } from '../../lib/account';
import { avatarOf } from '../../lib/avatars';
import { GAMES, type GameId } from '../../lib/games';
import { go } from '../../lib/route';
import { TremaLoader } from '../Logo';
import { AccountNav, Icon, dateFr } from './ui';

/** Le jeu de l'accueil qui correspond à une partie (le Mime est un mode du Dessin côté serveur). */
export const gameOf = (p: Pick<HistoryParty, 'game' | 'mode'>): GameId | null => {
  const id = p.game === 'dessin' && p.mode === 'mime' ? 'mime' : p.game;
  return GAMES.some((g) => g.id === id) ? (id as GameId) : null;
};
const nameOf = (p: HistoryParty) => GAMES.find((g) => g.id === gameOf(p))?.name ?? p.game;

const dayKey = (t: number) => new Date(t).toDateString();
function dayLabel(t: number) {
  const today = new Date();
  const d = new Date(t);
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  if (diff === 0) return 'Aujourd’hui';
  if (diff === 1) return 'Hier';
  const s = dateFr(t, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  return s[0]!.toUpperCase() + s.slice(1);
}

const MEDALS = ['🥇', '🥈', '🥉'];

/** L'historique, version « registre » : les parties par jour, chacune se déplie. */
export function HistoryPage({ onReplay }: { onReplay: (game: GameId) => void }) {
  const { user, ready } = useAccount();
  const [parties, setParties] = useState<HistoryParty[] | null>(null);
  const [stats, setStats] = useState<{ parties: number; wins: number; images: number; games: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) go('connexion');
  }, [ready, user]);
  useEffect(() => {
    if (!user) return;
    api<{ parties: HistoryParty[]; stats: typeof stats }>('/api/historique')
      .then((r) => {
        setParties(r.parties);
        setStats(r.stats);
        setOpen(r.parties[0]?.id ?? null);
      })
      .catch(() => setParties([]));
  }, [user?.id]);

  const days = useMemo(() => {
    const out: { key: string; label: string; items: HistoryParty[] }[] = [];
    for (const p of parties ?? []) {
      const k = dayKey(p.ended);
      if (out.at(-1)?.key !== k) out.push({ key: k, label: dayLabel(p.ended), items: [] });
      out.at(-1)!.items.push(p);
    }
    return out;
  }, [parties]);

  if (!user) return null;
  let row = 0;
  return (
    <div className="min-h-full pb-16">
      <AccountNav page="historique" />
      <section className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <h1 className="text-[1.7rem] tracking-[-0.02em]">Tes parties</h1>
        {stats && (
          <p className="mt-1 text-muted">
            {stats.parties} partie{stats.parties > 1 ? 's' : ''} · {stats.wins} victoire{stats.wins > 1 ? 's' : ''} · {stats.games} jeu{stats.games > 1 ? 'x' : ''} différent{stats.games > 1 ? 's' : ''}
          </p>
        )}
        {parties === null ? (
          <div className="grid place-items-center py-24">
            <TremaLoader className="h-6 w-7" />
          </div>
        ) : parties.length === 0 ? (
          <div className="acc-up grid justify-items-center gap-3 py-20 text-center">
            <span className="accroche text-5xl text-accent">à venir</span>
            <h2 className="text-xl">Pas encore de partie</h2>
            <p className="max-w-sm text-muted">Chaque partie que tu finis connecté arrive ici, avec le classement et les images.</p>
            <button type="button" className="btn-primary" onClick={() => go(null)}>
              Choisir un jeu
            </button>
          </div>
        ) : (
          days.map((d) => (
            <div key={d.key}>
              <h2 className="mt-7 mb-2.5 text-[11.5px] font-bold text-muted">{d.label}</h2>
              <div className="grid gap-2">
                {d.items.map((p) => (
                  <Row key={p.id} party={p} open={open === p.id} delay={Math.min(row++, 12) * 50} onToggle={() => setOpen((o) => (o === p.id ? null : p.id))} onReplay={onReplay} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function Row({ party: p, open, delay, onToggle, onReplay }: { party: HistoryParty; open: boolean; delay: number; onToggle: () => void; onReplay: (g: GameId) => void }) {
  const game = gameOf(p);
  const best = Math.max(1, ...p.players.map((x) => x.score));
  const minutes = Math.max(1, Math.round((p.ended - p.started) / 60000));
  const win = p.rank === 1 && p.players.length > 1;
  return (
    <article className={`reg-row overflow-hidden rounded-[14px] border bg-surface ${open ? 'open border-accent/50 shadow-[0_14px_30px_-20px_rgb(42_26_18/0.5)]' : 'border-edge'}`} style={{ animationDelay: `${delay}ms` }}>
      <button type="button" className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-3.5 py-3 text-left" onClick={onToggle} aria-expanded={open}>
        <span className={`grid size-10 place-items-center rounded-[10px] text-lg font-bold ${win ? 'bg-accent text-white' : 'bg-page text-ink'}`} aria-label={`Classé ${p.rank}e`}>
          {MEDALS[p.rank - 1] ?? p.rank}
        </span>
        <span className="min-w-0">
          <b className="block truncate">{nameOf(p)}</b>
          <small className="block truncate text-muted">
            {dateFr(p.ended, { hour: '2-digit', minute: '2-digit' })} · {minutes} min · {p.players.length} joueur{p.players.length > 1 ? 's' : ''}
          </small>
        </span>
        <span className="flex -space-x-1.5" aria-hidden>
          {p.players.slice(0, 4).map((x, i) => (
            <span key={i} className="grid size-7 place-items-center rounded-full bg-butter text-sm ring-2 ring-surface dark:bg-cacao-2">
              {avatarOf(x.avatar)}
            </span>
          ))}
        </span>
        <Icon name="chev" className="reg-chev size-4 text-muted" />
      </button>
      <div className="reg-more">
        <div className="min-h-0 overflow-hidden">
          <div className="grid gap-3 border-t border-dashed border-edge px-3.5 pt-3 pb-3.5">
            <ol className="grid gap-1.5">
              {p.players.map((x, i) => (
                <li key={i} className={`grid grid-cols-[1.4rem_1.6rem_minmax(0,7rem)_1fr_auto] items-center gap-2 text-sm ${x.me ? 'font-bold' : ''}`}>
                  <span className="text-center text-muted tabular-nums">{x.rank}</span>
                  <span aria-hidden>{avatarOf(x.avatar)}</span>
                  <span className="truncate">
                    {x.name}
                    {x.me && <span className="ml-1 text-xs font-medium text-accent">(toi)</span>}
                  </span>
                  <span className="reg-bar h-1.5 overflow-hidden rounded-full bg-edge">
                    <i className={`block h-full rounded-full ${x.me ? 'bg-accent' : 'bg-ink/35'}`} style={{ '--w': `${Math.round((x.score / best) * 100)}%` } as CSSProperties} />
                  </span>
                  <span className="text-right tabular-nums">{x.score}</span>
                </li>
              ))}
            </ol>
            {p.media.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {p.media.map((id) => (
                  <img key={id} src={`/api/album/${id}`} alt="" loading="lazy" className="h-20 w-auto shrink-0 rounded-md border border-edge bg-white object-cover" />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {game && (
                <button type="button" className="btn-primary" onClick={() => onReplay(game)}>
                  <Icon name="replay" />
                  Rejouer avec eux
                </button>
              )}
              {p.media.length > 0 && (
                <button type="button" className="btn-ghost" onClick={() => go('album')}>
                  <Icon name="album" />
                  Voir dans l'album
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
