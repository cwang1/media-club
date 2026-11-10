import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

export const MEDIA_TYPES = ['movie', 'show', 'book'] as const;
export const STATUSES = ['to_watch', 'watching', 'completed'] as const;
export const MEMBER_COLORS = [
  '#c2410c', '#0f766e', '#7c3aed', '#be185d',
  '#1d4ed8', '#4d7c0f', '#b45309', '#0e7490',
];

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('movie', 'show', 'book')),
  genre         TEXT NOT NULL,
  runtime       INTEGER CHECK (runtime IS NULL OR runtime > 0),
  pitch         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'to_watch'
                CHECK (status IN ('to_watch', 'watching', 'completed')),
  suggested_by  INTEGER REFERENCES members(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT ${NOW},
  updated_at    TEXT NOT NULL DEFAULT ${NOW}
);

CREATE TABLE IF NOT EXISTS reviews (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  stars       INTEGER CHECK (stars IS NULL OR stars BETWEEN 1 AND 5),
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT ${NOW},
  updated_at  TEXT NOT NULL DEFAULT ${NOW},
  UNIQUE (item_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_item ON reviews(item_id);
`;

export function openDb(file: string, opts: { seed?: boolean } = {}): DB {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  if (opts.seed) seedIfEmpty(db);
  return db;
}

export function nowSql() {
  return NOW;
}

/** Fills an empty database with a few friends and titles so the app isn't blank on first run. */
function seedIfEmpty(db: DB) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number };
  if (n > 0) return;

  const members = ['Ana', 'Ben', 'Chloe', 'Dev'];
  const items: Array<{
    title: string; type: string; genre: string; runtime: number; pitch: string;
    status: string; by: number; reviews?: Array<[member: number, stars: number | null, comment: string]>;
  }> = [
    {
      title: 'Dune: Part Two', type: 'movie', genre: 'Sci-Fi', runtime: 166, status: 'completed', by: 0,
      pitch: 'Giant worms, desert politics, and a soundtrack you feel in your ribs. Needs the biggest screen we can find.',
      reviews: [[0, 5, 'Worth every minute. The sound design alone!'], [1, 4, 'Long, but it never dragged.'], [3, 4, '']],
    },
    {
      title: 'The Bear', type: 'show', genre: 'Drama', runtime: 30, status: 'watching', by: 2,
      pitch: 'Stressful kitchen chaos with a big heart. Short episodes, easy to fit into a weeknight.',
      reviews: [[2, null, 'Halfway through season one - the long take in episode 7 is wild.']],
    },
    {
      title: 'Project Hail Mary', type: 'book', genre: 'Sci-Fi', runtime: 476, status: 'to_watch', by: 1,
      pitch: 'A lone astronaut wakes up with amnesia and a problem the size of the sun. Funny and very nerdy.',
    },
    {
      title: 'Paddington 2', type: 'movie', genre: 'Comedy', runtime: 104, status: 'completed', by: 3,
      pitch: 'The most wholesome heist movie ever made. Marmalade sandwiches recommended.',
      reviews: [[3, 5, 'Perfect film, no notes.'], [0, 5, 'Cried at a bear. Twice.'], [2, 4, 'Charming from start to finish.']],
    },
    {
      title: 'Severance', type: 'show', genre: 'Thriller', runtime: 50, status: 'to_watch', by: 0,
      pitch: 'Office workers who surgically split work memories from home ones. Eerie, funny, and very bingeable.',
    },
    {
      title: 'Piranesi', type: 'book', genre: 'Fantasy', runtime: 272, status: 'completed', by: 2,
      pitch: 'A man lives alone in an endless house of statues and tides. Short, strange and beautiful.',
      reviews: [[2, 5, 'Read it in two sittings.'], [1, 3, 'Gorgeous writing, slow start for me.']],
    },
    {
      title: 'Spirited Away', type: 'movie', genre: 'Animation', runtime: 125, status: 'to_watch', by: 1,
      pitch: 'A girl stumbles into a bathhouse for spirits. Some of us have somehow never seen it.',
    },
    {
      title: 'Arrival', type: 'movie', genre: 'Sci-Fi', runtime: 116, status: 'to_watch', by: 3,
      pitch: 'A linguist tries to talk to aliens. Quiet, clever, and great to discuss afterwards.',
    },
  ];

  const insMember = db.prepare('INSERT INTO members (name, color) VALUES (?, ?)');
  const insItem = db.prepare(
    'INSERT INTO items (title, type, genre, runtime, pitch, status, suggested_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const insReview = db.prepare('INSERT INTO reviews (item_id, member_id, stars, comment) VALUES (?, ?, ?, ?)');

  db.exec('BEGIN');
  try {
    const memberIds = members.map((name, i) =>
      Number(insMember.run(name, MEMBER_COLORS[i % MEMBER_COLORS.length]).lastInsertRowid),
    );
    for (const it of items) {
      const itemId = Number(
        insItem.run(it.title, it.type, it.genre, it.runtime, it.pitch, it.status, memberIds[it.by]).lastInsertRowid,
      );
      for (const [m, stars, comment] of it.reviews ?? []) {
        insReview.run(itemId, memberIds[m], stars, comment);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
