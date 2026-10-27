import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize as normalizePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { isGameMode, isRoomGame, type ClientMsg, type GameMode, type RoomGame } from '@julaika/shared';
import { deepseekPairs, deepseekWords } from './deepseek';
import { warmDictionary } from './dico';
import { iceServersFor } from './ice';
import { MotDuJour, isToken } from './motdujour';
import { Room } from './room';

const PORT = Number(process.env.PORT ?? 3001);
const STATIC_DIR = process.env.STATIC_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
const rooms = new Map<string, Room>();
const generateWords = deepseekWords();
const generatePairs = deepseekPairs();
const mot = new MotDuJour(process.env.MOT_DATA_DIR ?? 'data/mot', Date.now, process.env.MOT_TZ || 'Europe/Paris');
const motBuckets = new Map<string, () => boolean>();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

// Sert le build du client : un seul process, un seul port à déployer.
const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (url.pathname.startsWith('/api/mot')) return motApi(req, res, url);
  const safe = normalizePath(url.pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(STATIC_DIR, safe);
  try {
    if (!(await stat(file)).isFile()) throw new Error();
  } catch {
    file = join(STATIC_DIR, 'index.html'); // routes SPA (/r/ABCD)
  }
  try {
    const body = await readFile(file);
    const immutable = file.includes(`${join(STATIC_DIR, 'assets')}`);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Client non buildé : lance `npm run build`.');
  }
});

/** API du mot du jour : GET /api/mot?token=&date= (état d'un jour), POST /api/mot/essai (un essai). */
async function motApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0]!.trim();
  let allow = motBuckets.get(ip);
  if (!allow) motBuckets.set(ip, (allow = bucket(30, 2)));
  if (!allow()) return send(429, { error: 'trop' });

  if (req.method === 'GET' && url.pathname === '/api/mot') {
    const token = url.searchParams.get('token');
    const out = mot.state(isToken(token) ? token : null, url.searchParams.get('date') ?? undefined);
    return typeof out === 'string' ? send(400, { error: out }) : send(200, out);
  }
  if (req.method === 'POST' && url.pathname === '/api/mot/essai') {
    let body: { token?: unknown; name?: unknown; avatar?: unknown; word?: unknown };
    try {
      body = JSON.parse(await readBody(req, 2048));
    } catch {
      return send(400, { error: 'requete' });
    }
    if (!isToken(body.token) || typeof body.word !== 'string') return send(400, { error: 'requete' });
    const out = mot.guess(body.token, String(body.name ?? ''), Number(body.avatar), body.word);
    return typeof out === 'string' ? send(422, { error: out }) : send(200, out);
  }
  send(404, { error: 'introuvable' });
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
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
}

// Les seaux des visiteurs partis se vident de temps en temps.
setInterval(() => motBuckets.clear(), 10 * 60_000).unref();

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024, perMessageDeflate: false });

wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
  let room: Room | null = null;
  let playerId: string | null = null;
  const chatBucket = bucket(5, 1); // 5 messages en rafale, 1/s ensuite
  const drawBucket = bucket(120, 60);
  const dialBucket = bucket(40, 30); // aiguille de Wavelength : ~30 positions/s
  const soundBucket = bucket(4, 1.5); // boîte à sons : 4 en rafale, puis ~1 toutes les 700 ms

  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  ws.on('message', (data, isBinary) => {
    if (isBinary) {
      if (room && playerId && drawBucket()) room.handleDraw(playerId, toBytes(data));
      return;
    }
    let msg: ClientMsg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.t === 'join') {
      if (room) return;
      const code = msg.room?.toUpperCase();
      if (code && !rooms.has(code)) {
        ws.send(JSON.stringify({ t: 'error', message: 'Salon introuvable.' }));
        return;
      }
      room = code ? rooms.get(code)! : createRoom(isRoomGame(msg.game) ? msg.game : 'dessin', isGameMode(msg.mode) ? msg.mode : 'dessin');
      playerId = room.join(ws, msg.name, msg.avatar);
      if (!playerId) {
        room = null;
        ws.send(JSON.stringify({ t: 'error', message: 'Salon complet.' }));
      }
      return;
    }
    if (!room || !playerId) return;
    if (msg.t === 'chat' && !chatBucket()) return;
    if ((msg.t === 'wave' || msg.t === 'tel' || msg.t === 'intrus' || msg.t === 'bac' || msg.t === 'connait' || msg.t === 'bomb' || msg.t === 'sourire' || msg.t === 'cerveau') && !dialBucket()) return;
    if (msg.t === 'sound' && !soundBucket()) return;
    room.handle(playerId, msg);
  });

  ws.on('close', () => {
    if (room && playerId) room.leave(playerId);
  });
});

// Coupe les connexions mortes (onglets fermés sans close propre, réseaux mobiles).
setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (!ws.alive) ws.terminate();
    else {
      ws.alive = false;
      ws.ping();
    }
  }
}, 20_000).unref();

function createRoom(game: RoomGame, mode: GameMode): Room {
  let code: string;
  do code = randomCode();
  while (rooms.has(code));
  const room = new Room(
    code,
    (r) => {
      r.dispose();
      rooms.delete(r.code);
    },
    Math.random,
    (playerId) => iceServersFor(playerId),
    generateWords,
    generatePairs,
  );
  room.game = game;
  // La carte « Mime » de l'accueil ouvre un salon de dessin réglé en mime.
  if (game === 'dessin') room.settings = { ...room.settings, mode };
  rooms.set(code, room);
  if (game === 'bombe') setImmediate(warmDictionary);
  return room;
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function bucket(capacity: number, perSecond: number): () => boolean {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data));
  return new Uint8Array(0);
}

// `docker stop` envoie SIGTERM : on écrit les classements avant de partir.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    mot.flush();
    process.exit(0);
  });
}

http.listen(PORT, () => {
  console.log(`julaïka : http://localhost:${PORT}`);
  console.log(generateWords ? '[mots] générés par DeepSeek selon la difficulté' : '[mots] listes intégrées (DEEPSEEK_API_KEY absente)');
});
