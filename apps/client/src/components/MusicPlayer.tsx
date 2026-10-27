import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { parseYoutubeLink, type MusicTrack } from '@julaika/shared';
import { attachHost, heard, music, nameOf, useMusic, warm, type MusicView } from '../lib/music';
import { useGame } from '../lib/store';
import { thumbOf } from '../lib/youtube';
import { avatarOf } from '../lib/avatars';

/**
 * Lecteur de musique flottant, en bas à droite de toutes les pages. Monté une seule fois au-dessus
 * des pages : la musique ne se coupe pas quand on change d'écran ou qu'on entre dans un salon.
 */
export function MusicPlayer() {
  const open = useMusic((s) => s.open);
  const playing = useMusic((s) => s.playing);
  const view = useMusic((s) => s.view);
  const hasTrack = useMusic((s) => heard(s) !== null);
  const inRoom = useGame((s) => s.status === 'online' && s.room !== null);
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    attachHost(hostRef.current);
    return () => attachHost(null);
  }, []);

  return (
    <aside
      className={`mp ${open ? 'mp-open' : 'mp-mini'} ${playing ? 'mp-playing' : ''} ${inRoom ? 'mp-salon' : ''}`}
      aria-label="Lecteur de musique"
      onPointerEnter={warm}
      onFocus={warm}
    >
      {open ? <PanelTop /> : <Chip />}
      {/* Le cadre YouTube vit ici et n'est jamais démonté : seul son volet s'ouvre ou se ferme. */}
      <div className={`mp-screen ${open && view === 'now' && hasTrack ? 'on' : ''}`}>
        <div className="mp-screen-in">
          <div ref={hostRef} className="mp-video" />
        </div>
      </div>
      {open && <PanelBody />}
      <Notice />
    </aside>
  );
}

// ---- Pastille repliée --------------------------------------------------------------------------

function Chip() {
  const track = useMusic((s) => heard(s));
  const pos = useMusic((s) => s.pos);
  const dur = useMusic((s) => s.dur || heard(s)?.dur || 0);
  const listening = useMusic((s) => s.listening);
  const invite = useMusic((s) => s.room !== null && !s.listening && !s.sharing);
  const C = 2 * Math.PI * 24;
  const long = (track?.title.length ?? 0) > 18;
  return (
    <div className="mp-chip">
      <button className="mp-discw" onClick={() => music.setOpen(true)} aria-label="Ouvrir le lecteur">
        <span className="mp-disc" style={track ? { backgroundImage: `url(${thumbOf(track.id)})` } : undefined} />
        <svg className="mp-ring" viewBox="0 0 52 52" aria-hidden>
          <circle className="bg" cx="26" cy="26" r="24" />
          <circle className="fg" cx="26" cy="26" r="24" strokeDasharray={C} strokeDashoffset={C * (1 - (dur ? Math.min(1, pos / dur) : 0))} />
        </svg>
        {invite && <span className="mp-ping" aria-label="Le salon partage de la musique" />}
      </button>
      <button className="mp-chip-meta" onClick={() => music.setOpen(true)}>
        {track ? (
          <>
            <span className={`mp-marq ${long ? 'long' : ''}`}>
              <span>{long ? `${track.title}   •   ${track.title}` : track.title}</span>
            </span>
            <span className="mp-chip-art">
              <Eq />
              {listening ? 'avec le salon' : track.artist || 'YouTube'}
            </span>
          </>
        ) : (
          <>
            <span className="mp-chip-title">Musique</span>
            <span className="mp-chip-art">Cherche un morceau</span>
          </>
        )}
      </button>
      {track && <PlayButton />}
      <button className="mp-ib mp-chip-up" onClick={() => music.setOpen(true)} aria-label="Ouvrir le lecteur">
        <Icon d="M6 15l6-6 6 6" stroke />
      </button>
    </div>
  );
}

// ---- Panneau ouvert ------------------------------------------------------------------------------

const TABS: { id: MusicView; label: string }[] = [
  { id: 'now', label: 'En cours' },
  { id: 'search', label: 'Chercher' },
  { id: 'queue', label: 'Playlist' },
];

