import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

let server: Server;
let base: string;

interface Res {
  status: number;
  body: any;
}

async function api(method: string, path: string, body?: unknown, token?: string): Promise<Res> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
}

before(async () => {
  const app = createApp(openDb(':memory:'));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('Media Club API', () => {
  let ana: number;
  let anaKey: string;
  let ben: number;
  let benKey: string;
  let dune: number;

  test('joining returns a member and a private key', async () => {
    const a = await api('POST', '/api/members', { name: 'Ana' });
    assert.equal(a.status, 201);
    assert.match(a.body.member.color, /^#[0-9a-f]{6}$/i);
    assert.equal(a.body.member.claimed, true);
    assert.equal(typeof a.body.token, 'string');
    ana = a.body.member.id;
    anaKey = a.body.token;

    const b = await api('POST', '/api/members', { name: 'Ben' });
    ben = b.body.member.id;
    benKey = b.body.token;

    assert.equal((await api('POST', '/api/members', { name: 'ana' })).status, 409);
  });

  test('member listings never expose keys', async () => {
    const res = await api('GET', '/api/members');
    assert.equal(res.body.length, 2);
    for (const m of res.body) {
      assert.deepEqual(Object.keys(m).sort(), ['claimed', 'color', 'created_at', 'id', 'name']);
    }
  });

  test('/api/me identifies the caller', async () => {
    assert.equal((await api('GET', '/api/me', undefined, anaKey)).body.name, 'Ana');
    assert.equal((await api('GET', '/api/me')).status, 401);
    assert.equal((await api('GET', '/api/me', undefined, 'not-a-real-key')).status, 401);
  });

  test('profiles can be claimed once, and released', async () => {
    // simulate a seeded profile that no device holds yet
    const { body } = await api('POST', '/api/members', { name: 'Chloe' });
    const chloe = body.member.id as number;
    assert.equal((await api('POST', '/api/me/release', undefined, body.token as string)).status, 204);
    assert.equal((await api('GET', '/api/me', undefined, body.token as string)).status, 401);

    const claimed = await api('POST', `/api/members/${chloe}/claim`);
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.member.name, 'Chloe');
    assert.equal((await api('GET', '/api/me', undefined, claimed.body.token as string)).body.id, chloe);

    // a second device can't take it over
    assert.equal((await api('POST', `/api/members/${chloe}/claim`)).status, 409);
    assert.equal((await api('POST', `/api/members/${ana}/claim`)).status, 409);
    assert.equal((await api('POST', '/api/members/999/claim')).status, 404);
  });

  test('creates an item credited to the caller (Create)', async () => {
    const res = await api(
      'POST',
      '/api/items',
      { title: 'Dune', type: 'movie', genre: 'Sci-Fi', runtime: 155, pitch: 'Sand and worms.' },
      anaKey,
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'to_watch');
    assert.equal(res.body.suggested_by_name, 'Ana');
    assert.deepEqual(res.body.reviews, []);
    dune = res.body.id;

    await api('POST', '/api/items', { title: 'Piranesi', type: 'book', genre: 'Fantasy', runtime: 272 }, benKey);
    await api('POST', '/api/items', { title: 'Severance', type: 'show', genre: 'thriller', runtime: 50 }, benKey);
    await api('POST', '/api/items', { title: 'Short Film', type: 'movie', genre: 'Drama', runtime: 20 }, benKey);
  });

  test('suggested_by cannot be forged', async () => {
    const res = await api('POST', '/api/items', { title: 'X', type: 'movie', genre: 'x', suggested_by: ana }, benKey);
    assert.equal(res.status, 201);
    assert.equal(res.body.suggested_by, ben);
    await api('DELETE', `/api/items/${res.body.id}`, undefined, benKey);

    assert.equal((await api('PATCH', `/api/items/${dune}`, { suggested_by: ben }, benKey)).status, 400);
  });

  test('writes require a member', async () => {
    const item = { title: 'X', type: 'movie', genre: 'x' };
    assert.equal((await api('POST', '/api/items', item)).status, 401);
    assert.equal((await api('PATCH', `/api/items/${dune}`, { status: 'watching' })).status, 401);
    assert.equal((await api('DELETE', `/api/items/${dune}`)).status, 401);
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/${ana}`, { stars: 5 })).status, 401);
  });

  test('validates item input', async () => {
    const res = await api('POST', '/api/items', { title: '  ', type: 'podcast', genre: 'x', runtime: -5 }, anaKey);
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Title is required/);
    assert.match(res.body.error, /Type must be/);
    assert.match(res.body.error, /Runtime must be greater than 0/);

    const longPitch = { title: 'X', type: 'movie', genre: 'x', pitch: 'a'.repeat(281) };
    assert.equal((await api('POST', '/api/items', longPitch, anaKey)).status, 400);
  });

  test('lists, filters and sorts the queue (Read)', async () => {
    const all = await api('GET', '/api/items');
    assert.equal(all.body.length, 4);

    const movies = await api('GET', '/api/items?type=movie&sort=runtime_asc');
    assert.deepEqual(
      movies.body.map((i: { title: string }) => i.title),
      ['Short Film', 'Dune'],
    );

    const byGenre = await api('GET', '/api/items?sort=genre');
    assert.deepEqual(
      byGenre.body.map((i: { genre: string }) => i.genre),
      ['Drama', 'Fantasy', 'Sci-Fi', 'thriller'],
    );

    assert.equal((await api('GET', '/api/items?genre=sci-fi')).body.length, 1);
    assert.equal((await api('GET', '/api/items?q=worm')).body[0].title, 'Dune');
    assert.deepEqual((await api('GET', '/api/genres')).body, ['Drama', 'Fantasy', 'Sci-Fi', 'thriller']);
    assert.equal((await api('GET', '/api/items?sort=nope')).status, 400);
  });

  test('moves status and edits fields (Update)', async () => {
    const watching = await api('PATCH', `/api/items/${dune}`, { status: 'watching' }, benKey);
    assert.equal(watching.status, 200);
    assert.equal(watching.body.status, 'watching');

    const done = await api('PATCH', `/api/items/${dune}`, { status: 'completed', runtime: 166 }, anaKey);
    assert.equal(done.body.status, 'completed');
    assert.equal(done.body.runtime, 166);
    assert.equal(done.body.title, 'Dune');

    assert.equal((await api('PATCH', `/api/items/${dune}`, { status: 'paused' }, anaKey)).status, 400);
    assert.equal((await api('PATCH', `/api/items/${dune}`, {}, anaKey)).status, 400);
    assert.equal((await api('PATCH', `/api/items/${dune}`, { id: 5 }, anaKey)).status, 400);
    assert.equal((await api('PATCH', '/api/items/9999', { status: 'watching' }, anaKey)).status, 404);
  });

  test('members add, update and remove only their own reviews', async () => {
    let res = await api('PUT', `/api/items/${dune}/reviews/${ana}`, { stars: 5, comment: 'Loved it' }, anaKey);
    assert.equal(res.status, 200);
    res = await api('PUT', `/api/items/${dune}/reviews/${ben}`, { stars: 4 }, benKey);
    assert.equal(res.body.review_count, 2);
    assert.equal(res.body.avg_stars, 4.5);

    // updating replaces rather than duplicating
    res = await api('PUT', `/api/items/${dune}/reviews/${ana}`, { stars: 3, comment: 'Second thoughts' }, anaKey);
    assert.equal(res.body.review_count, 2);
    assert.equal(res.body.avg_stars, 3.5);
    const anaReview = res.body.reviews.find((r: { member_id: number }) => r.member_id === ana);
    assert.equal(anaReview.comment, 'Second thoughts');
    assert.equal(anaReview.member_name, 'Ana');

    // Ben can't overwrite or delete Ana's review
    const forged = await api('PUT', `/api/items/${dune}/reviews/${ana}`, { stars: 1, comment: 'I hated it' }, benKey);
    assert.equal(forged.status, 403);
    assert.equal((await api('DELETE', `/api/items/${dune}/reviews/${ana}`, undefined, benKey)).status, 403);
    const after = await api('GET', `/api/items/${dune}`);
    const stillAna = after.body.reviews.find((r: { member_id: number }) => r.member_id === ana);
    assert.equal(stillAna.stars, 3);
    assert.equal(stillAna.comment, 'Second thoughts');

    // comment-only review is allowed; empty review is not; stars must be 1-5
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/${ben}`, { comment: 'Hmm' }, benKey)).status, 200);
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/${ben}`, {}, benKey)).status, 400);
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/${ben}`, { stars: 6 }, benKey)).status, 400);

    assert.equal((await api('GET', '/api/items?sort=rating')).body[0].title, 'Dune');

    res = await api('DELETE', `/api/items/${dune}/reviews/${ben}`, undefined, benKey);
    assert.equal(res.body.review_count, 1);
    assert.equal((await api('DELETE', `/api/items/${dune}/reviews/${ben}`, undefined, benKey)).status, 404);
  });

  test('deletes a skipped title and its reviews (Delete)', async () => {
    assert.equal((await api('DELETE', `/api/items/${dune}`, undefined, benKey)).status, 204);
    assert.equal((await api('GET', `/api/items/${dune}`)).status, 404);
    assert.equal((await api('DELETE', `/api/items/${dune}`, undefined, benKey)).status, 404);
    assert.equal((await api('GET', '/api/items')).body.length, 3);
  });

  test('returns JSON errors for bad input', async () => {
    assert.equal((await api('GET', '/api/items/abc')).status, 400);
    assert.equal((await api('GET', '/api/nope')).status, 404);
    const res = await fetch(`${base}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anaKey}` },
      body: '{oops',
    });
    assert.equal(res.status, 400);
  });
});
