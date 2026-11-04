import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { MEDIA_MAX_CHARS } from '@julaika/shared';
import type { Accounts, AuthError } from './accounts';
import { SESSION_DAYS } from './accounts';
import type { Album } from './album';
import { allowedOrigin, bucket, clientIp, keyedBuckets } from './guard';
import { resetCodeMail, welcomeMail, type Mailer } from './mail';
import { writeZip } from './zip';

/**
 * API des comptes : inscription, connexion (e-mail ou Google), code de récupération, réglages,
 * album et historique. Tout passe par un cookie de session HttpOnly ; les requêtes qui changent
 * quelque chose exigent du JSON venu des pages du jeu.
 */
export const SESSION_COOKIE = 'jk_s';
const GOOGLE_COOKIE = 'jk_g';

const MESSAGES: Record<AuthError | 'trop' | 'requete' | 'plein' | 'connexion' | 'introuvable', string> = {
  email: 'Cette adresse e-mail ne semble pas valide.',
  password: 'Le mot de passe doit faire au moins 8 caractères.',
  name: 'Choisis un pseudo (20 caractères au plus).',
  taken: 'Un compte existe déjà avec cet e-mail. Connecte-toi, ou récupère ton mot de passe.',
  wrong: 'E-mail ou mot de passe incorrect.',
  code: 'Ce code ne correspond pas.',
  expired: 'Ce code a expiré : demande-en un nouveau.',
  tries: 'Trop d’essais : demande un nouveau code.',
  token: 'Ce lien a expiré : recommence la récupération.',
  trop: 'Trop de tentatives, réessaie dans une minute.',
  requete: 'Requête invalide.',
  plein: 'Ton album est plein (5 000 images).',
  connexion: 'Connecte-toi d’abord.',
  introuvable: 'Introuvable.',
};

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export interface GoogleConfig {
  clientId: string;
  secret: string;
}