function PanelTop() {
  const view = useMusic((s) => s.view);
  const count = useMusic((s) => s.queue.length);
  const listening = useMusic((s) => s.listening);
  const sharing = useMusic((s) => s.sharing);
  const tabs = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  const [bump, setBump] = useState(0);
  const prevCount = useRef(count);

  useLayoutEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>(`[data-v="${view}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [view]);
  useEffect(() => {
    if (count > prevCount.current) setBump((b) => b + 1);
    prevCount.current = count;
  }, [count]);

  return (
    <>
      <div className="mp-head">
        <span className="mp-title">
          <Eq />
          Musique
          {(listening || sharing) && <span className="mp-live">{listening ? 'avec le salon' : 'partagée'}</span>}
        </span>
        <button className="mp-ib" onClick={() => music.setOpen(false)} aria-label="Replier le lecteur">
          <Icon d="M6 9l6 6 6-6" stroke />
        </button>
      </div>
      <div className="mp-tabs" role="tablist" ref={tabs}>
        {ind && <span className="mp-tab-ind" style={{ left: ind.left, width: ind.width }} />}
        {TABS.map((t) => (
          <button key={t.id} role="tab" data-v={t.id} data-mp-tab={t.id} aria-selected={view === t.id} onClick={() => music.setView(t.id)}>
            {t.label}
            {t.id === 'queue' && count > 0 && (
              <span key={bump} className={`mp-badge ${bump ? 'bump' : ''}`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

function PanelBody() {
  const view = useMusic((s) => s.view);
  const prev = useRef(view);
  const order = TABS.findIndex((t) => t.id === view) - TABS.findIndex((t) => t.id === prev.current);
  useEffect(() => {
    prev.current = view;
  }, [view]);
  return (
    <div className="mp-body">
      <div key={view} className="mp-view" style={{ ['--dx' as string]: `${Math.sign(order) * 14}px` }}>
        {view === 'now' ? <NowView /> : view === 'search' ? <SearchView /> : <QueueView />}
      </div>
    </div>
  );
}

// ---- En cours ------------------------------------------------------------------------------------

function NowView() {
  const track = useMusic((s) => heard(s));
  const listening = useMusic((s) => s.listening);
  const shuffle = useMusic((s) => s.shuffle);
  const loading = useMusic((s) => s.loading);
  if (!track)
    return (
      <div className="mp-empty">
        <span className="mp-empty-disc" aria-hidden />
        <b>Ta playlist est vide</b>
        <p>Cherche un titre ou colle un lien YouTube, il jouera ici en continu, même quand tu changes de page.</p>
        <button className="mp-cta" onClick={() => music.setView('search')}>
          Chercher une musique
        </button>
        <Invite />
      </div>
    );
  return (
    <div className="mp-now">
      <div key={track.id} className="mp-now-meta">
        <b>{track.title}</b>
        <span>
          {track.artist || 'YouTube'}
          {loading && <span className="mp-dots" aria-label="Chargement" />}
        </span>
      </div>
      <Progress disabled={listening} />
      <div className="mp-ctrls">
        <button className={`mp-ib ${shuffle ? 'on' : ''}`} onClick={music.toggleShuffle} disabled={listening} aria-pressed={shuffle} aria-label="Aléatoire">
          <Icon d="M16 4h4v4M4 20L20 4M20 16v4h-4M15 15l5 5M4 4l5 5" stroke />
        </button>
        <button className="mp-ib" onClick={music.prev} disabled={listening} aria-label="Précédent">
          <Icon d="M6 5h2v14H6zM20 6.2v11.6a.8.8 0 0 1-1.2.7L10 12.7a.8.8 0 0 1 0-1.4l8.8-5.8a.8.8 0 0 1 1.2.7z" />
        </button>
        <PlayButton big />
        <button className="mp-ib" onClick={music.next} disabled={listening} aria-label="Suivant">
          <Icon d="M16 5h2v14h-2zM4 6.2v11.6a.8.8 0 0 0 1.2.7L14 12.7a.8.8 0 0 0 0-1.4L5.2 5.5A.8.8 0 0 0 4 6.2z" />
        </button>
        <span className="mp-ib on" title="Lecture en continu : la playlist recommence au début" aria-label="Lecture en continu">
          <Icon d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" stroke />
        </span>
      </div>
      <Invite />
      <ShareCard />
    </div>
  );
}

function Progress({ disabled }: { disabled: boolean }) {
  const pos = useMusic((s) => s.pos);
  const dur = useMusic((s) => s.dur || heard(s)?.dur || 0);
  const ratio = dur ? Math.min(1, pos / dur) : 0;
  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    music.seek(((e.clientX - r.left) / r.width) * dur);
  };
  return (
    <div className="mp-bar">
      <div
        className={`mp-track ${disabled ? 'off' : ''}`}
        onPointerDown={seek}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Position dans le morceau"
        aria-valuemin={0}
        aria-valuemax={Math.round(dur)}
        aria-valuenow={Math.round(pos)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') music.seek(pos + 5);
          if (e.key === 'ArrowLeft') music.seek(pos - 5);
        }}
      >
        <div className="mp-fill" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="mp-times">
        <span>{fmt(pos)}</span>
        <span>{dur ? `-${fmt(Math.max(0, dur - pos))}` : '--:--'}</span>
      </div>
    </div>
  );
}

/** Quelqu'un du salon partage sa musique : on propose de l'écouter. */
function Invite() {
  const room = useMusic((s) => s.room);
  const listening = useMusic((s) => s.listening);
  const sharing = useMusic((s) => s.sharing);
  const self = useGame((s) => s.selfId);
  if (!room || room.dj === self || sharing) return null;
  if (listening)
    return (
      <div className="mp-invite on">
        <span className="mp-pulse" />
        <span className="mp-invite-txt">
          <b>Tu écoutes la musique de {nameOf(room.dj)}</b>
          <small>{room.playing ? 'Synchronisée avec tout le salon' : 'En pause chez le salon'}</small>
        </span>
        <button className="mp-mini-btn" onClick={music.stopListening}>
          Quitter
        </button>
      </div>
    );
  return (
    <div className="mp-invite">
      <img src={thumbOf(room.track.id)} alt="" className="mp-invite-th" />
      <span className="mp-invite-txt">
        <b>{nameOf(room.dj)} partage sa musique</b>
        <small>{room.track.title}</small>
      </span>
      <button className="mp-mini-btn gold" onClick={music.listen}>
        Écouter
      </button>
    </div>
  );
}

/** Interrupteur « Partager avec le salon », seulement dans un salon. */
function ShareCard() {
  const online = useGame((s) => s.status === 'online' && s.room !== null);
  const players = useGame((s) => s.room?.players);
  const self = useGame((s) => s.selfId);
  const sharing = useMusic((s) => s.sharing);
  const listening = useMusic((s) => s.listening);
  if (!online || listening) return null;
  const others = (players ?? []).filter((p) => p.id !== self && p.connected);
  return (
    <button className={`mp-share ${sharing ? 'on' : ''}`} onClick={() => music.share(!sharing)} aria-pressed={sharing}>
      {sharing && <span className="mp-pulse" />}
      <span className="mp-share-txt">
        <b>{sharing ? 'Le salon écoute avec toi' : 'Partager avec le salon'}</b>
        <small>{sharing ? 'Pause, suivant : tout le monde suit en même temps' : 'Tes amis entendent la même musique, synchronisée'}</small>
      </span>
      {sharing && others.length > 0 && (
        <span className="mp-stack">
          {others.slice(0, 4).map((p, i) => (
            <span key={p.id} className="mp-av" style={{ animationDelay: `${i * 70}ms` }} title={p.name}>
              {avatarOf(p.avatar)}
            </span>
          ))}
        </span>
      )}
      <span className="mp-switch" aria-hidden />
    </button>
  );
}

// ---- Chercher ------------------------------------------------------------------------------------

type Search =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; tracks: MusicTrack[]; playlist?: { list: string; tracks: MusicTrack[] } }
  | { kind: 'error'; text: string };

const SUGGESTIONS = ['Aya Nakamura', 'Stromae', 'Angèle', 'Fally Ipupa', 'Tayc'];
let lastQuery = '';
let lastSearch: Search = { kind: 'idle' };

async function getTracks(path: string): Promise<MusicTrack[] | string> {
  try {
    const res = await fetch(`/api/musique/${path}`);
    const body = (await res.json()) as { tracks?: MusicTrack[]; error?: string };
    if (body.tracks) return body.tracks;
    if (body.error === 'cle') return 'La recherche n’est pas encore branchée : colle un lien YouTube à la place.';
    if (body.error === 'trop') return 'Doucement ! Réessaie dans quelques secondes.';
    if (body.error === 'introuvable') return 'Rien trouvé à ce lien.';
    return 'YouTube ne répond pas, réessaie dans un instant.';
  } catch {
    return 'Pas de connexion au serveur.';
  }
}

function SearchView() {
  const [q, setQ] = useState(lastQuery);
  const [res, setRes] = useState<Search>(lastSearch);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    lastQuery = q;
    lastSearch = res;
  }, [q, res]);
  useEffect(() => input.current?.focus({ preventScroll: true }), []);

  const run = async (text: string) => {
    const query = text.trim();
    if (!query) return;
    setRes({ kind: 'loading' });
    const link = parseYoutubeLink(query);
    if (link) {
      const [video, list] = await Promise.all([
        link.video ? getTracks(`video?id=${link.video}`) : Promise.resolve([] as MusicTrack[]),
        link.list ? getTracks(`playlist?list=${link.list}`) : Promise.resolve(null),
      ]);
      if (typeof video === 'string' && (list === null || typeof list === 'string')) return setRes({ kind: 'error', text: list ?? video });
      return setRes({
        kind: 'done',
        tracks: typeof video === 'string' ? [] : video,
        playlist: list && typeof list !== 'string' ? { list: link.list!, tracks: list } : undefined,
      });
    }
    const out = await getTracks(`recherche?q=${encodeURIComponent(query)}`);
    setRes(typeof out === 'string' ? { kind: 'error', text: out } : { kind: 'done', tracks: out });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(q);
  };

  return (
    <div>
      <form className="mp-search" onSubmit={submit} role="search">
        <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5" stroke />
        <input
          ref={input}
          id="mp-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (parseYoutubeLink(text)) {
              e.preventDefault();
              setQ(text);
              void run(text);
            }
          }}
          placeholder="Un titre, un artiste, un lien YouTube…"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={300}
        />
        <button type="submit" className="mp-go" disabled={!q.trim()} aria-label="Chercher">
          <Icon d="M5 12h14M13 6l6 6-6 6" stroke />
        </button>
      </form>
      {res.kind === 'idle' && (
        <div className="mp-chips">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setQ(s);
                void run(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {res.kind === 'loading' && (
        <ul className="mp-list">
          {[0, 1, 2].map((i) => (
            <li key={i} className="mp-skel" />
          ))}
        </ul>
      )}
      {res.kind === 'error' && <p className="mp-hint warn">{res.text}</p>}
      {res.kind === 'done' && (
        <>
          {res.playlist && <PlaylistCard tracks={res.playlist.tracks} />}
          <ul className="mp-list">
            {res.tracks.map((t, i) => (
              <ResultRow key={t.id} track={t} i={i} />
            ))}
          </ul>
          {!res.tracks.length && !res.playlist && <p className="mp-hint">Rien trouvé. Essaie avec le nom de l’artiste.</p>}
        </>
      )}
      {res.kind !== 'done' && <p className="mp-hint">Astuce : colle le lien d’une playlist YouTube pour l’ajouter en entier.</p>}
    </div>
  );
}

function PlaylistCard({ tracks }: { tracks: MusicTrack[] }) {
  const [added, setAdded] = useState<number | null>(null);
  const total = tracks.reduce((a, t) => a + t.dur, 0);
  return (
    <div className="mp-plcard">
      <span className="mp-plstack" aria-hidden>
        {tracks.slice(0, 3).map((t, i) => (
          <img key={t.id} src={thumbOf(t.id)} alt="" style={{ ['--i' as string]: i }} />
        ))}
      </span>
      <span className="mp-invite-txt">
        <b>Playlist YouTube</b>
        <small>
          {tracks.length} titres{total ? ` · ${Math.round(total / 60)} min` : ''}
        </small>
      </span>
      <button
        className={`mp-mini-btn gold ${added !== null ? 'done' : ''}`}
        disabled={added !== null}
        onClick={(e) => {
          setAdded(music.add(tracks));
          flyToQueue(e.currentTarget);
        }}
      >
        {added === null ? 'Tout ajouter' : added ? `+${added} ajoutés` : 'Déjà là'}
      </button>
    </div>
  );
}

function ResultRow({ track, i }: { track: MusicTrack; i: number }) {
  const inQueue = useMusic((s) => s.queue.some((t) => t.id === track.id));
  return (
    <li className="mp-row" style={{ animationDelay: `${i * 45}ms` }}>
      <img className="mp-th" src={thumbOf(track.id)} alt="" loading="lazy" />
      <span className="mp-row-m">
        <b>{track.title}</b>
        <span>
          {track.artist}
          {track.dur ? ` · ${fmt(track.dur)}` : ''}
        </span>
      </span>
      <button
        className={`mp-add ${inQueue ? 'done' : ''}`}
        disabled={inQueue}
        onClick={(e) => {
          if (music.add([track])) flyToQueue(e.currentTarget);
        }}
        aria-label={inQueue ? 'Déjà dans la playlist' : `Ajouter ${track.title} à la playlist`}
      >
        {inQueue ? <Icon d="M5 12.5l4.5 4.5L19 7.5" stroke /> : <Icon d="M12 5v14M5 12h14" stroke />}
      </button>
    </li>
  );
}

/** Une pastille d'or s'envole du bouton vers l'onglet Playlist. */
function flyToQueue(from: HTMLElement) {
  const tab = document.querySelector<HTMLElement>('[data-mp-tab="queue"]');
  if (!tab || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect();
  const b = tab.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'mp-fly';
  dot.style.left = `${a.left + a.width / 2 - 10}px`;
  dot.style.top = `${a.top + a.height / 2 - 10}px`;
  document.body.appendChild(dot);
  dot.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${(b.left + b.width / 2 - a.left - a.width / 2) / 2}px, ${b.top - a.top - 40}px) scale(.8)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px, ${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.3)`, opacity: 0.3 },
    ],
    { duration: 620, easing: 'cubic-bezier(.5,0,.4,1)' },
  ).onfinish = () => dot.remove();
}

