import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize as normalizePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMsg } from '@julaika/shared';
import { iceServersFor } from './ice';
import { Room } from './room';

const PORT = Number(process.env.PORT ?? 3001);
const STATIC_DIR = process.env.STATIC_DIR ?? fileURLToPath(new URL('../../client/dist', import.meta.url));
const rooms = new Map<string, Room>();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
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

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 64 * 1024, perMessageDeflate: false });

wss.on('connection', (ws: WebSocket & { alive?: boolean }) => {
  let room: Room | null = null;
  let playerId: string | null = null;
  const chatBucket = bucket(5, 1); // 5 messages en rafale, 1/s ensuite
  const drawBucket = bucket(120, 60);

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
      room = code ? rooms.get(code)! : createRoom();
      playerId = room.join(ws, msg.name, msg.avatar);
      if (!playerId) {
        room = null;
        ws.send(JSON.stringify({ t: 'error', message: 'Salon complet.' }));
      }
      return;
    }
    if (!room || !playerId) return;
    if (msg.t === 'chat' && !chatBucket()) return;
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

function createRoom(): Room {
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
  );
  rooms.set(code, room);
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

http.listen(PORT, () => console.log(`julaika : http://localhost:${PORT}`));
