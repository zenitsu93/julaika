import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize as normalizePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { isGameMode, isRoomGame, type ClientMsg, type GameMode, type RoomGame } from '@julaika/shared';
import { aiBudget, allowedOrigin, bucket, clientIp, connectionCounter, keyedBuckets, roomCode, securityHeaders } from './guard';
import { deepseekDares, deepseekPairs, deepseekQuiz, deepseekWords } from './deepseek';
import { warmDictionary } from './dico';
import { iceServersFor } from './ice';
import { MotDuJour, isToken } from './motdujour';
import { Room } from './room';

const PORT = Number(process.env.PORT ?? 3001);
const STATIC_DIR = process.env.STATIC_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
const rooms = new Map<string, Room>();
const generateWords = deepseekWords();
const generatePairs = deepseekPairs();
const generateDares = deepseekDares();
const generateQuiz = deepseekQuiz();
const mot = new MotDuJour(process.env.MOT_DATA_DIR ?? 'data/mot', Date.now, process.env.MOT_TZ || 'Europe/Paris');
const motBuckets = keyedBuckets(30, 2);

/** Garde-fous d'un serveur ouvert à tous : connexions par IP, salons en tout, essais de code. */
const MAX_CONNECTIONS_PER_IP = 20;
const MAX_ROOMS = 500;
/** Codes faux tolérés sur une connexion avant de la couper (le client n'en tente qu'un). */
const MAX_BAD_CODES = 3;
/** Appels d'IA par salon et par heure : de quoi tenir une longue soirée, pas de quoi vider le quota. */
const AI_CALLS_PER_ROOM = 20;
/** Un client qui ne lit plus ce qu'on lui envoie est coupé avant de remplir la mémoire. */
const MAX_BUFFERED = 8 * 1024 * 1024;
const connections = connectionCounter(MAX_CONNECTIONS_PER_IP);
/** Messages propres à chaque jeu, qui partagent le seau de l'aiguille de Wavelength. */
const GAME_MESSAGES = new Set<string>([
  'wave', 'tel', 'intrus', 'bac', 'connait', 'bomb', 'photo', 'sourire', 'bras', 'flash', 'cadavre', 'interdits',
  'motamot', 'agents', 'fred', 'alibi', 'pitch', 'cerveau', 'aov', 'quiz', 'mimeShot', 'arcade',
]);
const joinBuckets = keyedBuckets(20, 1 / 3); // 20 salons rejoints d'un coup par IP, puis un toutes les 3 s

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
  for (const [name, value] of Object.entries(securityHeaders(req.headers.host))) res.setHeader(name, value);
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
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
  if (!motBuckets.take(clientIp(req))) return send(429, { error: 'trop' });

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

// Les seaux des visiteurs partis depuis 10 minutes sont oubliés.
setInterval(() => {
  motBuckets.prune();
  joinBuckets.prune();
}, 60_000).unref();

const wss = new WebSocketServer({
  server: http,
  path: '/ws',
  maxPayload: 64 * 1024,
  perMessageDeflate: false,
  // Seules les pages du jeu ouvrent une connexion : un autre site ne peut pas s'en servir.
  verifyClient: ({ req }: { req: IncomingMessage }) => allowedOrigin(req.headers.origin, req.headers.host),
});

