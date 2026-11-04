import { useSyncExternalStore } from 'react';
import { CANVAS_H, CANVAS_W, FLASH_IMAGES, type AlbumGame, type DrawPacket, type MediaUpload } from '@julaika/shared';
import { account, api } from './account';
import { BoardCanvas, board } from './board';
import { cerveauPages } from './cerveau';
import { store, type GameState } from './store';

/**
 * Garde les images des parties pour l'album. Le jeu les a déjà (dessins, polaroids, créatures) :
 * on les repère dans l'état du salon, on les réduit en WebP et on les envoie au compte.
 * Un invité n'a pas de compte : ses images attendent 24 h dans ce navigateur, au cas où il en crée un
 * (bouton « Garder ce souvenir » en fin de partie).
 */

type Pending = MediaUpload & { at: number };

const PENDING_HOURS = 24;
const PENDING_MAX = 80;
const seen = new Set<string>();
const queue: MediaUpload[] = [];
let sending = false;

// ---- Compteur des images en attente (invités) ------------------------------------

let pendingCount = 0;
const listeners = new Set<() => void>();
const setPending = (n: number) => {
  pendingCount = n;
  for (const l of listeners) l();
};
export function usePendingCount(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pendingCount,
  );
}

// ---- Rendu des images ----------------------------------------------------------------

