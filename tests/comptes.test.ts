import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { passwordScore } from '@julaika/shared';
import { accountApi, parseCookies } from '../apps/server/src/accountApi';
import { Accounts, CODE_TRIES, checkPassword, cleanName, hashPassword } from '../apps/server/src/accounts';
import { Album } from '../apps/server/src/album';
import { openDb } from '../apps/server/src/db';
import { buildMessage, resetCodeMail, type Mail } from '../apps/server/src/mail';
import { crc32, writeZip } from '../apps/server/src/zip';

// Une image WebP minuscule mais au bon format (en-tête RIFF....WEBP).
const WEBP = `data:image/webp;base64,${Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(24, 7)]).toString('base64')}`;

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'jk-'));
  const db = openDb(join(dir, 'test.db'));
  let t = Date.parse('2026-11-02T12:00:00Z');
  const now = () => t;
  return { db, dir, accounts: new Accounts(db, now), album: new Album(db, join(dir, 'album'), now), tick: (ms: number) => (t += ms) };
}

describe('mots de passe', () => {
  it('hache et vérifie, sans garder le mot de passe', async () => {
    const h = await hashPassword('Sourire2026!');
    expect(h).not.toContain('Sourire');
    expect(await checkPassword('Sourire2026!', h)).toBe(true);
    expect(await checkPassword('sourire2026!', h)).toBe(false);
    expect(await checkPassword('x', null)).toBe(false);
  });
  it('compte les règles de force', () => {
    expect(passwordScore('')).toBe(0);
    expect(passwordScore('Sourire2026!')).toBe(4);
    expect(passwordScore('abcdefgh')).toBe(1);
  });
  it('nettoie les pseudos', () => {
    expect(cleanName('  Julaïka  ')).toBe('Julaïka');
    expect(cleanName('​​')).toBeNull();
    expect(cleanName('a'.repeat(40))).toHaveLength(20);
  });
});

