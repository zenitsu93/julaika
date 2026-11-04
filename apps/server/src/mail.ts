import { randomBytes } from 'node:crypto';
import { connect as netConnect, type Socket } from 'node:net';
import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { EMAIL } from '@julaika/shared';

/**
 * Envoi des e-mails par SMTP (la boîte noreply@ de l'hébergement o2switch). Un petit client
 * maison plutôt qu'une dépendance : un message à la fois, TLS direct (465) ou STARTTLS (587).
 *
 * SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, MAIL_FROM (« julaïka <noreply@…> »).
 * Sans SMTP_HOST : le message est écrit dans les journaux du serveur (poste de développement).
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

export function mailer(env: NodeJS.ProcessEnv = process.env): Mailer & { enabled: boolean } {
  const host = env.SMTP_HOST?.trim();
  if (!host) {
    const log = async (m: Mail) => console.log(`[e-mail] SMTP non réglé, message pour ${m.to} : ${m.subject}\n${m.text}`);
    return Object.assign(log, { enabled: false });
  }
  const port = Number(env.SMTP_PORT || 465);
  const user = env.SMTP_USER ?? '';
  const pass = env.SMTP_PASS ?? '';
  const from = env.MAIL_FROM || `julaïka <${user}>`;
  const send = (m: Mail) => smtpSend({ host, port, user, pass, from }, m);
  return Object.assign(send, { enabled: true });
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const wrap = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
/** En-tête non ASCII : encodé à la mode RFC 2047. */
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** Adresse seule, extraite de « Nom <adresse> », refusée si elle contient de quoi injecter un en-tête. */
function address(v: string): string {
  const m = /<([^<>]+)>\s*$/.exec(v);
  const a = (m ? m[1]! : v).trim();
  if (/[\r\n<>]/.test(a) || !EMAIL.test(a)) throw new Error(`adresse e-mail invalide : ${a}`);
  return a;
}

