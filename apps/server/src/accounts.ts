import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { normalizeEmail, validPassword, type UserPublic } from '@julaika/shared';
import type { Db } from './db';
import { tx } from './db';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
/** scrypt (intégré à Node) : ~50 ms par essai, assez lent pour décourager qui volerait la base. */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** Une session dure 6 mois, prolongée à chaque visite. */
export const SESSION_DAYS = 180;
/** Code de récupération : valable 30 minutes, 5 essais. */
export const CODE_MINUTES = 30;
export const CODE_TRIES = 5;
/** Après un bon code, le jeton de remplacement laisse 15 minutes pour choisir le nouveau mot de passe. */
const RESET_MINUTES = 15;

const sha = (s: string) => createHash('sha256').update(s).digest('base64url');
const newId = () => randomBytes(12).toString('base64url');

interface UserRow {
  id: string;
  email: string;
  name: string;
  avatar: number;
  pass: string | null;
  google_sub: string | null;
  created: number;
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt, 32, SCRYPT);
  return `s1$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function checkPassword(pw: string, stored: string | null): Promise<boolean> {
  const [v, salt, hash] = (stored ?? '').split('$');
  if (v !== 's1' || !salt || !hash) {
    // Même durée qu'un vrai essai : on ne devine pas qu'un compte n'a pas de mot de passe.
    await scrypt(pw, Buffer.alloc(16), 32, SCRYPT);
    return false;
  }
  const want = Buffer.from(hash, 'base64url');
  const got = await scrypt(pw, Buffer.from(salt, 'base64url'), want.length, SCRYPT);
  return timingSafeEqual(want, got);
}

/** Pseudo propre : 20 caractères visibles au plus. */
export function cleanName(v: unknown): string | null {
  const s = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .trim()
    .slice(0, 20);
  return /[\p{L}\p{N}]/u.test(s) ? s : null;
}

export type AuthError = 'email' | 'password' | 'name' | 'taken' | 'wrong' | 'code' | 'expired' | 'tries' | 'token';

export class Accounts {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  publicUser(u: UserRow): UserPublic {
    return { id: u.id, email: u.email, name: u.name, avatar: u.avatar, hasPassword: !!u.pass, google: !!u.google_sub, created: u.created };
  }

  byId(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  byEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  async signup(input: { email?: unknown; password?: unknown; name?: unknown; avatar?: unknown }): Promise<UserRow | AuthError> {
    const email = normalizeEmail(input.email);
    if (!email) return 'email';
    if (!validPassword(input.password)) return 'password';
    const name = cleanName(input.name);
    if (!name) return 'name';
    if (this.byEmail(email)) return 'taken';
    const pass = await hashPassword(input.password);
    const user: UserRow = { id: newId(), email, name, avatar: avatarOf(input.avatar), pass, google_sub: null, created: this.now() };
    try {
      this.db.prepare('INSERT INTO users (id, email, name, avatar, pass, created) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, email, name, user.avatar, pass, user.created);
    } catch {
      return 'taken'; // deux inscriptions simultanées
    }
    return user;
  }

  async login(input: { email?: unknown; password?: unknown }): Promise<UserRow | AuthError> {
    const email = normalizeEmail(input.email);
    const user = email ? this.byEmail(email) : undefined;
    const ok = await checkPassword(typeof input.password === 'string' ? input.password.slice(0, 200) : '', user?.pass ?? null);
    return ok && user ? user : 'wrong';
  }

  /** Connexion Google : le compte lié, sinon le compte du même e-mail (lié au passage), sinon un nouveau. */
  google(profile: { sub: string; email: string; name: string }): UserRow {
    const linked = this.db.prepare('SELECT * FROM users WHERE google_sub = ?').get(profile.sub) as UserRow | undefined;
    if (linked) return linked;
    const email = normalizeEmail(profile.email);
    if (!email) throw new Error('e-mail Google invalide');
    const same = this.byEmail(email);
    if (same) {
      this.db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(profile.sub, same.id);
      return { ...same, google_sub: profile.sub };
    }
    const user: UserRow = {
      id: newId(),
      email,
      name: cleanName(profile.name) ?? email.split('@')[0]!.slice(0, 20),
      avatar: randomInt(16),
      pass: null,
      google_sub: profile.sub,
      created: this.now(),
    };
    this.db.prepare('INSERT INTO users (id, email, name, avatar, google_sub, created) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, email, user.name, user.avatar, profile.sub, user.created);
    return user;
  }

  // ---- Sessions --------------------------------------------------------------

  /** Ouvre une session ; le jeton (à mettre en cookie) n'est jamais stocké tel quel. */
  openSession(userId: string, agent = ''): string {
    const token = randomBytes(32).toString('base64url');
    const t = this.now();
    this.db.prepare('INSERT INTO sessions (hash, user_id, created, seen, agent) VALUES (?, ?, ?, ?, ?)').run(sha(token), userId, t, t, agent.slice(0, 160));
    return token;
  }

  /** Le compte d'un jeton de session encore valable (et la session prolongée). */
  session(token: string | undefined): UserRow | null {
    if (!token || token.length > 100) return null;
    const hash = sha(token);
    const row = this.db.prepare('SELECT user_id, seen FROM sessions WHERE hash = ?').get(hash) as { user_id: string; seen: number } | undefined;
    if (!row) return null;
    const t = this.now();
    if (t - row.seen > SESSION_DAYS * 86_400_000) {
      this.db.prepare('DELETE FROM sessions WHERE hash = ?').run(hash);
      return null;
    }
    // Une écriture par heure au plus, pas à chaque requête.
    if (t - row.seen > 3_600_000) this.db.prepare('UPDATE sessions SET seen = ? WHERE hash = ?').run(t, hash);
    return this.byId(row.user_id) ?? null;
  }

  closeSession(token: string | undefined) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE hash = ?').run(sha(token));
  }

  /** Déconnecte tous les appareils, sauf la session `keep`. */
  closeOtherSessions(userId: string, keep?: string) {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ? AND hash != ?').run(userId, keep ? sha(keep) : '');
  }

  sessionCount(userId: string): number {
    return (this.db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?').get(userId) as { n: number }).n;
  }

  // ---- Mot de passe oublié : code à 6 chiffres --------------------------------

  /** Prépare un code pour `email`. Renvoie null si aucun compte : on n'envoie rien, mais on répond pareil. */
  startReset(rawEmail: unknown): { email: string; code: string; name: string } | null {
    const email = normalizeEmail(rawEmail);
    const user = email ? this.byEmail(email) : undefined;
    if (!email || !user) return null;
    const code = String(randomInt(1_000_000)).padStart(6, '0');
    this.db
      .prepare('INSERT INTO codes (email, hash, expires, tries, reset) VALUES (?, ?, ?, 0, NULL) ON CONFLICT(email) DO UPDATE SET hash = excluded.hash, expires = excluded.expires, tries = 0, reset = NULL')
      .run(email, sha(`${email}:${code}`), this.now() + CODE_MINUTES * 60_000);
    return { email, code, name: user.name };
  }

  /** Vérifie le code ; s'il est bon, renvoie un jeton qui autorise à choisir un nouveau mot de passe. */
  checkCode(rawEmail: unknown, rawCode: unknown): { token: string } | AuthError {
    const email = normalizeEmail(rawEmail);
    const code = String(rawCode ?? '').replace(/\D/g, '');
    if (!email || code.length !== 6) return 'code';
    const row = this.db.prepare('SELECT * FROM codes WHERE email = ?').get(email) as { hash: string; expires: number; tries: number } | undefined;
    if (!row) return 'code';
    if (row.expires < this.now()) return 'expired';
    if (row.tries >= CODE_TRIES) return 'tries';
    const want = Buffer.from(row.hash);
    const got = Buffer.from(sha(`${email}:${code}`));
    if (want.length !== got.length || !timingSafeEqual(want, got)) {
      this.db.prepare('UPDATE codes SET tries = tries + 1 WHERE email = ?').run(email);
      return row.tries + 1 >= CODE_TRIES ? 'tries' : 'code';
    }
    const token = randomBytes(24).toString('base64url');
    // Le code ne resservira pas : seul le jeton compte maintenant.
    this.db.prepare('UPDATE codes SET hash = ?, tries = ?, reset = ?, expires = ? WHERE email = ?').run('used', CODE_TRIES, sha(token), this.now() + RESET_MINUTES * 60_000, email);
    return { token: `${Buffer.from(email).toString('base64url')}.${token}` };
  }

  /** Nouveau mot de passe avec le jeton de `checkCode` : toutes les autres sessions sont fermées. */
  async finishReset(rawToken: unknown, password: unknown): Promise<UserRow | AuthError> {
    if (!validPassword(password)) return 'password';
    const [mail, token] = String(rawToken ?? '').split('.');
    if (!mail || !token) return 'token';
    const email = Buffer.from(mail, 'base64url').toString('utf8');
    const row = this.db.prepare('SELECT reset, expires FROM codes WHERE email = ?').get(email) as { reset: string | null; expires: number } | undefined;
    if (!row?.reset || row.expires < this.now() || row.reset !== sha(token)) return 'token';
    const user = this.byEmail(email);
    if (!user) return 'token';
    const pass = await hashPassword(password);
    tx(this.db, () => {
      this.db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(pass, user.id);
      this.db.prepare('DELETE FROM codes WHERE email = ?').run(email);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    });
    return { ...user, pass };
  }

  // ---- Réglages ----------------------------------------------------------------

  update(userId: string, input: { name?: unknown; avatar?: unknown }): UserRow | AuthError {
    const user = this.byId(userId);
    if (!user) return 'wrong';
    const name = input.name === undefined ? user.name : cleanName(input.name);
    if (!name) return 'name';
    const avatar = input.avatar === undefined ? user.avatar : avatarOf(input.avatar);
    this.db.prepare('UPDATE users SET name = ?, avatar = ? WHERE id = ?').run(name, avatar, userId);
    return { ...user, name, avatar };
  }

  async changePassword(userId: string, current: unknown, next: unknown, keepSession?: string): Promise<true | AuthError> {
    const user = this.byId(userId);
    if (!user) return 'wrong';
    // Un compte Google sans mot de passe peut en créer un sans « actuel ».
    if (user.pass && !(await checkPassword(String(current ?? '').slice(0, 200), user.pass))) return 'wrong';
    if (!validPassword(next)) return 'password';
    this.db.prepare('UPDATE users SET pass = ? WHERE id = ?').run(await hashPassword(next), userId);
    this.closeOtherSessions(userId, keepSession);
    return true;
  }

  /** Supprime le compte et tout ce qui lui appartient (sessions, historique, images en base). */
  async remove(userId: string, password: unknown): Promise<true | AuthError> {
    const user = this.byId(userId);
    if (!user) return 'wrong';
    if (user.pass && !(await checkPassword(String(password ?? '').slice(0, 200), user.pass))) return 'wrong';
    this.db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return true;
  }

  /** Ménage : sessions et codes périmés. */
  prune() {
    const t = this.now();
    this.db.prepare('DELETE FROM sessions WHERE seen < ?').run(t - SESSION_DAYS * 86_400_000);
    this.db.prepare('DELETE FROM codes WHERE expires < ?').run(t);
  }
}

function avatarOf(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.abs(n) % 64 : 0;
}
