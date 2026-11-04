import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ALBUM_GAME_NAMES, type AlbumGame, type MediaItem } from '@julaika/shared';
import { api, useAccount } from '../../lib/account';
import { saveImageFile } from '../../lib/polaroid';
import { go } from '../../lib/route';
import { TremaLoader } from '../Logo';
import { AccountNav, Avatar, Icon, dateFr, useToast } from './ui';

const src = (id: string) => `/api/album/${id}`;

async function downloadOne(item: MediaItem) {
  const r = await fetch(`${src(item.id)}?telecharger`, { credentials: 'same-origin' });
  if (!r.ok) throw new Error();
  const name = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? `julaika-${item.id}.webp`;
  const blob = await r.blob();
  return saveImageFile(new File([blob], name, { type: blob.type }));
}

/** Télécharge un .zip (toutes les images, ou une sélection) par un simple lien. */
function downloadZip(ids?: string[]) {
  const a = document.createElement('a');
  a.href = `/api/album/zip${ids?.length ? `?ids=${ids.join(',')}` : ''}`;
  a.download = '';
  document.body.append(a);
  a.click();
  a.remove();
}

/** L'album, version « pellicule » : profil, filtres par jeu, mosaïque de polaroids. */
export function AlbumPage() {
  const { user, stats, ready } = useAccount();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<AlbumGame | null>(null);
  const [more, setMore] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [toast, show] = useToast();

  useEffect(() => {
    if (ready && !user) go('connexion');
  }, [ready, user]);

  const load = async (before?: number) => {
    const q = new URLSearchParams();
    if (filter) q.set('jeu', filter);
    if (before) q.set('avant', String(before));
    q.set('n', '60');
    const r = await api<{ items: MediaItem[]; counts: Record<string, number> }>(`/api/album?${q}`);
    setCounts(r.counts);
    setItems((prev) => (before && prev ? [...prev, ...r.items] : r.items));
    setMore(r.items.length === 60);
  };
  useEffect(() => {
    if (!user) return;
    setItems(null);
    load().catch(() => setItems([]));
  }, [user?.id, filter]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const games = useMemo(() => (Object.keys(ALBUM_GAME_NAMES) as AlbumGame[]).filter((g) => counts[g]), [counts]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const remove = async (item: MediaItem) => {
    await api(`/api/album/${item.id}`, { method: 'DELETE' });
    setItems((l) => l?.filter((x) => x.id !== item.id) ?? null);
    setCounts((c) => ({ ...c, [item.game]: Math.max(0, (c[item.game] ?? 1) - 1) }));
    setOpen(null);
    show('Image retirée de ton album');
  };
  const save = async (item: MediaItem) => {
    try {
      const r = await downloadOne(item);
      if (r === 'saved') show('Image téléchargée');
      else if (r === 'shared') show('Image partagée');
    } catch {
      show('Le téléchargement n’a pas marché');
    }
  };

  if (!user) return null;
  const since = dateFr(user.created, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className={`min-h-full pb-28 ${selecting ? 'selecting' : ''}`}>
      <AccountNav page="album" />
      <section className="mx-auto grid max-w-6xl grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 px-4 pt-6 sm:grid-cols-[auto_1fr_auto] sm:px-6">
        <Avatar avatar={user.avatar} className="size-14 text-3xl ring-[3px] ring-accent sm:size-16" />
        <div className="min-w-0">
          <h1 className="truncate text-2xl tracking-[-0.02em]">{user.name}</h1>
          <p className="text-sm text-muted">Membre depuis le {since}</p>
          <dl className="mt-1.5 flex gap-5 text-[11.5px] text-muted">
            {[
              [stats?.images ?? total, 'images'],
              [stats?.parties ?? 0, 'parties'],
              [stats?.games ?? 0, 'jeux'],
            ].map(([n, l]) => (
              <div key={l} className="grid">
                <dd className="text-[17px] font-bold text-ink tabular-nums">{n}</dd>
                <dt className="order-last">{l}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button type="button" className="btn-ghost flex-1 sm:flex-none" onClick={() => (selecting ? stopSelecting() : setSelecting(true))} disabled={!total}>
            <Icon name={selecting ? 'x' : 'check'} />
            {selecting ? 'Annuler' : 'Sélectionner'}
          </button>
          <button type="button" className="btn-primary flex-1 sm:flex-none" onClick={() => (downloadZip(), show('Ton album arrive en .zip'))} disabled={!total}>
            <Icon name="dl" />
            Tout télécharger
          </button>
        </div>
      </section>

      {total > 0 && (
        <div className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pt-5 pb-4 [scrollbar-width:none] sm:px-6" role="tablist" aria-label="Filtrer par jeu">
          {([null, ...games] as (AlbumGame | null)[]).map((g) => {
            const on = filter === g;
            return (
              <button
                key={g ?? 'tout'}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(g)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition active:scale-95 ${on ? 'border-primary bg-primary text-on-primary' : 'border-edge bg-surface text-muted hover:text-ink'}`}
              >
                {g ? ALBUM_GAME_NAMES[g] : 'Tout'}
                <small className="text-[11px] tabular-nums opacity-70">{g ? counts[g] : total}</small>
              </button>
            );
          })}
        </div>
      )}

      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        {items === null ? (
          <div className="grid place-items-center py-24">
            <TremaLoader className="h-6 w-7" />
          </div>
        ) : items.length === 0 ? (
          <Empty />
        ) : (
          <>
            <div className="album-grid">
              {items.map((it, i) => (
                <div
                  key={it.id}
                  className={`album-it relative mb-3.5 ${selected.has(it.id) ? 'on' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 20) * 45}ms`, '--tilt': i % 2 ? '1deg' : '-1deg' } as CSSProperties}
                >
                  <button
                    type="button"
                    className="block w-full text-left"
                    onClick={() => (selecting ? toggle(it.id) : setOpen(i))}
                    aria-label={selecting ? `Sélectionner « ${it.caption} »` : `Ouvrir « ${it.caption} »`}
                    aria-pressed={selecting ? selected.has(it.id) : undefined}
                  >
                    <figure className="pola-frame m-0">
                      <img src={src(it.id)} alt={it.caption} loading="lazy" decoding="async" className="block w-full border border-[#efe6d6] bg-white" />
                      <figcaption>{it.caption || ALBUM_GAME_NAMES[it.game]}</figcaption>
                    </figure>
                  </button>
                  <span className={`chk pointer-events-none absolute top-3 left-3 grid size-7 place-items-center rounded-full shadow ${selected.has(it.id) ? 'bg-accent text-white' : 'bg-surface/90 text-ink'}`} aria-hidden>
                    <Icon name="check" className="size-3.5 stroke-[3]" />
                  </span>
                  {!selecting && (
                    <div className="tools absolute top-3 right-3 flex gap-1.5">
                      <button type="button" className="grid size-8 place-items-center rounded-lg bg-surface/95 text-ink shadow" onClick={() => void save(it)} aria-label="Télécharger">
                        <Icon name="dl" />
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between px-0.5 pt-1.5 text-[11.5px] text-muted">
                    <span>{ALBUM_GAME_NAMES[it.game]}</span>
                    <span>{dateFr(it.created)}</span>
                  </div>
                </div>
              ))}
            </div>
            {more && (
              <div className="grid place-items-center py-6">
                <button type="button" className="btn-ghost" onClick={() => void load(items.at(-1)?.created)}>
                  Voir les images plus anciennes
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <div
        className={`album-bar fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-30 flex max-w-[calc(100vw-24px)] items-center gap-2.5 rounded-2xl bg-primary py-2 pr-2 pl-4 text-sm font-semibold text-on-primary shadow-[0_18px_40px_-18px_rgb(0_0_0/0.7)] ${selecting ? 'on' : ''}`}
        aria-hidden={!selecting}
      >
        <span className="tabular-nums">
          {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          className="btn bg-on-primary text-primary"
          disabled={!selected.size}
          tabIndex={selecting ? 0 : -1}
          onClick={() => {
            downloadZip([...selected]);
            show(`${selected.size} image${selected.size > 1 ? 's' : ''} en .zip`);
            stopSelecting();
          }}
        >
          <Icon name="dl" />
          Télécharger (.zip)
        </button>
        <button type="button" className="p-1.5 opacity-70" onClick={stopSelecting} aria-label="Annuler la sélection" tabIndex={selecting ? 0 : -1}>
          <Icon name="x" />
        </button>
      </div>

      {open !== null && items?.[open] && (
        <Lightbox
          item={items[open]}
          onClose={() => setOpen(null)}
          onNav={(d) => setOpen((o) => (o === null ? o : (o + d + items.length) % items.length))}
          onSave={save}
          onRemove={remove}
        />
      )}
      {toast}
    </div>
  );
}

function Lightbox({ item, onClose, onNav, onSave, onRemove }: { item: MediaItem; onClose: () => void; onNav: (d: number) => void; onSave: (i: MediaItem) => void; onRemove: (i: MediaItem) => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => setConfirm(false), [item.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNav(-1);
      if (e.key === 'ArrowRight') onNav(1);
    };
    addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <div className="lightbox fixed inset-0 z-40 grid overflow-auto bg-cacao/90 backdrop-blur-md sm:grid-cols-[1fr_300px]" role="dialog" aria-modal="true" aria-label={item.caption}>
      <div className="relative grid min-h-[60vh] place-items-center p-6 sm:p-10" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <button type="button" className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-butter/15 text-butter" onClick={() => onNav(-1)} aria-label="Image précédente">
          <Icon name="left" className="size-5" />
        </button>
        <figure key={item.id} className="pola-frame m-0 w-[min(440px,78vw)]">
          <img src={src(item.id)} alt={item.caption} className="block max-h-[70vh] w-full border border-[#efe6d6] bg-white object-contain" />
          <figcaption>{item.caption}</figcaption>
        </figure>
        <button type="button" className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-butter/15 text-butter" onClick={() => onNav(1)} aria-label="Image suivante">
          <Icon name="right" className="size-5" />
        </button>
      </div>
      <aside className="grid content-start gap-4 bg-surface p-5">
        <button type="button" className="justify-self-end p-1 text-muted" onClick={onClose} aria-label="Fermer">
          <Icon name="x" className="size-5" />
        </button>
        <h2 className="text-xl">{item.caption || ALBUM_GAME_NAMES[item.game]}</h2>
        <dl className="grid gap-2 text-sm">
          {[
            ['Jeu', ALBUM_GAME_NAMES[item.game]],
            ['Date', dateFr(item.created, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })],
            ['Avec', item.people.length ? item.people.join(', ') : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-dashed border-edge pb-1.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-2">
          <button type="button" className="btn-primary w-full py-2.5" onClick={() => onSave(item)}>
            <Icon name="dl" />
            Télécharger
          </button>
          {confirm ? (
            <div className="m-pop grid gap-2 rounded-xl border border-bad/40 p-3 text-sm">
              Retirer cette image de ton album ? Elle sera effacée.
              <div className="flex gap-2">
                <button type="button" className="btn flex-1 bg-bad text-white" onClick={() => onRemove(item)}>
                  Retirer
                </button>
                <button type="button" className="btn-ghost flex-1" onClick={() => setConfirm(false)}>
                  Garder
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn-ghost w-full text-bad" onClick={() => setConfirm(true)}>
              <Icon name="trash" />
              Retirer de mon album
            </button>
          )}
        </div>
        <p className="rounded-xl bg-page p-3 text-xs text-muted">Sur téléphone, « Télécharger » ouvre le menu de partage : choisis « Enregistrer l'image » pour la mettre dans tes photos.</p>
      </aside>
    </div>
  );
}

function Empty() {
  return (
    <div className="acc-up mx-auto grid max-w-md justify-items-center gap-3 py-20 text-center">
      <span className="accroche text-5xl text-accent">bientôt</span>
      <h2 className="text-xl">Ton album est encore vide</h2>
      <p className="text-muted">Joue au Dessin, au Mime, au Photomaton, au Cadavre exquis, au Téléphone, à Flash ou au Cerveau coupé : les images de chaque partie arrivent ici toutes seules.</p>
      <button type="button" className="btn-primary" onClick={() => go(null)}>
        Choisir un jeu
      </button>
    </div>
  );
}