wss.on('connection', (ws: WebSocket & { alive?: boolean }, req: IncomingMessage) => {
  const ip = clientIp(req);
  if (!connections.add(ip)) {
    ws.close(1013, 'trop de connexions');
    return;
  }
  let room: Room | null = null;
  let playerId: string | null = null;
  let badCodes = 0;
  // Les envois passent par ici : un client qui n'avale plus rien est coupé.
  const conn = {
    send(data: string | ArrayBuffer | Uint8Array) {
      if (ws.readyState !== ws.OPEN) return;
      if (ws.bufferedAmount > MAX_BUFFERED) return void ws.terminate();
      ws.send(data);
    },
  };
  const anyBucket = bucket(80, 40); // tout message JSON : large pour le jeu, court pour un script
  const chatBucket = bucket(5, 1); // 5 messages en rafale, 1/s ensuite
  const drawBucket = bucket(120, 60);
  const dialBucket = bucket(40, 30); // aiguille de Wavelength : ~30 positions/s
  const soundBucket = bucket(4, 1.5); // boîte à sons : 4 en rafale, puis ~1 toutes les 700 ms
  const callBucket = bucket(10, 2); // entrée et sortie de visio, caméra et micro
  const rtcBucket = bucket(300, 60); // signalisation WebRTC : rafale de candidats en arrivant dans la visio
  const settingsBucket = bucket(20, 8); // réglages de l'hôte (curseurs glissés)
  // Réglages arrivés trop vite : le dernier état est gardé et appliqué un peu plus tard, jamais perdu.
  let pendingSettings: ClientMsg | null = null;
  let settingsTimer: ReturnType<typeof setTimeout> | null = null;
  const flushSettings = () => {
    settingsTimer = null;
    if (!pendingSettings || !room || !playerId) return;
    if (!settingsBucket()) return void (settingsTimer = setTimeout(flushSettings, 250));
    const msg = pendingSettings;
    pendingSettings = null;
    room.handle(playerId, msg);
  };

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
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'join') {
      if (room) return;
      // Deviner un code demande des millions d'essais : quelques-uns par connexion et par IP suffisent.
      if (!joinBuckets.take(ip)) {
        conn.send(JSON.stringify({ t: 'error', message: 'Trop de tentatives, réessaie dans un instant.' }));
        return;
      }
      const code = typeof msg.room === 'string' ? msg.room.toUpperCase() : '';
      if (code && !rooms.has(code)) {
        conn.send(JSON.stringify({ t: 'error', message: 'Salon introuvable.' }));
        if (++badCodes >= MAX_BAD_CODES) ws.close(1008, 'trop de codes faux');
        return;
      }
      if (!code && rooms.size >= MAX_ROOMS) {
        conn.send(JSON.stringify({ t: 'error', message: 'Le serveur est plein, réessaie dans un instant.' }));
        return;
      }
      room = code ? rooms.get(code)! : createRoom(isRoomGame(msg.game) ? msg.game : 'dessin', isGameMode(msg.mode) ? msg.mode : 'dessin');
      playerId = room.join(conn, String(msg.name ?? ''), Number(msg.avatar) || 0);
      if (!playerId) {
        room = null;
        conn.send(JSON.stringify({ t: 'error', message: 'Salon complet.' }));
      }
      return;
    }
    if (!room || !playerId) return;
    if (msg.t === 'rtc') {
      if (rtcBucket()) room.handle(playerId, msg);
      return;
    }
    if (!anyBucket()) return;
    if (msg.t === 'settings') {
      pendingSettings = msg;
      if (!settingsTimer) flushSettings();
      return;
    }
    if (msg.t === 'call' && !callBucket()) return;
    if (msg.t === 'chat' && !chatBucket()) return;
    if (GAME_MESSAGES.has(msg.t) && !dialBucket()) return;
    if (msg.t === 'sound' && !soundBucket()) return;
    room.handle(playerId, msg);
  });

  ws.on('close', () => {
    connections.remove(ip);
    if (settingsTimer) clearTimeout(settingsTimer);
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
  do code = roomCode();
  while (rooms.has(code));
  const ai = aiBudget(AI_CALLS_PER_ROOM);
  const room = new Room(
    code,
    (r) => {
      r.dispose();
      rooms.delete(r.code);
    },
    Math.random,
    (playerId) => iceServersFor(playerId),
    ai(generateWords),
    ai(generatePairs),
    ai(generateDares),
    ai(generateQuiz),
  );
  room.game = game;
  // La carte « Mime » de l'accueil ouvre un salon de dessin réglé en mime.
  if (game === 'dessin') room.settings = { ...room.settings, mode };
  rooms.set(code, room);
  if (game === 'bombe') setImmediate(warmDictionary);
  return room;
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
