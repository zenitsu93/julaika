import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { parseYoutubeLink, type MusicTrack } from '@julaika/shared';
import { attachHost, heard, music, nameOf, unlock, useMusic, warm } from '../lib/music';
import { inRoom, useGame } from '../lib/store';
import { thumbOf } from '../lib/youtube';
import { avatarOf } from '../lib/avatars';

/**
 * Lecteur de musique « l'île » : une capsule chocolat en bas à droite qui se déplie d'un geste.
 * Monté une seule fois au-dessus des pages : la musique ne se coupe pas quand on change d'écran
 * ou qu'on entre dans un salon.
 */
export function MusicPlayer() {
  const open = useMusic((s) => s.open);
  const playing = useMusic((s) => s.playing);
  const sheet = useMusic((s) => s.open && s.view !== 'now');
  const salon = useGame(inRoom);
  const hostRef = useRef<HTMLDivElement>(null);
  const away = useScrollAway(!open && !salon);
  useAutoFold(open);

  useLayoutEffect(() => {
    attachHost(hostRef.current);
    return () => attachHost(null);
  }, []);

  return (
    <aside
      className={`mp ${open ? 'mp-open' : 'mp-mini'} ${sheet ? 'mp-sheet' : ''} ${playing ? 'mp-playing' : ''} ${salon ? 'mp-salon' : ''} ${away ? 'mp-away' : ''}`}
      aria-label="Lecteur de musique"
      onPointerEnter={warm}
      onFocus={warm}
    >
      {/* Le cadre YouTube vit ici, derrière la pochette, et n'est jamais déplacé (il se rechargerait). */}
      <div ref={hostRef} className="mp-host" aria-hidden />
      {open ? <Card /> : <Pill />}
      <Notice />
    </aside>
  );
}

/**
 * Le lecteur ouvert ne doit jamais rester posé sur le jeu : il se replie quand on touche ailleurs,
 * avec Échap, quand la partie démarre et à chaque nouveau tour (palette du dessinateur, réponses…).
 */
function useAutoFold(open: boolean) {
  const phase = useGame((s) => s.room?.phase ?? null);
  const turn = useGame((s) => s.room?.drawerId ?? null);
  const game = useGame((s) => s.room?.game ?? null);
  useEffect(() => {
    if (open) music.setOpen(false);
  }, [phase, turn, game]);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (el?.closest('.mp, .mp-dockbtn')) return;
      music.setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && music.setOpen(false);
    // Le toucher qui vient d'ouvrir le lecteur ne doit pas le refermer aussitôt.
    const id = setTimeout(() => document.addEventListener('pointerdown', down, true));
    addEventListener('keydown', key);
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', down, true);
      removeEventListener('keydown', key);
    };
  }, [open]);
}

/** Accueil au téléphone : la capsule s'efface quand on descend (elle cachait les cartes), revient quand on remonte. */
function useScrollAway(active: boolean): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!active) return setAway(false);
    let last = scrollY;
    const on = () => {
      const y = scrollY;
      const bottom = y + innerHeight >= document.documentElement.scrollHeight - 40;
      if (Math.abs(y - last) < 8) return;
      setAway(y > last && y > 80 && !bottom && innerWidth < 1024);
      last = y;
    };
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, [active]);
  return away;
}

/**
 * Téléphone, tablette, en partie : la capsule flottante cachait les boutons du jeu dans le coin
 * (gomme, Valider, réponses du quiz…). Elle se range dans la barre du haut : ce disque l'ouvre.
 */
export function MusicDock() {
  const track = useMusic((s) => heard(s));
  const playing = useMusic((s) => s.playing);
  const listening = useMusic((s) => s.listening);
  const blocked = useMusic((s) => s.blocked);
  const open = useMusic((s) => s.open);
  return (
    <button
      type="button"
      className={`mp-dockbtn lg:hidden ${playing ? 'mp-playing' : ''}`}
      onClick={() => (blocked ? unlock() : music.setOpen(!open))}
      aria-label={blocked ? 'Activer le son de la musique' : open ? 'Replier le lecteur' : 'Ouvrir le lecteur de musique'}
      aria-expanded={open}
    >
      <span className="mp-discw">
        <span className="mp-disc" style={track ? { backgroundImage: `url(${thumbOf(track.id)})` } : undefined} />
        {!track && <span className="mp-dock-note" aria-hidden>♪</span>}
        <Ring />
        {(listening || blocked) && <span className="mp-ping" />}
      </span>
    </button>
  );
}

