import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

let server: Server;
let base: string;

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
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
  let ben: number;
  let dune: number;

  test('creates members and rejects duplicates', async () => {
    const a = await api('POST', '/api/members', { name: 'Ana' });
    assert.equal(a.status, 201);
    assert.match(a.body.color, /^#[0-9a-f]{6}$/i);
    ana = a.body.id;
    ben = (await api('POST', '/api/members', { name: 'Ben' })).body.id;

    const dup = await api('POST', '/api/members', { name: 'ana' });
    assert.equal(dup.status, 409);
  });

  test('creates an item with a pitch (Create)', async () => {
    const res = await api('POST', '/api/items', {
      title: 'Dune', type: 'movie', genre: 'Sci-Fi', runtime: 155, pitch: 'Sand and worms.', suggested_by: ana,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'to_watch');
    assert.equal(res.body.suggested_by_name, 'Ana');
    assert.deepEqual(res.body.reviews, []);
    dune = res.body.id;

    await api('POST', '/api/items', { title: 'Piranesi', type: 'book', genre: 'Fantasy', runtime: 272 });
    await api('POST', '/api/items', { title: 'Severance', type: 'show', genre: 'thriller', runtime: 50 });
    await api('POST', '/api/items', { title: 'Short Film', type: 'movie', genre: 'Drama', runtime: 20 });
  });

  test('validates item input', async () => {
    const res = await api('POST', '/api/items', { title: '  ', type: 'podcast', genre: 'x', runtime: -5 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Title is required/);
    assert.match(res.body.error, /Type must be/);
    assert.match(res.body.error, /Runtime must be greater than 0/);

    const longPitch = await api('POST', '/api/items', { title: 'X', type: 'movie', genre: 'x', pitch: 'a'.repeat(281) });
    assert.equal(longPitch.status, 400);

    const badMember = await api('POST', '/api/items', { title: 'X', type: 'movie', genre: 'x', suggested_by: 999 });
    assert.equal(badMember.status, 400);
  });

  test('lists, filters and sorts the queue (Read)', async () => {
    const all = await api('GET', '/api/items');
    assert.equal(all.body.length, 4);

    const movies = await api('GET', '/api/items?type=movie&sort=runtime_asc');
    assert.deepEqual(movies.body.map((i: { title: string }) => i.title), ['Short Film', 'Dune']);

    const byGenre = await api('GET', '/api/items?sort=genre');
    assert.deepEqual(byGenre.body.map((i: { genre: string }) => i.genre), ['Drama', 'Fantasy', 'Sci-Fi', 'thriller']);

    const genre = await api('GET', '/api/items?genre=sci-fi');
    assert.equal(genre.body.length, 1);

    const search = await api('GET', '/api/items?q=worm');
    assert.equal(search.body[0].title, 'Dune');

    const genres = await api('GET', '/api/genres');
    assert.deepEqual(genres.body, ['Drama', 'Fantasy', 'Sci-Fi', 'thriller']);

    const bad = await api('GET', '/api/items?sort=nope');
    assert.equal(bad.status, 400);
  });

  test('moves status and edits fields (Update)', async () => {
    const watching = await api('PATCH', `/api/items/${dune}`, { status: 'watching' });
    assert.equal(watching.status, 200);
    assert.equal(watching.body.status, 'watching');

    const done = await api('PATCH', `/api/items/${dune}`, { status: 'completed', runtime: 166 });
    assert.equal(done.body.status, 'completed');
    assert.equal(done.body.runtime, 166);
    assert.equal(done.body.title, 'Dune');

    assert.equal((await api('PATCH', `/api/items/${dune}`, { status: 'paused' })).status, 400);
    assert.equal((await api('PATCH', `/api/items/${dune}`, {})).status, 400);
    assert.equal((await api('PATCH', `/api/items/${dune}`, { id: 5 })).status, 400);
    assert.equal((await api('PATCH', '/api/items/9999', { status: 'watching' })).status, 404);
  });

  test('adds, updates and removes personal reviews', async () => {
    let res = await api('PUT', `/api/items/${dune}/reviews/${ana}`, { stars: 5, comment: 'Loved it' });
    assert.equal(res.status, 200);
    res = await api('PUT', `/api/items/${dune}/reviews/${ben}`, { stars: 4 });
    assert.equal(res.body.review_count, 2);
    assert.equal(res.body.avg_stars, 4.5);

    // updating replaces rather than duplicating
    res = await api('PUT', `/api/items/${dune}/reviews/${ana}`, { stars: 3, comment: 'Second thoughts' });
    assert.equal(res.body.review_count, 2);
    assert.equal(res.body.avg_stars, 3.5);
    const anaReview = res.body.reviews.find((r: { member_id: number }) => r.member_id === ana);
    assert.equal(anaReview.comment, 'Second thoughts');
    assert.equal(anaReview.member_name, 'Ana');

    // comment-only review is allowed; empty review is not; stars must be 1-5
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/${ben}`, { comment: 'Hmm' })).status, 200);
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/${ben}`, {})).status, 400);
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/${ben}`, { stars: 6 })).status, 400);
    assert.equal((await api('PUT', `/api/items/${dune}/reviews/999`, { stars: 3 })).status, 400);

    const sorted = await api('GET', '/api/items?sort=rating');
    assert.equal(sorted.body[0].title, 'Dune');

    res = await api('DELETE', `/api/items/${dune}/reviews/${ben}`);
    assert.equal(res.body.review_count, 1);
    assert.equal((await api('DELETE', `/api/items/${dune}/reviews/${ben}`)).status, 404);
  });

  test('deletes a skipped title and its reviews (Delete)', async () => {
    assert.equal((await api('DELETE', `/api/items/${dune}`)).status, 204);
    assert.equal((await api('GET', `/api/items/${dune}`)).status, 404);
    assert.equal((await api('DELETE', `/api/items/${dune}`)).status, 404);
    assert.equal((await api('GET', '/api/items')).body.length, 3);
  });

  test('returns JSON errors for bad input', async () => {
    assert.equal((await api('GET', '/api/items/abc')).status, 400);
    assert.equal((await api('GET', '/api/nope')).status, 404);
    const res = await fetch(`${base}/api/items`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops',
    });
    assert.equal(res.status, 400);
  });
});
