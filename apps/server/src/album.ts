import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ALBUM_GAME_NAMES,
  MEDIA_MAX_CHARS,
  MEDIA_URL,
  isAlbumGame,
  type HistoryParty,
  type MediaItem,
  type MediaUpload,
  type PartyPlayer,
} from '@julaika/shared';
import type { Db } from './db';
import { tx } from './db';
import type { ZipEntry } from './zip';

/** Images par compte : de quoi garder des années de soirées, pas de quoi remplir le disque. */
export const MEDIA_PER_USER = 5000;
const EXT = { webp: 'webp', png: 'png', jpeg: 'jpg' } as const;
const MIME = { webp: 'image/webp', png: 'image/png', jpeg: 'image/jpeg' } as const;
type Kind = keyof typeof EXT;

interface MediaRow {
  id: string;
  user_id: string;
  key: string;
  party: string;
  game: string;
  caption: string;
  people: string;
  type: Kind;
  bytes: number;
  created: number;
}

/** Fin d'une partie, telle que le salon la raconte. */
export interface PartyRecord {
  id: string;
  game: string;
  mode: string;
  started: number;
  ended: number;
  players: { userId: string | null; name: string; avatar: number; score: number }[];
}

const clip = (v: unknown, n: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

/**
 * L'album et l'historique. Les images vivent en fichiers (un dossier par compte), la base ne
 * garde que leur fiche : c'est ce dossier que la sauvegarde de nuit copie vers o2switch.
 */
export class Album {
  constructor(
    private readonly db: Db,
    private readonly dir: string,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(dir, { recursive: true });
  }

  private path(userId: string, id: string, type: Kind) {
    return join(this.dir, userId, `${id}.${EXT[type]}`);
  }

  /** Range une image. Renvoie son id, celui de l'image déjà gardée sous la même clé, ou une erreur. */
  async save(userId: string, up: Partial<MediaUpload>): Promise<{ id: string; fresh: boolean } | 'requete' | 'plein'> {
    if (!isAlbumGame(up.game) || typeof up.image !== 'string' || up.image.length > MEDIA_MAX_CHARS) return 'requete';
    const m = MEDIA_URL.exec(up.image);
    const key = clip(up.key, 120);
    if (!m || !key) return 'requete';
    const existing = this.db.prepare('SELECT id FROM media WHERE user_id = ? AND key = ?').get(userId, key) as { id: string } | undefined;
    if (existing) return { id: existing.id, fresh: false };
    const { n } = this.db.prepare('SELECT COUNT(*) n FROM media WHERE user_id = ?').get(userId) as { n: number };
    if (n >= MEDIA_PER_USER) return 'plein';
    const type = m[1] as Kind;
    const data = Buffer.from(m[2]!, 'base64');
    if (!looksLike(type, data)) return 'requete';
    const id = randomBytes(9).toString('base64url');
    const people = Array.isArray(up.people) ? up.people.slice(0, 12).map((p) => clip(p, 20)).filter(Boolean) : [];
    mkdirSync(join(this.dir, userId), { recursive: true });
    await writeFile(this.path(userId, id, type), data);
    try {
      this.db
        .prepare('INSERT INTO media (id, user_id, key, party, game, caption, people, type, bytes, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, userId, key, clip(up.party, 40), up.game, clip(up.caption, 80), people.join('\n'), type, data.length, this.now());
    } catch {
      await rm(this.path(userId, id, type), { force: true }); // même clé envoyée deux fois en même temps
      const again = this.db.prepare('SELECT id FROM media WHERE user_id = ? AND key = ?').get(userId, key) as { id: string } | undefined;
      return again ? { id: again.id, fresh: false } : 'requete';
    }
    return { id, fresh: true };
  }

  private item(r: MediaRow): MediaItem {
    return { id: r.id, game: r.game as MediaItem['game'], caption: r.caption, people: r.people ? r.people.split('\n') : [], party: r.party, created: r.created };
  }

  list(userId: string, opts: { game?: string; before?: number; limit?: number } = {}): MediaItem[] {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 60));
    const rows = (
      opts.game && isAlbumGame(opts.game)
        ? this.db.prepare('SELECT * FROM media WHERE user_id = ? AND game = ? AND created < ? ORDER BY created DESC LIMIT ?').all(userId, opts.game, opts.before ?? 9e15, limit)
        : this.db.prepare('SELECT * FROM media WHERE user_id = ? AND created < ? ORDER BY created DESC LIMIT ?').all(userId, opts.before ?? 9e15, limit)
    ) as unknown as MediaRow[];
    return rows.map((r) => this.item(r));
  }

  /** Nombre d'images par jeu, pour les filtres. */
  counts(userId: string): Record<string, number> {
    const rows = this.db.prepare('SELECT game, COUNT(*) n FROM media WHERE user_id = ? GROUP BY game').all(userId) as { game: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.game, r.n]));
  }

  private row(userId: string, id: string): MediaRow | undefined {
    return this.db.prepare('SELECT * FROM media WHERE user_id = ? AND id = ?').get(userId, id) as MediaRow | undefined;
  }

  /** Le fichier d'une image, seulement pour son propriétaire. */
  async file(userId: string, id: string): Promise<{ data: Buffer; type: string; name: string } | null> {
    const r = this.row(userId, id);
    if (!r) return null;
    try {
      return { data: await readFile(this.path(userId, r.id, r.type)), type: MIME[r.type], name: fileName(r) };
    } catch {
      return null;
    }
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const r = this.row(userId, id);
    if (!r) return false;
    this.db.prepare('DELETE FROM media WHERE id = ?').run(id);
    await rm(this.path(userId, r.id, r.type), { force: true });
    return true;
  }

  /** Efface tout le dossier d'un compte supprimé. */
  async removeUser(userId: string) {
    if (!/^[\w-]+$/.test(userId)) return;
    await rm(join(this.dir, userId), { recursive: true, force: true });
  }

  /** Les images à mettre dans le .zip (toutes, ou la sélection), rangées par jeu. */
  async *zipEntries(userId: string, ids?: string[]): AsyncGenerator<ZipEntry> {
    const rows = (ids?.length
      ? ids.slice(0, MEDIA_PER_USER).map((id) => this.row(userId, id)).filter((r): r is MediaRow => !!r)
      : (this.db.prepare('SELECT * FROM media WHERE user_id = ? ORDER BY created').all(userId) as unknown as MediaRow[]));
    const used = new Set<string>();
    for (const r of rows) {
      let data: Buffer;
      try {
        data = await readFile(this.path(userId, r.id, r.type));
      } catch {
        continue;
      }
      const folder = ALBUM_GAME_NAMES[r.game as keyof typeof ALBUM_GAME_NAMES] ?? 'Autres';
      let name = `${folder}/${fileName(r)}`;
      for (let i = 2; used.has(name); i++) name = `${folder}/${fileName(r).replace(/(\.\w+)$/, `-${i}$1`)}`;
      used.add(name);
      yield { name, data, date: new Date(r.created) };
    }
  }

  // ---- Historique -----------------------------------------------------------------

  /** Note une partie terminée, pour chaque joueur connecté à un compte. */
  record(p: PartyRecord) {
    const withAccount = p.players.filter((x) => x.userId);
    if (!withAccount.length) return;
    const sorted = [...p.players].sort((a, b) => b.score - a.score);
    const rankOf = (score: number) => 1 + sorted.filter((x) => x.score > score).length;
    const players: PartyPlayer[] = sorted.map((x) => ({ name: x.name, avatar: x.avatar, score: x.score, rank: rankOf(x.score) }));
    const ids = JSON.stringify(sorted.map((x) => x.userId ?? ''));
    tx(this.db, () => {
      this.db
        .prepare('INSERT OR IGNORE INTO parties (id, game, mode, started, ended, players) VALUES (?, ?, ?, ?, ?, ?)')
        .run(p.id, p.game, p.mode, p.started, p.ended, JSON.stringify({ players, ids }));
      for (const x of withAccount) {
        // Le compte a pu être supprimé entre-temps : on l'ignore.
        if (!this.db.prepare('SELECT 1 FROM users WHERE id = ?').get(x.userId!)) continue;
        this.db.prepare('INSERT OR IGNORE INTO user_parties (user_id, party_id, rank, score) VALUES (?, ?, ?, ?)').run(x.userId!, p.id, rankOf(x.score), x.score);
      }
    });
  }

  history(userId: string, opts: { before?: number; limit?: number } = {}): HistoryParty[] {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 40));
    const rows = this.db
      .prepare(
        `SELECT p.id, p.game, p.mode, p.started, p.ended, p.players, up.rank, up.score
         FROM user_parties up JOIN parties p ON p.id = up.party_id
         WHERE up.user_id = ? AND p.ended < ? ORDER BY p.ended DESC LIMIT ?`,
      )
      .all(userId, opts.before ?? 9e15, limit) as { id: string; game: string; mode: string; started: number; ended: number; players: string; rank: number; score: number }[];
    const media = this.db.prepare('SELECT id FROM media WHERE user_id = ? AND party = ? ORDER BY created LIMIT 12');
    return rows.map((r) => {
      const { players, ids } = JSON.parse(r.players) as { players: PartyPlayer[]; ids: string };
      const owners = JSON.parse(ids) as string[];
      return {
        id: r.id,
        game: r.game,
        mode: r.mode,
        started: r.started,
        ended: r.ended,
        rank: r.rank,
        score: r.score,
        players: players.map((pl, i) => (owners[i] === userId ? { ...pl, me: true } : pl)),
        media: (media.all(userId, r.id) as { id: string }[]).map((m) => m.id),
      };
    });
  }

  stats(userId: string) {
    const { parties, wins } = this.db
      .prepare('SELECT COUNT(*) parties, SUM(CASE WHEN rank = 1 THEN 1 ELSE 0 END) wins FROM user_parties WHERE user_id = ?')
      .get(userId) as { parties: number; wins: number | null };
    const { images } = this.db.prepare('SELECT COUNT(*) images FROM media WHERE user_id = ?').get(userId) as { images: number };
    const { games } = this.db
      .prepare('SELECT COUNT(DISTINCT p.game) games FROM user_parties up JOIN parties p ON p.id = up.party_id WHERE up.user_id = ?')
      .get(userId) as { games: number };
    return { parties, wins: wins ?? 0, images, games };
  }
}

/** Nom de fichier lisible : julaika-dessin-chat-2026-11-01.webp */
function fileName(r: MediaRow): string {
  const d = new Date(r.created);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const slug = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
  return ['julaika', slug(r.game), slug(r.caption), day].filter(Boolean).join('-') + `.${EXT[r.type]}`;
}

/** Les premiers octets correspondent bien au format annoncé. */
function looksLike(type: Kind, b: Buffer): boolean {
  if (b.length < 16) return false;
  if (type === 'png') return b.readUInt32BE(0) === 0x89504e47;
  if (type === 'jpeg') return b[0] === 0xff && b[1] === 0xd8;
  return b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
}