export function buildMessage(from: string, m: Mail, now = new Date()): string {
  const fromAddr = address(from);
  const toAddr = address(m.to);
  const fromName = from.includes('<') ? from.slice(0, from.indexOf('<')).trim().replace(/"/g, '') : '';
  const boundary = `jk-${randomBytes(12).toString('hex')}`;
  const domain = fromAddr.split('@')[1];
  const lines = [
    `From: ${fromName ? `${header(fromName)} ` : ''}<${fromAddr}>`,
    `To: <${toAddr}>`,
    `Subject: ${header(m.subject.replace(/[\r\n]/g, ' '))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${randomBytes(16).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(m.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(m.html)),
    `--${boundary}--`,
    '',
  ];
  return lines.join('\r\n');
}

/** Lit les réponses du serveur SMTP ligne par ligne (« 250-… » continue, « 250 … » termine). */
function reader(sock: Socket | TLSSocket) {
  let buf = '';
  let waiting: ((v: { code: number; text: string }) => void) | null = null;
  let failed: ((e: Error) => void) | null = null;
  const lines: string[] = [];
  const pump = () => {
    let i: number;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      lines.push(buf.slice(0, i));
      buf = buf.slice(i + 2);
      const last = lines.at(-1)!;
      if (/^\d{3} /.test(last) || /^\d{3}$/.test(last)) {
        const text = lines.splice(0).join('\n');
        const w = waiting;
        waiting = failed = null;
        w?.({ code: Number(last.slice(0, 3)), text });
      }
    }
  };
  const onData = (d: Buffer) => {
    buf += d.toString('utf8');
    pump();
  };
  sock.on('data', onData);
  sock.on('error', (e) => failed?.(e));
  return {
    next: () =>
      new Promise<{ code: number; text: string }>((resolve, reject) => {
        waiting = resolve;
        failed = reject;
        pump();
      }),
    detach: () => sock.off('data', onData),
  };
}

async function smtpSend(c: SmtpConfig, m: Mail): Promise<void> {
  const message = buildMessage(c.from, m);
  const secure = c.port === 465;
  let sock: Socket | TLSSocket = await new Promise((resolve, reject) => {
    const s = secure ? tlsConnect({ host: c.host, port: c.port, servername: c.host }, () => resolve(s)) : netConnect({ host: c.host, port: c.port }, () => resolve(s));
    s.once('error', reject);
    s.setTimeout(20_000, () => s.destroy(new Error('SMTP : délai dépassé')));
  });
  let r = reader(sock);
  const expect = async (ok: number[], what: string) => {
    const res = await r.next();
    if (!ok.includes(res.code)) throw new Error(`SMTP ${what} : ${res.text}`);
    return res;
  };
  const cmd = async (line: string, ok: number[], what = line.split(' ')[0]!) => {
    sock.write(`${line}\r\n`);
    return expect(ok, what);
  };
  try {
    await expect([220], 'accueil');
    let ehlo = await cmd('EHLO julaika', [250]);
    if (!secure) {
      if (!/STARTTLS/i.test(ehlo.text)) throw new Error('SMTP : le serveur ne propose pas STARTTLS');
      await cmd('STARTTLS', [220]);
      r.detach();
      sock = await new Promise<TLSSocket>((resolve, reject) => {
        const t = tlsConnect({ socket: sock, servername: c.host }, () => resolve(t));
        t.once('error', reject);
      });
      r = reader(sock);
      ehlo = await cmd('EHLO julaika', [250]);
    }
    if (c.user) {
      await cmd(`AUTH PLAIN ${b64(`\0${c.user}\0${c.pass}`)}`, [235], 'AUTH');
    }
    await cmd(`MAIL FROM:<${address(c.from)}>`, [250]);
    await cmd(`RCPT TO:<${address(m.to)}>`, [250, 251]);
    await cmd('DATA', [354]);
    // Une ligne qui commence par un point est doublée : sinon elle finirait le message.
    sock.write(`${message.replace(/^\./gm, '..')}\r\n.\r\n`);
    await expect([250], 'envoi');
    sock.write('QUIT\r\n');
  } finally {
    setTimeout(() => sock.destroy(), 500).unref();
  }
}

// ---- Messages ----------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string, site: string): string {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f3ece0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#2a1a12">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf8;border:1px solid #ece2d1;border-radius:14px;overflow:hidden">
<tr><td style="background:#4b2e21;padding:20px 24px;color:#f2e6b3;font-size:22px;font-weight:800;letter-spacing:-.5px">jula<span style="color:#d6a24a">ï</span>ka</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">${body}</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #ece2d1;font-size:12px;color:#86705f">julaïka · jouer ensemble, même de loin · ${esc(site)}</td></tr>
</table></td></tr></table><span style="display:none">${esc(title)}</span></body></html>`;
}

export function resetCodeMail(to: string, name: string, code: string, site: string): Mail {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  return {
    to,
    subject: `${spaced} : ton code julaïka`,
    text: `Salut ${name},\n\nVoici ton code pour choisir un nouveau mot de passe : ${spaced}\n\nIl marche 30 minutes. Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.\n\njulaïka · ${site}`,
    html: layout(
      `Ton code : ${spaced}`,
      `<p style="margin:0 0 12px"><b>Salut ${esc(name)},</b></p>
<p style="margin:0 0 16px">Voici ton code pour choisir un nouveau mot de passe :</p>
<p style="margin:0 0 16px;font-size:34px;font-weight:800;letter-spacing:8px;color:#4b2e21;background:#f2e6b3;border-radius:12px;padding:14px 0;text-align:center">${spaced}</p>
<p style="margin:0;font-size:13px;color:#86705f">Il marche 30 minutes et une seule fois. Si tu n'as rien demandé, ignore ce message : ton mot de passe ne change pas.</p>`,
      site,
    ),
  };
}

export function welcomeMail(to: string, name: string, site: string): Mail {
  return {
    to,
    subject: 'Bienvenue sur julaïka',
    text: `Salut ${name},\n\nTon compte est prêt. Les images de tes parties (dessins, photos du Photomaton, cadavres exquis…) seront rangées dans ton album, à télécharger quand tu veux.\n\nÀ tout de suite : ${site}`,
    html: layout(
      'Ton compte est prêt',
      `<p style="margin:0 0 12px"><b>Salut ${esc(name)},</b></p>
<p style="margin:0 0 16px">Ton compte est prêt. Les images de tes parties (dessins, photos du Photomaton, cadavres exquis…) seront rangées dans ton album, à télécharger quand tu veux.</p>
<p style="margin:0"><a href="${esc(site)}/album" style="display:inline-block;background:#4b2e21;color:#f2e6b3;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 18px">Voir mon album</a></p>`,
      site,
    ),
  };
}