describe('comptes', () => {
  it('inscription, connexion, session, refus des doublons', async () => {
    const { accounts } = setup();
    const u = await accounts.signup({ email: ' Julaika@Gmail.com ', password: 'sourire2026', name: 'Julaïka', avatar: 3 });
    expect(typeof u).toBe('object');
    if (typeof u === 'string') return;
    expect(u.email).toBe('julaika@gmail.com');
    expect(await accounts.signup({ email: 'julaika@gmail.com', password: 'autrechose', name: 'X' })).toBe('taken');
    expect(await accounts.signup({ email: 'pas-un-mail', password: 'sourire2026', name: 'X' })).toBe('email');
    expect(await accounts.signup({ email: 'a@b.fr', password: 'court', name: 'X' })).toBe('password');
    expect(await accounts.login({ email: 'julaika@gmail.com', password: 'mauvais!' })).toBe('wrong');
    const again = await accounts.login({ email: 'JULAIKA@gmail.com', password: 'sourire2026' });
    expect(typeof again === 'object' && again.id).toBe(u.id);
    const token = accounts.openSession(u.id);
    expect(accounts.session(token)?.id).toBe(u.id);
    expect(accounts.session('faux')).toBeNull();
    accounts.closeSession(token);
    expect(accounts.session(token)).toBeNull();
  });

  it('mot de passe oublié : code à 6 chiffres, 5 essais, puis nouveau mot de passe', async () => {
    const { accounts, tick } = setup();
    const u = await accounts.signup({ email: 'j@x.fr', password: 'ancienmdp', name: 'J' });
    if (typeof u === 'string') throw new Error(u);
    const other = accounts.openSession(u.id);
    expect(accounts.startReset('inconnu@x.fr')).toBeNull();
    const start = accounts.startReset('j@x.fr')!;
    expect(start.code).toMatch(/^\d{6}$/);
    const wrong = start.code === '000000' ? '111111' : '000000';
    expect(accounts.checkCode('j@x.fr', wrong)).toBe('code');
    const ok = accounts.checkCode('j@x.fr', start.code);
    if (typeof ok === 'string') throw new Error(ok);
    // Le code ne sert qu'une fois.
    expect(accounts.checkCode('j@x.fr', start.code)).toBe('tries');
    expect(await accounts.finishReset(ok.token, 'court')).toBe('password');
    const done = await accounts.finishReset(ok.token, 'NouveauMdp1!');
    expect(typeof done).toBe('object');
    expect(accounts.session(other)).toBeNull(); // autres appareils déconnectés
    expect(typeof (await accounts.login({ email: 'j@x.fr', password: 'NouveauMdp1!' }))).toBe('object');
    expect(await accounts.finishReset(ok.token, 'EncoreUn1!')).toBe('token');

    // Trop d'essais, puis code expiré.
    const s2 = accounts.startReset('j@x.fr')!;
    const bad = s2.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < CODE_TRIES - 1; i++) expect(accounts.checkCode('j@x.fr', bad)).toBe('code');
    expect(accounts.checkCode('j@x.fr', bad)).toBe('tries');
    expect(accounts.checkCode('j@x.fr', s2.code)).toBe('tries');
    const s3 = accounts.startReset('j@x.fr')!;
    tick(31 * 60_000);
    expect(accounts.checkCode('j@x.fr', s3.code)).toBe('expired');
  });

  it('Google : lie le compte du même e-mail, ou en crée un', async () => {
    const { accounts } = setup();
    const u = await accounts.signup({ email: 'j@x.fr', password: 'motdepasse', name: 'J' });
    if (typeof u === 'string') throw new Error(u);
    expect(accounts.google({ sub: 'g1', email: 'J@x.fr', name: 'Julaïka G' }).id).toBe(u.id);
    expect(accounts.google({ sub: 'g1', email: 'autre@x.fr', name: '' }).id).toBe(u.id);
    const fresh = accounts.google({ sub: 'g2', email: 'neuf@x.fr', name: 'Neuf' });
    expect(fresh.id).not.toBe(u.id);
    expect(accounts.publicUser(fresh)).toMatchObject({ hasPassword: false, google: true, name: 'Neuf' });
    // Il peut se créer un mot de passe sans « actuel ».
    expect(await accounts.changePassword(fresh.id, '', 'Nouveau123')).toBe(true);
  });

  it('suppression : le compte, ses sessions et son historique partent', async () => {
    const { accounts, album } = setup();
    const u = await accounts.signup({ email: 'j@x.fr', password: 'motdepasse', name: 'J' });
    if (typeof u === 'string') throw new Error(u);
    const t = accounts.openSession(u.id);
    album.record({ id: 'p1', game: 'dessin', mode: 'dessin', started: 1, ended: 2, players: [{ userId: u.id, name: 'J', avatar: 0, score: 5 }] });
    expect(await accounts.remove(u.id, 'mauvais')).toBe('wrong');
    expect(await accounts.remove(u.id, 'motdepasse')).toBe(true);
    expect(accounts.session(t)).toBeNull();
    expect(album.history(u.id)).toEqual([]);
  });
});

