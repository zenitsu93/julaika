import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Base des comptes : un seul fichier SQLite dans le volume de données (à côté des classements du
 * mot du jour). SQLite est intégré à Node 22 : aucune dépendance native à compiler.
 */
export type Db = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar INTEGER NOT NULL DEFAULT 0,
  pass TEXT,
  google_sub TEXT UNIQUE,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL,
  agent TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

-- Codes à 6 chiffres envoyés par e-mail (mot de passe oublié), puis jeton de remplacement.
CREATE TABLE IF NOT EXISTS codes (
  email TEXT PRIMARY KEY,
  hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  reset TEXT
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  game TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT '',
  started INTEGER NOT NULL,
  ended INTEGER NOT NULL,
  players TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_parties (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  party_id TEXT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  score INTEGER NOT NULL,
  PRIMARY KEY (user_id, party_id)
);
CREATE INDEX IF NOT EXISTS user_parties_user ON user_parties(user_id, party_id);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  party TEXT NOT NULL DEFAULT '',
  game TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  people TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created INTEGER NOT NULL,
  UNIQUE (user_id, key)
);
CREATE INDEX IF NOT EXISTS media_user ON media(user_id, created);
`;

export function openDb(file: string): Db {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  return db;
}

/** Une transaction : tout passe, ou rien. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