// ---- Playlist ------------------------------------------------------------------------------------

function QueueView() {
  const queue = useMusic((s) => s.queue);
  const index = useMusic((s) => s.index);
  const listening = useMusic((s) => s.listening);
  const [leaving, setLeaving] = useState<string | null>(null);
  if (!queue.length)
    return (
      <div className="mp-empty">
        <span className="mp-empty-disc" aria-hidden />
        <b>Rien pour l’instant</b>
        <p>Les morceaux ajoutés depuis « Chercher » arrivent ici et s’enchaînent en boucle.</p>
        <button className="mp-cta" onClick={() => music.setView('search')}>
          Chercher une musique
        </button>
      </div>
    );
  const total = queue.reduce((a, t) => a + t.dur, 0);
  return (
    <div>
      <div className="mp-qhead">
        <b>Ma playlist</b>
        <span>
          {queue.length} titre{queue.length > 1 ? 's' : ''}
          {total ? ` · ${Math.round(total / 60)} min` : ''} · en boucle
        </span>
      </div>
      <ul className="mp-list">
        {queue.map((t, i) => {
          const cur = i === index && !listening;
          return (
            <li key={t.id} className={`mp-row ${cur ? 'cur' : ''} ${leaving === t.id ? 'out' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
              <button className="mp-row-play" onClick={() => music.playAt(i)} aria-label={`Jouer ${t.title}`}>
                <span className="mp-th-wrap">
                  <img className="mp-th" src={thumbOf(t.id)} alt="" loading="lazy" />
                  {cur && (
                    <span className="mp-th-eq">
                      <Eq />
                    </span>
                  )}
                </span>
                <span className="mp-row-m">
                  <b>{t.title}</b>
                  <span>{t.artist}</span>
                </span>
              </button>
              {t.dur > 0 && <span className="mp-dur">{fmt(t.dur)}</span>}
              {/* Toujours là (même invisible) pour que les durées restent alignées. */}
              <button
                className={`mp-ib mp-row-act ${cur || i === index + 1 ? 'mp-gone' : ''}`}
                onClick={() => music.playNext(i)}
                disabled={cur || i === index + 1}
                aria-label="Jouer ensuite"
                title="Jouer ensuite"
              >
                <Icon d="M12 19V5M6 11l6-6 6 6" stroke />
              </button>
              <button
                className="mp-ib mp-row-act"
                onClick={() => {
                  setLeaving(t.id);
                  setTimeout(() => {
                    setLeaving(null);
                    music.remove(queue.findIndex((x) => x.id === t.id));
                  }, 280);
                }}
                aria-label={`Retirer ${t.title}`}
              >
                <Icon d="M6 6l12 12M18 6L6 18" stroke />
              </button>
            </li>
          );
        })}
      </ul>
      <button className="mp-clear" onClick={music.clear}>
        Vider la playlist
      </button>
    </div>
  );
}

// ---- Petites pièces --------------------------------------------------------------------------------

const PLAY = 'M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z';
const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z';

function PlayButton({ big }: { big?: boolean }) {
  const playing = useMusic((s) => s.playing);
  return (
    <button className={`mp-ib mp-pp ${big ? 'big' : ''}`} onClick={music.toggle} aria-label={playing ? 'Pause' : 'Lecture'}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d={playing ? PAUSE : PLAY} fill="currentColor" />
      </svg>
    </button>
  );
}

function Notice() {
  const notice = useMusic((s) => s.notice);
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!notice) return;
    setShown(notice.seq);
    const t = setTimeout(() => setShown(null), 4200);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice || shown !== notice.seq) return null;
  return (
    <div key={notice.seq} className="mp-notice" role="status">
      {notice.text}
    </div>
  );
}

function Eq() {
  return (
    <span className="mp-eq" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

function Icon({ d, stroke }: { d: string; stroke?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d={d} {...(stroke ? { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } : { fill: 'currentColor' })} />
    </svg>
  );
}

function fmt(s: number) {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}
