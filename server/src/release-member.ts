// Frees a member's profile so it can be claimed again, e.g. after they lose their only device.
//   npm run release-member -- "Ana"
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run release-member -- "<member name>"');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const db = openDb(process.env.DB_FILE ?? path.resolve(here, '../data/club.db'));
const { changes } = db.prepare('UPDATE members SET token_hash = NULL WHERE name = ? COLLATE NOCASE').run(name);
console.log(
  changes ? `Released "${name}". They can pick their name again on any device.` : `No member named "${name}".`,
);