export function accountApi(deps: {
  accounts: Accounts;
  album: Album;
  mail: Mailer;
  google: GoogleConfig | null;
  /** Adresse publique du site (https://julaika.2nbdigital.com) ; sinon déduite de la requête. */
  site?: string;
  fetch?: typeof fetch;
}) {
  const { accounts, album, mail, google } = deps;
  const doFetch = deps.fetch ?? fetch;
  const authBuckets = keyedBuckets(10, 1 / 6); // 10 essais d'un coup par IP, puis un toutes les 6 s
  const codeBuckets = keyedBuckets(3, 1 / 120); // 3 codes par e-mail, puis un toutes les 2 min
  const uploadBuckets = new Map<string, () => boolean>();

  const siteOf = (req: IncomingMessage) => {
    if (deps.site) return deps.site.replace(/\/$/, '');
    const host = /^[a-z0-9.:-]+$/i.test(req.headers.host ?? '') ? req.headers.host : 'localhost';
    const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    return `${proto}://${host}`;
  };
  const secure = (req: IncomingMessage) => req.headers['x-forwarded-proto'] === 'https' || siteOf(req).startsWith('https:');

  const setCookie = (req: IncomingMessage, res: ServerResponse, name: string, value: string, maxAge: number) => {
    const prev = res.getHeader('set-cookie');
    const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
    const flags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;
    res.setHeader('set-cookie', [...list, `${name}=${encodeURIComponent(value)}; ${flags}`]);
  };

  const json = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const fail = (res: ServerResponse, status: number, error: keyof typeof MESSAGES) => json(res, status, { error, message: MESSAGES[error] });

  /** Le compte derrière la requête (cookie de session). */
  const userOf = (req: IncomingMessage) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    return { token, user: accounts.session(token) };
  };

  const login = (req: IncomingMessage, res: ServerResponse, userId: string) => {
    const token = accounts.openSession(userId, String(req.headers['user-agent'] ?? ''));
    setCookie(req, res, SESSION_COOKIE, token, SESSION_DAYS * 86_400);
    return token;
  };

  async function body(req: IncomingMessage, limit = 4096): Promise<Record<string, unknown> | null> {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return null;
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > limit) {
            reject(new Error('trop gros'));
            req.destroy();
          } else chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
      });
      const v = JSON.parse(raw);
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const path = url.pathname;
    if (!path.startsWith('/api/auth') && !path.startsWith('/api/compte') && !path.startsWith('/api/album') && !path.startsWith('/api/historique')) return false;
    const method = req.method ?? 'GET';
    // Toute écriture vient d'une page du jeu (le JSON exigé plus bas bloque déjà les formulaires d'autres sites).
    if (method !== 'GET' && !allowedOrigin(req.headers.origin, req.headers.host)) return fail(res, 403, 'requete'), true;
    const ip = clientIp(req);

    // ---- Connexion avec Google ----
    if (path === '/api/auth/google' && method === 'GET') {
      if (!google) return res.writeHead(302, { location: '/connexion' }).end(), true;
      const state = randomBytes(16).toString('base64url');
      const next = safeNext(url.searchParams.get('suite'));
      setCookie(req, res, GOOGLE_COOKIE, `${state}|${next}`, 600);
      const q = new URLSearchParams({
        client_id: google.clientId,
        redirect_uri: `${siteOf(req)}/api/auth/google/retour`,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      });
      res.writeHead(302, { location: `https://accounts.google.com/o/oauth2/v2/auth?${q}` }).end();
      return true;
    }
    if (path === '/api/auth/google/retour' && method === 'GET') {
      const [state, next] = (parseCookies(req.headers.cookie)[GOOGLE_COOKIE] ?? '').split('|');
      setCookie(req, res, GOOGLE_COOKIE, '', 0);
      const back = (to: string) => res.writeHead(302, { location: to }).end();
      if (!google || !state || state !== url.searchParams.get('state') || !url.searchParams.get('code')) return back('/connexion?erreur=google'), true;
      try {
        const profile = await googleProfile(doFetch, google, url.searchParams.get('code')!, `${siteOf(req)}/api/auth/google/retour`);
        const user = accounts.google(profile);
        login(req, res, user.id);
        back(safeNext(next));
      } catch (e) {
        console.warn('[google]', (e as Error).message);
        back('/connexion?erreur=google');
      }
      return true;
    }

    // ---- Compte ----
    if (path === '/api/auth/moi' && method === 'GET') {
      const { user } = userOf(req);
      json(res, 200, { user: user ? accounts.publicUser(user) : null, google: !!google, stats: user ? album.stats(user.id) : null });
      return true;
    }
    if (path === '/api/auth/inscription' && method === 'POST') {
      if (!authBuckets.take(ip)) return fail(res, 429, 'trop'), true;
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = await accounts.signup(b);
      if (typeof out === 'string') return fail(res, out === 'taken' ? 409 : 422, out), true;
      login(req, res, out.id);
      mail(welcomeMail(out.email, out.name, siteOf(req))).catch((e) => console.warn('[e-mail] bienvenue :', (e as Error).message));
      json(res, 201, { user: accounts.publicUser(out) });
      return true;
    }
    if (path === '/api/auth/connexion' && method === 'POST') {
      if (!authBuckets.take(ip)) return fail(res, 429, 'trop'), true;
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = await accounts.login(b);
      if (typeof out === 'string') return fail(res, 401, out), true;
      login(req, res, out.id);
      json(res, 200, { user: accounts.publicUser(out) });
      return true;
    }
    if (path === '/api/auth/deconnexion' && method === 'POST') {
      accounts.closeSession(userOf(req).token);
      setCookie(req, res, SESSION_COOKIE, '', 0);
      json(res, 200, { ok: true });
      return true;
    }

    // ---- Mot de passe oublié : code à 6 chiffres ----
    if (path === '/api/auth/code' && method === 'POST') {
      if (!authBuckets.take(ip)) return fail(res, 429, 'trop'), true;
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const key = String(b.email ?? '').trim().toLowerCase();
      if (!codeBuckets.take(key)) return fail(res, 429, 'trop'), true;
      const out = accounts.startReset(b.email);
      // Même réponse qu'un compte existe ou non : on ne révèle pas qui est inscrit.
      if (out) mail(resetCodeMail(out.email, out.name, out.code, siteOf(req))).catch((e) => console.warn('[e-mail] code :', (e as Error).message));
      json(res, 200, { ok: true });
      return true;
    }
    if (path === '/api/auth/code/verifier' && method === 'POST') {
      if (!authBuckets.take(ip)) return fail(res, 429, 'trop'), true;
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = accounts.checkCode(b.email, b.code);
      if (typeof out === 'string') return fail(res, 422, out), true;
      json(res, 200, out);
      return true;
    }
    if (path === '/api/auth/code/nouveau' && method === 'POST') {
      if (!authBuckets.take(ip)) return fail(res, 429, 'trop'), true;
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = await accounts.finishReset(b.token, b.password);
      if (typeof out === 'string') return fail(res, 422, out), true;
      login(req, res, out.id);
      json(res, 200, { user: accounts.publicUser(out) });
      return true;
    }

    // ---- À partir d'ici, il faut être connecté ----
    const { user, token } = userOf(req);
    if (!user) return fail(res, 401, 'connexion'), true;

    if (path === '/api/compte' && method === 'PATCH') {
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = accounts.update(user.id, b);
      if (typeof out === 'string') return fail(res, 422, out), true;
      json(res, 200, { user: accounts.publicUser(out) });
      return true;
    }
    if (path === '/api/compte/mot-de-passe' && method === 'POST') {
      if (!authBuckets.take(ip)) return fail(res, 429, 'trop'), true;
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = await accounts.changePassword(user.id, b.current, b.password, token);
      if (out !== true) return fail(res, out === 'wrong' ? 401 : 422, out === 'wrong' ? 'wrong' : out), true;
      json(res, 200, { ok: true });
      return true;
    }
    if (path === '/api/compte/appareils' && method === 'GET') {
      json(res, 200, { count: accounts.sessionCount(user.id) });
      return true;
    }
    if (path === '/api/compte/deconnecter-partout' && method === 'POST') {
      accounts.closeOtherSessions(user.id, token);
      json(res, 200, { ok: true });
      return true;
    }
    if (path === '/api/compte/supprimer' && method === 'POST') {
      if (!authBuckets.take(ip)) return fail(res, 429, 'trop'), true;
      const b = await body(req);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = await accounts.remove(user.id, b.password);
      if (out !== true) return fail(res, 401, 'wrong'), true;
      await album.removeUser(user.id);
      setCookie(req, res, SESSION_COOKIE, '', 0);
      json(res, 200, { ok: true });
      return true;
    }

    // ---- Album ----
    if (path === '/api/album' && method === 'GET') {
      const before = Number(url.searchParams.get('avant')) || undefined;
      json(res, 200, {
        items: album.list(user.id, { game: url.searchParams.get('jeu') ?? undefined, before, limit: Number(url.searchParams.get('n')) || 60 }),
        counts: album.counts(user.id),
      });
      return true;
    }
    if (path === '/api/album' && method === 'POST') {
      let take = uploadBuckets.get(user.id);
      if (!take) uploadBuckets.set(user.id, (take = bucket(80, 1)));
      if (uploadBuckets.size > 5000) uploadBuckets.clear();
      if (!take()) return fail(res, 429, 'trop'), true;
      const b = await body(req, MEDIA_MAX_CHARS + 4096);
      if (!b) return fail(res, 400, 'requete'), true;
      const out = await album.save(user.id, b);
      if (typeof out === 'string') return fail(res, out === 'plein' ? 507 : 400, out), true;
      json(res, out.fresh ? 201 : 200, out);
      return true;
    }
    if (path === '/api/album/zip' && method === 'GET') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter((s) => /^[\w-]{6,20}$/.test(s));
      const d = new Date();
      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="julaika-album-${d.toISOString().slice(0, 10)}.zip"`,
        'cache-control': 'no-store',
      });
      try {
        await writeZip(album.zipEntries(user.id, ids.length ? ids : undefined), (chunk) =>
          res.write(chunk) ? undefined : new Promise<void>((ok) => res.once('drain', () => ok())),
        );
      } catch (e) {
        console.warn('[album] zip :', (e as Error).message);
      }
      res.end();
      return true;
    }
    const one = /^\/api\/album\/([\w-]{6,20})$/.exec(path);
    if (one && method === 'GET') {
      const f = await album.file(user.id, one[1]!);
      if (!f) return fail(res, 404, 'introuvable'), true;
      const dl = url.searchParams.has('telecharger');
      res.writeHead(200, {
        'content-type': f.type,
        'content-length': f.data.length,
        // Image privée : gardée par le navigateur du propriétaire, jamais par un cache partagé.
        'cache-control': 'private, max-age=31536000, immutable',
        ...(dl ? { 'content-disposition': `attachment; filename="${f.name}"` } : {}),
      });
      res.end(f.data);
      return true;
    }
    if (one && method === 'DELETE') {
      json(res, (await album.remove(user.id, one[1]!)) ? 200 : 404, { ok: true });
      return true;
    }

    // ---- Historique ----
    if (path === '/api/historique' && method === 'GET') {
      json(res, 200, { parties: album.history(user.id, { before: Number(url.searchParams.get('avant')) || undefined }), stats: album.stats(user.id) });
      return true;
    }
    fail(res, 404, 'introuvable');
    return true;
  }

  return { handle, userOf, prune: () => (authBuckets.prune(), codeBuckets.prune()) };
}

/** Une page du site seulement (pas de redirection vers un autre site après la connexion). */
function safeNext(v: string | null | undefined): string {
  return v && /^\/(?!\/)[\w\-/]*$/.test(v) ? v : '/album';
}

/** Échange le code de Google contre l'identité du joueur (id_token reçu directement de Google, en TLS). */
async function googleProfile(doFetch: typeof fetch, g: GoogleConfig, code: string, redirect: string) {
  const r = await doFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  if (!r.ok) throw new Error(`jeton refusé (${r.status})`);
  const { id_token } = (await r.json()) as { id_token?: string };
  const payload = JSON.parse(Buffer.from(String(id_token ?? '').split('.')[1] ?? '', 'base64url').toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    exp?: number;
  };
  if (payload.aud !== g.clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss ?? '')) throw new Error('jeton pour une autre appli');
  if (!payload.sub || !payload.email || payload.email_verified !== true) throw new Error('e-mail Google non vérifié');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('jeton expiré');
  return { sub: payload.sub, email: payload.email, name: payload.name ?? '' };
}
