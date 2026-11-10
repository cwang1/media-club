import express, { type NextFunction, type Request, type Response } from 'express';
import { z, ZodError } from 'zod';
import { MEDIA_TYPES, MEMBER_COLORS, STATUSES, nowSql, type DB } from './db.js';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// ---------- validation schemas ----------

const memberInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40, 'Name must be 40 characters or fewer'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #1d4ed8').optional(),
});

const itemFields = {
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or fewer'),
  type: z.enum(MEDIA_TYPES, { message: 'Type must be movie, show or book' }),
  genre: z.string().trim().min(1, 'Genre is required').max(40, 'Genre must be 40 characters or fewer'),
  runtime: z
    .number({ invalid_type_error: 'Runtime must be a number' })
    .int('Runtime must be a whole number')
    .positive('Runtime must be greater than 0')
    .max(100000)
    .nullable()
    .optional(),
  pitch: z.string().trim().max(280, 'Pitch must be 280 characters or fewer').optional(),
  status: z.enum(STATUSES, { message: 'Status must be to_watch, watching or completed' }).optional(),
  suggested_by: z.number().int().positive().nullable().optional(),
};

const itemCreate = z.object(itemFields);
const itemPatch = z
  .object(itemFields)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');

const reviewInput = z
  .object({
    stars: z.number().int().min(1, 'Stars must be 1-5').max(5, 'Stars must be 1-5').nullable().optional(),
    comment: z.string().trim().max(1000, 'Comment must be 1000 characters or fewer').optional(),
  })
  .refine((r) => r.stars != null || (r.comment ?? '').length > 0, 'Add a star rating or a comment');

const SORTS = {
  newest: 'i.created_at DESC, i.id DESC',
  oldest: 'i.created_at ASC, i.id ASC',
  title: 'i.title COLLATE NOCASE ASC',
  genre: 'i.genre COLLATE NOCASE ASC, i.title COLLATE NOCASE ASC',
  // Books are measured in pages, movies/shows in minutes, so keep each type together.
  runtime_asc: 'i.type ASC, i.runtime IS NULL, i.runtime ASC, i.title COLLATE NOCASE ASC',
  runtime_desc: 'i.type ASC, i.runtime IS NULL, i.runtime DESC, i.title COLLATE NOCASE ASC',
  rating: 'avg_stars IS NULL, avg_stars DESC, review_count DESC, i.title COLLATE NOCASE ASC',
} as const;

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  type: z.enum(MEDIA_TYPES).optional(),
  genre: z.string().trim().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(Object.keys(SORTS) as [keyof typeof SORTS, ...Array<keyof typeof SORTS>]).default('newest'),
});

// ---------- queries ----------

const ITEM_SELECT = `
  SELECT i.*,
         m.name  AS suggested_by_name,
         m.color AS suggested_by_color,
         (SELECT ROUND(AVG(r.stars), 2) FROM reviews r WHERE r.item_id = i.id AND r.stars IS NOT NULL) AS avg_stars,
         (SELECT COUNT(*) FROM reviews r WHERE r.item_id = i.id) AS review_count
  FROM items i
  LEFT JOIN members m ON m.id = i.suggested_by`;