/** Rejoue des traits sur une feuille blanche. */
function sheet(packets: DrawPacket[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CANVAS_W;
  c.height = CANVAS_H;
  const b = new BoardCanvas();
  b.attach(c);
  for (const p of packets) b.apply(p);
  return c;
}

/** WebP quand le navigateur sait l'écrire (sinon PNG, Safari ancien), largeur bornée. */
function encode(canvas: HTMLCanvasElement, maxW = 800): string {
  let c = canvas;
  if (canvas.width > maxW) {
    c = document.createElement('canvas');
    c.width = maxW;
    c.height = Math.round((canvas.height * maxW) / canvas.width);
    c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
  }
  const webp = c.toDataURL('image/webp', 0.86);
  return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png');
}

/** Créature du cadavre exquis : les trois morceaux empilés, tête en haut. */
function creature(pieces: { strokes: DrawPacket[] }[]): string {
  const w = 600;
  const h = Math.round((CANVAS_H * w) / CANVAS_W);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h * pieces.length;
  const ctx = out.getContext('2d')!;
  pieces.forEach((p, i) => ctx.drawImage(sheet(p.strokes), 0, i * h, w, h));
  return encode(out, w);
}

// ---- Repérage dans l'état du salon ----------------------------------------------------

function people(s: GameState): string[] {
  return (s.room?.players ?? []).filter((p) => p.id !== s.selfId).map((p) => p.name);
}

/** Une image repérée : `make` ne la dessine que si elle n'a pas déjà été gardée. */
function keep(s: GameState, game: AlbumGame, id: string, caption: string, make: () => string | null) {
  const party = s.room?.party ?? s.room?.code ?? 'salon';
  const key = `${party}:${game}:${id}`;
  if (seen.has(key)) return;
  seen.add(key);
  let image: string | null = null;
  try {
    image = make();
  } catch {
    return;
  }
  if (!image) return;
  void add({ key, party, game, caption: caption.slice(0, 80), people: people(s), image });
}

let prev: GameState | null = null;
let cerveauSeen = 0;

function watch() {
  const s = store.get();
  const p = prev;
  prev = s;
  const room = s.room;
  if (!room || !p) return;

  // Dessin : le dessin du tour, à la révélation du mot.
  if (s.turnEnd && s.turnEnd !== p.turnEnd && room.game === 'dessin' && room.turnKind === 'draw') {
    const packets = board.packets();
    if (packets.length) keep(s, 'dessin', `${room.round}:${room.drawerId}:${s.turnEnd.word}`, s.turnEnd.word, () => encode(sheet(packets)));
  }
  // Mime : les polaroids des trouvailles.
  if (s.mimeShots !== p.mimeShots) for (const shot of s.mimeShots) if (shot.image) keep(s, 'mime', String(shot.id), shot.word, () => shot.image);
  // Photomaton : tous les polaroids de la manche, légendés par la consigne.
  if (s.photos && s.photos !== p.photos && room.photo) {
    const prompt = room.photo.prompt;
    for (const shot of s.photos.shots) if (shot.image) keep(s, 'photomaton', `${s.photos.round}:${shot.by}`, prompt, () => shot.image);
  }
  // Flash : les croquis de la manche.
  if (s.sketches && s.sketches !== p.sketches) {
    const model = room.flash?.image != null ? FLASH_IMAGES[room.flash.image]?.name : undefined;
    for (const sk of s.sketches.sketches)
      if (sk.strokes.length) keep(s, 'flash', `${s.sketches.round}:${sk.by}`, model ? `${model}, par ${sk.name}` : `croquis de ${sk.name}`, () => encode(sheet(sk.strokes)));
  }
  // Téléphone dessiné : chaque dessin de l'album, légendé par la phrase qu'il illustrait.
  if (s.album && s.album !== p.album) {
    for (const chain of s.album)
      chain.entries.forEach((e, i) => {
        if (e.kind !== 'drawing' || !e.strokes.length) return;
        const before = chain.entries[i - 1];
        keep(s, 'telephone', `${chain.owner}:${i}`, before?.kind === 'text' ? before.text : `dessin de ${e.name}`, () => encode(sheet(e.strokes)));
      });
  }
  // Cadavre exquis : les créatures, une fois toutes dévoilées (leur nom est alors choisi).
  const cad = room.cadavre;
  if (s.creatures && cad && cad.reveal !== null && cad.reveal >= s.creatures.length) {
    s.creatures.forEach((c, i) => keep(s, 'cadavre', c.owner, cad.titles[i] ?? 'créature sans nom', () => creature(c.pieces)));
  }
  // Cerveau coupé : les pages de l'album de fin.
  const pages = cerveauPages.all();
  if (room.game === 'cerveau' && pages.length !== cerveauSeen) {
    cerveauSeen = pages.length;
    for (const pg of pages) keep(s, 'cerveau', String(pg.turn), pg.model.name, () => pg.image);
  }
}

// ---- Envoi, ou attente pour un invité ---------------------------------------------------

async function add(up: MediaUpload) {
  if (account.get().user) {
    queue.push(up);
    void pump();
  } else {
    await savePending(up);
  }
}

async function pump() {
  if (sending) return;
  sending = true;
  try {
    while (queue.length) {
      const up = queue[0]!;
      try {
        await api('/api/album', { body: up });
        queue.shift();
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        // Réseau coupé ou serveur occupé : on réessaie un peu plus tard. Refus franc : on abandonne celle-ci.
        if (status === 0 || status === 429 || status >= 500) {
          setTimeout(() => void pump(), 15_000);
          break;
        }
        queue.shift();
      }
    }
  } finally {
    sending = false;
  }
}

// ---- Souvenirs en attente (IndexedDB, 24 h) -----------------------------------------------

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('julaika-souvenirs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('images', { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function all(db: IDBDatabase): Promise<Pending[]> {
  return new Promise((resolve) => {
    const req = db.transaction('images').objectStore('images').getAll();
    req.onsuccess = () => resolve(req.result as Pending[]);
    req.onerror = () => resolve([]);
  });
}

async function savePending(up: MediaUpload) {
  const db = await idb();
  if (!db) return;
  const list = await all(db);
  const limit = Date.now() - PENDING_HOURS * 3_600_000;
  const tx = db.transaction('images', 'readwrite');
  const os = tx.objectStore('images');
  // Les plus vieux partent d'abord : la place reste aux dernières parties.
  const fresh = list.filter((p) => p.at >= limit).sort((a, b) => a.at - b.at);
  for (const p of list) if (p.at < limit) os.delete(p.key);
  for (const p of fresh.slice(0, Math.max(0, fresh.length - PENDING_MAX + 1))) os.delete(p.key);
  os.put({ ...up, at: Date.now() });
  tx.oncomplete = () => void countPending();
}

export async function countPending() {
  const db = await idb();
  if (!db) return setPending(0);
  const limit = Date.now() - PENDING_HOURS * 3_600_000;
  setPending((await all(db)).filter((p) => p.at >= limit).length);
}

/** Après une connexion : les souvenirs gardés comme invité partent dans l'album. */
export async function flushPending() {
  const db = await idb();
  if (!db) return;
  const limit = Date.now() - PENDING_HOURS * 3_600_000;
  const list = await all(db);
  for (const p of list) {
    if (p.at >= limit) {
      const { at: _, ...up } = p;
      queue.push(up);
    }
  }
  const tx = db.transaction('images', 'readwrite');
  tx.objectStore('images').clear();
  tx.oncomplete = () => setPending(0);
  void pump();
}

let started = false;
/** Branche le repérage sur l'état du salon (une fois, au démarrage). */
export function startKeeper() {
  if (started) return;
  started = true;
  prev = store.get();
  store.subscribe(watch);
  void countPending();
}
