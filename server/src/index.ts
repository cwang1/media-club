import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { openDb } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DB_FILE ?? path.resolve(here, '../data/club.db');
// API_PORT (not PORT) so tools that set PORT for the web dev server don't collide with the API.
const port = Number(process.env.API_PORT ?? 3001);

const db = openDb(dbFile, { seed: true });
const app = createApp(db);

// In production (`npm start`), serve the built React app from the same server.
const dist = path.resolve(here, '../../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(port, () => {
  console.log(`Media Club API listening on http://localhost:${port} (db: ${dbFile})`);
});