function parseId(raw: string | undefined, what = 'id'): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${what}`);
  return id;
}

/** Drop empty-string query params so `?genre=` means "no filter". */
function cleanQuery(query: Request['query']) {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => typeof v === 'string' && v.trim() !== ''));
}

export function createApp(db: DB) {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  const getItemRow = (id: number) => {
    const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`).get(id);
    if (!row) throw new HttpError(404, 'Title not found');
    return row;
  };

  const getItemDetail = (id: number) => ({
    ...getItemRow(id),
    reviews: db
      .prepare(
        `SELECT r.*, m.name AS member_name, m.color AS member_color
         FROM reviews r JOIN members m ON m.id = r.member_id
         WHERE r.item_id = ?
         ORDER BY r.updated_at DESC`,
      )
      .all(id),
  });

  const assertMember = (id: number | null | undefined) => {
    if (id == null) return;
    if (!db.prepare('SELECT 1 FROM members WHERE id = ?').get(id)) throw new HttpError(400, 'Unknown member');
  };

  // ----- members -----

  app.get('/api/members', (_req, res) => {
    res.json(db.prepare('SELECT * FROM members ORDER BY name COLLATE NOCASE').all());
  });

  app.post('/api/members', (req, res) => {
    const input = memberInput.parse(req.body);
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM members').get() as { n: number };
    const color = input.color ?? MEMBER_COLORS[n % MEMBER_COLORS.length];
    const { lastInsertRowid } = db.prepare('INSERT INTO members (name, color) VALUES (?, ?)').run(input.name, color);
    res.status(201).json(db.prepare('SELECT * FROM members WHERE id = ?').get(Number(lastInsertRowid)));
  });

  // ----- items -----

  app.get('/api/genres', (_req, res) => {
    const rows = db
      .prepare('SELECT DISTINCT genre FROM items ORDER BY genre COLLATE NOCASE')
      .all() as Array<{ genre: string }>;
    // de-duplicate case-insensitively ("sci-fi" vs "Sci-Fi")
    const seen = new Set<string>();
    res.json(rows.map((r) => r.genre).filter((g) => !seen.has(g.toLowerCase()) && seen.add(g.toLowerCase())));
  });

  app.get('/api/items', (req, res) => {
    const q = listQuery.parse(cleanQuery(req.query));
    const where: string[] = [];
    const params: Array<string | number> = [];
    if (q.status) { where.push('i.status = ?'); params.push(q.status); }
    if (q.type) { where.push('i.type = ?'); params.push(q.type); }
    if (q.genre) { where.push('i.genre = ? COLLATE NOCASE'); params.push(q.genre); }
    if (q.q) {
      where.push(`(i.title LIKE ? ESCAPE '\\' OR i.pitch LIKE ? ESCAPE '\\')`);
      const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like);
    }
    const sql = `${ITEM_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${SORTS[q.sort]}`;
    res.json(db.prepare(sql).all(...params));
  });

  app.get('/api/items/:id', (req, res) => {
    res.json(getItemDetail(parseId(req.params.id)));
  });

  app.post('/api/items', (req, res) => {
    const input = itemCreate.parse(req.body);
    assertMember(input.suggested_by);
    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO items (title, type, genre, runtime, pitch, status, suggested_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        input.title,
        input.type,
        input.genre,
        input.runtime ?? null,
        input.pitch ?? '',
        input.status ?? 'to_watch',
        input.suggested_by ?? null,
      );
    res.status(201).json(getItemDetail(Number(lastInsertRowid)));
  });

  app.patch('/api/items/:id', (req, res) => {
    const id = parseId(req.params.id);
    getItemRow(id);
    const input = itemPatch.parse(req.body);
    assertMember(input.suggested_by);

    const sets: string[] = [];
    const params: Array<string | number | null> = [];
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      sets.push(`${key} = ?`); // keys are whitelisted by the strict schema
      params.push(value as string | number | null);
    }
    sets.push(`updated_at = ${nowSql()}`);
    db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = ?`).run(...params, id);
    res.json(getItemDetail(id));
  });

  app.delete('/api/items/:id', (req, res) => {
    const id = parseId(req.params.id);
    const { changes } = db.prepare('DELETE FROM items WHERE id = ?').run(id);
    if (!changes) throw new HttpError(404, 'Title not found');
    res.status(204).end();
  });

  // ----- reviews (one per member per item) -----

  app.put('/api/items/:id/reviews/:memberId', (req, res) => {
    const id = parseId(req.params.id);
    const memberId = parseId(req.params.memberId, 'member id');
    getItemRow(id);
    assertMember(memberId);
    const input = reviewInput.parse(req.body);
    db.prepare(
      `INSERT INTO reviews (item_id, member_id, stars, comment) VALUES (?, ?, ?, ?)
       ON CONFLICT (item_id, member_id) DO UPDATE SET
         stars = excluded.stars, comment = excluded.comment, updated_at = ${nowSql()}`,
    ).run(id, memberId, input.stars ?? null, input.comment ?? '');
    res.json(getItemDetail(id));
  });

  app.delete('/api/items/:id/reviews/:memberId', (req, res) => {
    const id = parseId(req.params.id);
    const memberId = parseId(req.params.memberId, 'member id');
    const { changes } = db.prepare('DELETE FROM reviews WHERE item_id = ? AND member_id = ?').run(id, memberId);
    if (!changes) throw new HttpError(404, 'Review not found');
    res.json(getItemDetail(id));
  });

  // ----- fallbacks -----

  app.use('/api', (_req, _res) => {
    throw new HttpError(404, 'Not found');
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: err.issues.map((i) => i.message).join('; '), issues: err.issues });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    const e = err as { type?: string; message?: string };
    if (e?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body is not valid JSON' });
      return;
    }
    if (typeof e?.message === 'string' && e.message.includes('UNIQUE constraint failed: members.name')) {
      res.status(409).json({ error: 'A member with that name already exists' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