// ---- Capsule fermée ------------------------------------------------------------------------------

function Pill() {
  const track = useMusic((s) => heard(s));
  const playing = useMusic((s) => s.playing);
  const listening = useMusic((s) => s.listening);
  const blocked = useMusic((s) => s.blocked);
  return (
    <div className="mp-pill">
      <button className="mp-pill-open" onClick={() => music.setOpen(true)} aria-label="Ouvrir le lecteur">
        <span className="mp-discw">
          <span className="mp-disc" style={track ? { backgroundImage: `url(${thumbOf(track.id)})` } : undefined} />
          <Ring />
          {listening && <span className="mp-ping" />}
        </span>
        <span key={track?.id} className="mp-pill-t mp-blurin">
          {track ? (listening ? `${track.title} · salon` : track.title) : 'Musique'}
        </span>
      </button>
      {blocked ? (
        <SoundButton />
      ) : track && !playing ? (
        <PlayButton />
      ) : (
        <button className="mp-ib" onClick={() => (track ? music.pause() : music.setView('search'))} aria-label={track ? 'Pause' : 'Chercher une musique'}>
          {track ? <Eq /> : <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5" stroke />}
        </button>
      )}
    </div>
  );
}

function Ring() {
  const pos = useMusic((s) => s.pos);
  const dur = useMusic((s) => s.dur || heard(s)?.dur || 0);
  const C = 2 * Math.PI * 17;
  return (
    <svg className="mp-ring" viewBox="0 0 38 38" aria-hidden>
      <circle className="bg" cx="19" cy="19" r="17" />
      <circle className="fg" cx="19" cy="19" r="17" strokeDasharray={C} strokeDashoffset={C * (1 - (dur ? Math.min(1, pos / dur) : 0))} />
    </svg>
  );
}

// ---- Carte ouverte -------------------------------------------------------------------------------

function Card() {
  const track = useMusic((s) => heard(s));
  const view = useMusic((s) => s.view);
  const listening = useMusic((s) => s.listening);
  const shuffle = useMusic((s) => s.shuffle);
  const loading = useMusic((s) => s.loading);
  const sheet = view !== 'now' || !track;
  // Feuille du téléphone : un glissé vers le bas sur l'en-tête la replie.
  const grab = useRef<number | null>(null);
  return (
    <div className="mp-card">
      <div
        className="mp-top"
        onPointerDown={(e) => (grab.current = e.clientY)}
        onPointerUp={(e) => {
          if (grab.current !== null && e.clientY - grab.current > 50) music.setOpen(false);
          grab.current = null;
        }}
        onPointerCancel={() => (grab.current = null)}
      >
        {track ? (
          <span className="mp-cover" key={track.id}>
            <img src={thumbOf(track.id)} alt="" />
          </span>
        ) : (
          <span className="mp-cover mp-cover-empty" aria-hidden />
        )}
        <span key={track?.id ?? 'vide'} className="mp-meta mp-blurin">
          <b>{track ? track.title : 'Ta musique'}</b>
          <span>
            {track ? (listening ? 'avec le salon' : track.artist || 'YouTube') : 'Cherche un titre ou colle un lien'}
            {loading && <span className="mp-dots" aria-label="Chargement" />}
          </span>
        </span>
        <button className="mp-ib" onClick={() => music.setOpen(false)} aria-label="Replier le lecteur">
          <Icon d="M6 9l6 6 6-6" stroke />
        </button>
      </div>
      {track && (
        <>
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
            <button
              className={`mp-ib ${view !== 'now' ? 'on' : ''}`}
              onClick={() => music.setView(view === 'now' ? 'queue' : 'now')}
              aria-pressed={view !== 'now'}
              aria-label="Playlist et recherche"
            >
              <Icon d="M4 6h11M4 12h11M4 18h7M18 14v6M15 17h6" stroke />
            </button>
          </div>
        </>
      )}
      <Invite />
      <ShareRow />
      {sheet && <Sheet />}
    </div>
  );
}

function Sheet() {
  const view = useMusic((s) => (s.view === 'now' ? 'search' : s.view));
  const count = useMusic((s) => s.queue.length);
  const tabs = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ left: number; width: number } | null>(null);
  const [bump, setBump] = useState(0);
  const prevCount = useRef(count);
  useLayoutEffect(() => {
    const el = tabs.current?.querySelector<HTMLElement>(`[data-mp-tab="${view}"]`);
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [view]);
  useEffect(() => {
    if (count > prevCount.current) setBump((b) => b + 1);
    prevCount.current = count;
  }, [count]);
  return (
    <div className="mp-sheet-in">
      <div className="mp-tabs" role="tablist" ref={tabs}>
        {ind && <span className="mp-tab-ind" style={{ left: ind.left, width: ind.width }} />}
        <button role="tab" data-mp-tab="queue" aria-selected={view === 'queue'} onClick={() => music.setView('queue')}>
          Playlist
          {count > 0 && (
            <span key={bump} className={`mp-badge ${bump ? 'bump' : ''}`}>
              {count}
            </span>
          )}
        </button>
        <button role="tab" data-mp-tab="search" aria-selected={view === 'search'} onClick={() => music.setView('search')}>
          Chercher
        </button>
      </div>
      <div key={view} className="mp-sheet-body mp-blurin">
        {view === 'search' ? <SearchView /> : <QueueView />}
      </div>
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
        <span>{dur ? fmt(dur) : '--:--'}</span>
      </div>
    </div>
  );
}

/** Quelqu'un du salon partage sa musique : on l'écoute avec lui, et on peut libérer le son. */
function Invite() {
  const room = useMusic((s) => s.room);
  const listening = useMusic((s) => s.listening);
  const blocked = useMusic((s) => s.blocked);
  if (blocked)
    return (
      <button className="mp-line mp-unlock" onClick={unlock}>
        <span className="mp-pulse gold" />
        <span className="mp-line-t">Ton navigateur a coupé le son</span>
        <span className="mp-chipbtn gold">Activer</span>
      </button>
    );
  if (!room || !listening) return null;
  return (
    <div className="mp-line on">
      <span className="mp-pulse" />
      <span className="mp-line-t">
        Tu écoutes <b>{nameOf(room.dj)}</b> avec le salon
      </span>
    </div>
  );
}

/** Le son est bloqué : un bouton d'or qui pulse, le toucher suffit à le libérer. */
function SoundButton() {
  return (
    <button className="mp-ib mp-sound" onClick={unlock} aria-label="Activer le son">
      <Icon d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke />
    </button>
  );
}

/** Interrupteur « Partager avec le salon », seulement dans un salon. */
function ShareRow() {
  const online = useGame(inRoom);
  const players = useGame((s) => s.room?.players);
  const self = useGame((s) => s.selfId);
  const sharing = useMusic((s) => s.sharing);
  const listening = useMusic((s) => s.listening);
  const hasTrack = useMusic((s) => heard(s) !== null);
  if (!online || listening || !hasTrack) return null;
  const others = (players ?? []).filter((p) => p.id !== self && p.connected);
  return (
    <button className={`mp-line mp-share ${sharing ? 'on' : ''}`} onClick={() => music.share(!sharing)} aria-pressed={sharing}>
      {sharing ? <span className="mp-pulse" /> : <Icon d="M7 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M17 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M17 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M9.2 10.8l5.6-3.3M9.2 13.2l5.6 3.3" stroke />}
      <span className="mp-line-t">{sharing ? 'Le salon écoute avec toi' : 'Partager avec le salon'}</span>
      {sharing && others.length > 0 && (
        <span className="mp-stack">
          {others.slice(0, 3).map((p, i) => (
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
