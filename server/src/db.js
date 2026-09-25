import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,           -- user_id в MAX
  name        TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id),
  legal_form  TEXT NOT NULL CHECK (legal_form IN ('ip', 'org')),
  activity    TEXT NOT NULL,
  has_staff   INTEGER NOT NULL DEFAULT 0,
  flags       TEXT NOT NULL DEFAULT '{}',
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  profile       TEXT NOT NULL,                 -- снимок профиля на момент проверки
  item_ids      TEXT NOT NULL,                 -- снимок списка требований
  status        TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  started_at    INTEGER NOT NULL,
  completed_at  INTEGER,
  readiness     INTEGER
);
CREATE INDEX IF NOT EXISTS checks_user ON checks(user_id, id DESC);

CREATE TABLE IF NOT EXISTS answers (
  check_id    INTEGER NOT NULL REFERENCES checks(id),
  item_id     TEXT NOT NULL,
  answer      TEXT NOT NULL CHECK (answer IN ('yes', 'no', 'unknown')),
  comment     TEXT,
  photo       TEXT,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (check_id, item_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  check_id     INTEGER NOT NULL REFERENCES checks(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  item_id      TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('open', 'done')),
  due_at       INTEGER NOT NULL,
  remind_at    INTEGER,
  reminded_at  INTEGER,
  done_at      INTEGER,
  UNIQUE (check_id, item_id)
);
CREATE INDEX IF NOT EXISTS tasks_remind ON tasks(status, remind_at);

CREATE TABLE IF NOT EXISTS chat_state (
  user_id     INTEGER PRIMARY KEY,
  state       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);
`;

export function openDb(dbPath) {
  if (dbPath !== ':memory:') mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

/** Выполняет fn в транзакции. node:sqlite синхронный, поэтому достаточно BEGIN/COMMIT. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