describe('album et historique', () => {
  it('range, déduplique, liste, filtre et supprime les images', async () => {
    const { accounts, album } = setup();
    const u = await accounts.signup({ email: 'j@x.fr', password: 'motdepasse', name: 'J' });
    if (typeof u === 'string') throw new Error(u);
    const a = await album.save(u.id, { key: 'p1:dessin:1', party: 'p1', game: 'dessin', caption: 'chat', people: ['Christian'], image: WEBP });
    if (typeof a === 'string') throw new Error(a);
    expect(a.fresh).toBe(true);
    const again = await album.save(u.id, { key: 'p1:dessin:1', party: 'p1', game: 'dessin', caption: 'chat', people: [], image: WEBP });
    expect(again).toEqual({ id: a.id, fresh: false });
    expect(await album.save(u.id, { key: 'x', party: 'p1', game: 'quiz' as never, caption: '', people: [], image: WEBP })).toBe('requete');
    // Un PNG annoncé qui n'en est pas un est refusé.
    expect(await album.save(u.id, { key: 'y', party: 'p1', game: 'dessin', caption: '', people: [], image: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAAAAAA' })).toBe('requete');
    await album.save(u.id, { key: 'p1:photo:1', party: 'p1', game: 'photomaton', caption: 'la star', people: [], image: WEBP });
    expect(album.list(u.id)).toHaveLength(2);
    expect(album.list(u.id, { game: 'photomaton' })[0]).toMatchObject({ caption: 'la star', game: 'photomaton' });
    expect(album.counts(u.id)).toEqual({ dessin: 1, photomaton: 1 });
    const f = await album.file(u.id, a.id);
    expect(f?.type).toBe('image/webp');
    expect(f?.name).toMatch(/^julaika-dessin-chat-\d{4}-\d{2}-\d{2}\.webp$/);
    // Un autre compte ne voit pas l'image.
    expect(await album.file('autre', a.id)).toBeNull();
    expect(await album.remove(u.id, a.id)).toBe(true);
    expect(album.list(u.id)).toHaveLength(1);
  });

  it('historique : rang, joueurs, images de la partie', async () => {
    const { accounts, album } = setup();
    const j = await accounts.signup({ email: 'j@x.fr', password: 'motdepasse', name: 'Julaïka' });
    const c = await accounts.signup({ email: 'c@x.fr', password: 'motdepasse', name: 'Christian' });
    if (typeof j === 'string' || typeof c === 'string') throw new Error();
    await album.save(j.id, { key: 'p1:1', party: 'p1', game: 'dessin', caption: 'chat', people: [], image: WEBP });
    album.record({
      id: 'p1',
      game: 'dessin',
      mode: 'dessin',
      started: 1000,
      ended: 2000,
      players: [
        { userId: c.id, name: 'Christian', avatar: 1, score: 30 },
        { userId: j.id, name: 'Julaïka', avatar: 2, score: 40 },
        { userId: null, name: 'Invité', avatar: 3, score: 30 },
      ],
    });
    // La même partie racontée deux fois ne compte qu'une fois.
    album.record({ id: 'p1', game: 'dessin', mode: 'dessin', started: 1000, ended: 2000, players: [{ userId: j.id, name: 'Julaïka', avatar: 2, score: 40 }] });
    const [h] = album.history(j.id);
    expect(h).toMatchObject({ id: 'p1', rank: 1, score: 40, game: 'dessin' });
    expect(h!.players.map((p) => [p.name, p.rank, !!p.me])).toEqual([
      ['Julaïka', 1, true],
      ['Christian', 2, false],
      ['Invité', 2, false],
    ]);
    expect(h!.media).toHaveLength(1);
    expect(album.history(c.id)[0]).toMatchObject({ rank: 2, media: [] });
    expect(album.stats(j.id)).toEqual({ parties: 1, wins: 1, images: 1, games: 1 });
    // Une partie sans compte n'écrit rien.
    album.record({ id: 'p2', game: 'quiz', mode: '', started: 1, ended: 2, players: [{ userId: null, name: 'A', avatar: 0, score: 1 }] });
    expect(album.history(j.id)).toHaveLength(1);
  });
});

describe('zip', () => {
  it('écrit une archive lisible (signatures, CRC, répertoire central)', async () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    const parts: Buffer[] = [];
    await writeZip([{ name: 'Dessin/chat.webp', data: Buffer.from('bonjour') }, { name: 'été.txt', data: Buffer.from('x') }], (c) => void parts.push(c));
    const zip = Buffer.concat(parts);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(2);
    const cdStart = zip.readUInt32LE(end + 16);
    expect(zip.readUInt32LE(cdStart)).toBe(0x02014b50);
    expect(zip.includes(Buffer.from('été.txt'))).toBe(true);
  });
});

describe('e-mails', () => {
  it('construit un message MIME propre et refuse les injections', () => {
    const msg = buildMessage('julaïka <noreply@2nbdigital.com>', resetCodeMail('j@x.fr', 'Julaïka', '482917', 'https://julaika.2nbdigital.com'));
    expect(msg).toMatch(/^From: =\?UTF-8\?B\?.+\?= <noreply@2nbdigital\.com>\r\n/);
    expect(msg).toContain('To: <j@x.fr>');
    expect(msg).toContain('Subject: =?UTF-8?B?');
    const text = Buffer.from(msg.split('\r\n\r\n')[2]!.split('\r\n--')[0]!.replace(/\r\n/g, ''), 'base64').toString('utf8');
    expect(text).toContain('482 917');
    expect(() => buildMessage('noreply@2nbdigital.com', { to: 'a@b.fr\r\nBcc: x@y.fr', subject: 's', text: 't', html: 'h' })).toThrow();
  });
});

describe('API des comptes', () => {
  const { accounts, album } = setup();
  const sent: Mail[] = [];
  const api = accountApi({ accounts, album, mail: async (m) => void sent.push(m), google: null, site: 'http://localhost' });
  let server: Server;
  let base = '';
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      if (!(await api.handle(req, res, new URL(req.url!, 'http://x')))) res.writeHead(404).end();
    });
    await new Promise<void>((ok) => server.listen(0, ok));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server.close());

  const call = async (path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string } = {}) => {
    const r = await fetch(base + path, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.cookie ? { cookie: init.cookie } : {}),
        ...(init.origin ? { origin: init.origin } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const set = r.headers.getSetCookie();
    const ct = r.headers.get('content-type') ?? '';
    return { status: r.status, set, json: ct.includes('json') ? await r.json() : null, buf: ct.includes('json') ? null : Buffer.from(await r.arrayBuffer()) };
  };

  it('parcours complet : inscription, album, zip, historique, code, déconnexion', async () => {
    expect((await call('/api/auth/moi')).json).toMatchObject({ user: null, google: false });
    const up = await call('/api/auth/inscription', { body: { email: 'j@x.fr', password: 'sourire2026', name: 'Julaïka', avatar: 2 } });
    expect(up.status).toBe(201);
    expect(up.set[0]).toMatch(/^jk_s=.+; Path=\/; HttpOnly; SameSite=Lax/);
    const cookie = `jk_s=${parseCookies(up.set[0]!.split(';')[0]).jk_s}`;
    await new Promise((r) => setTimeout(r, 10));
    expect(sent.at(-1)?.subject).toContain('Bienvenue');

    expect((await call('/api/auth/moi', { cookie })).json.user).toMatchObject({ name: 'Julaïka', email: 'j@x.fr' });
    expect((await call('/api/album')).status).toBe(401);
    // Une autre origine ne peut rien écrire.
    expect((await call('/api/album', { cookie, origin: 'https://pirate.example', body: { key: 'k' } })).status).toBe(403);

    const saved = await call('/api/album', { cookie, body: { key: 'p1:1', party: 'p1', game: 'dessin', caption: 'chat', people: ['Christian'], image: WEBP } });
    expect(saved.status).toBe(201);
    const list = await call('/api/album', { cookie });
    expect(list.json.items).toHaveLength(1);
    const img = await call(`/api/album/${saved.json.id}`, { cookie });
    expect(img.buf!.toString('ascii', 8, 12)).toBe('WEBP');
    const zip = await call('/api/album/zip', { cookie });
    expect(zip.buf!.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.buf!.includes(Buffer.from('Dessin/julaika-dessin-chat-'))).toBe(true);

    expect((await call('/api/historique', { cookie })).json).toMatchObject({ parties: [], stats: { images: 1 } });

    // Mot de passe oublié par code.
    expect((await call('/api/auth/code', { body: { email: 'inconnu@x.fr' } })).json).toEqual({ ok: true });
    const before = sent.length;
    expect((await call('/api/auth/code', { body: { email: 'j@x.fr' } })).json).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 10));
    expect(sent.length).toBe(before + 1);
    const code = /(\d{3}) (\d{3})/.exec(sent.at(-1)!.subject)!.slice(1).join('');
    const checked = await call('/api/auth/code/verifier', { body: { email: 'j@x.fr', code } });
    expect(checked.status).toBe(200);
    const reset = await call('/api/auth/code/nouveau', { body: { token: checked.json.token, password: 'Nouveau2026!' } });
    expect(reset.status).toBe(200);
    // L'ancienne session est fermée, la nouvelle marche.
    expect((await call('/api/auth/moi', { cookie })).json.user).toBeNull();
    const cookie2 = `jk_s=${parseCookies(reset.set[0]!.split(';')[0]).jk_s}`;
    expect((await call('/api/auth/moi', { cookie: cookie2 })).json.user.name).toBe('Julaïka');

    expect((await call('/api/compte', { cookie: cookie2, method: 'PATCH', body: { name: 'Jula', avatar: 5 } })).json.user).toMatchObject({ name: 'Jula', avatar: 5 });
    const out = await call('/api/auth/deconnexion', { cookie: cookie2, body: {} });
    expect(out.set[0]).toContain('Max-Age=0');
    expect((await call('/api/auth/moi', { cookie: cookie2 })).json.user).toBeNull();
    expect((await call('/api/auth/connexion', { body: { email: 'j@x.fr', password: 'faux-faux' } })).status).toBe(401);
  });
});
