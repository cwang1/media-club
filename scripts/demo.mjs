// Records a narrated walkthrough of Media Club's main features.
//
//   npm run demo            (builds the client first)
//
// Starts the app on a throwaway database, drives your installed Chrome (or Edge)
// with Playwright, and writes:
//   demo/media-club-demo.webm   the video
//   demo/screenshots/*.png      a still for each step
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'demo');
const shotsDir = path.join(outDir, 'screenshots');
const videoTmp = path.join(outDir, '.video-tmp');
const PORT = Number(process.env.DEMO_PORT ?? 3105);
const BASE = `http://localhost:${PORT}`;
const SIZE = { width: 1280, height: 800 };

// ---------- start the app on a fresh database ----------

const dbDir = mkdtempSync(path.join(tmpdir(), 'media-club-demo-'));
const server = spawn(process.execPath, ['--no-warnings', '--import', 'tsx', 'src/index.ts'], {
  cwd: path.join(root, 'server'),
  env: { ...process.env, API_PORT: String(PORT), DB_FILE: path.join(dbDir, 'demo.db') },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  server.on('exit', (code) => reject(new Error(`server exited early (${code})`)));
  server.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
});

// ---------- browser with a visible cursor and caption bar ----------

rmSync(outDir, { recursive: true, force: true });
mkdirSync(shotsDir, { recursive: true });

const browser = await launch();
const context = await browser.newContext({
  viewport: SIZE,
  deviceScaleFactor: 1,
  colorScheme: 'light',
  recordVideo: { dir: videoTmp, size: SIZE },
});
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
      #demo-cursor { position: fixed; z-index: 99999; width: 22px; height: 22px; margin: -4px 0 0 -4px;
        pointer-events: none; transition: transform .12s; left: -50px; top: -50px; }
      #demo-cursor.down { transform: scale(.8); }
      #demo-caption { position: fixed; z-index: 99998; left: 50%; bottom: 84px; transform: translateX(-50%);
        max-width: 80%; padding: 14px 26px; border-radius: 14px; background: rgba(20,18,15,.88); color: #fff;
        font: 600 20px/1.35 system-ui, 'Segoe UI', sans-serif; text-align: center; pointer-events: none;
        box-shadow: 0 10px 30px rgba(0,0,0,.3); opacity: 0; transition: opacity .3s; }
      #demo-caption small { display: block; font-weight: 400; font-size: 15px; opacity: .8; margin-top: 4px; }
      #demo-caption.show { opacity: 1; }
      #demo-title { position: fixed; inset: 0; z-index: 99997; display: flex; flex-direction: column;
        align-items: center; justify-content: center; gap: 12px; background: #1f1d1a; color: #fff;
        font-family: system-ui, 'Segoe UI', sans-serif; transition: opacity .6s; }
      #demo-title h1 { font-size: 56px; margin: 0; } #demo-title p { font-size: 22px; opacity: .75; margin: 0; }`;
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l16 10-7 1.5L9.5 21z"
      fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    document.body.append(cursor, caption);
    addEventListener(
      'mousemove',
      (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      },
      true,
    );
    addEventListener('mousedown', () => cursor.classList.add('down'), true);
    addEventListener('mouseup', () => cursor.classList.remove('down'), true);
  });
});

const page = await context.newPage();
let shot = 0;
const wait = (ms) => page.waitForTimeout(ms);

async function caption(title, sub = '') {
  await page.evaluate(
    ([t, s]) => {
      const el = document.getElementById('demo-caption');
      el.innerHTML = t ? `${t}${s ? `<small>${s}</small>` : ''}` : '';
      el.classList.toggle('show', !!t);
    },
    [title, sub],
  );
  await wait(title ? 1600 : 300);
}

async function snap(name) {
  shot += 1;
  await page.screenshot({ path: path.join(shotsDir, `${String(shot).padStart(2, '0')}-${name}.png`) });
}

async function moveTo(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await wait(250);
}

async function click(locator, pause = 600) {
  await moveTo(locator);
  await locator.click();
  await wait(pause);
}

async function type(locator, text) {
  await click(locator, 150);
  await locator.pressSequentially(text, { delay: 45 });
  await wait(300);
}

async function select(locator, value) {
  await moveTo(locator);
  await locator.selectOption(value);
  await wait(900);
}

const dialog = () => page.getByRole('dialog').last();
const card = (title) => page.locator('article.card', { hasText: title });

// ---------- the walkthrough ----------

await page.goto(BASE);
await page.evaluate(() => {
  const t = document.createElement('div');
  t.id = 'demo-title';
  t.innerHTML =
    '<div style="font-size:72px">🍿</div><h1>Media Club</h1><p>A shared watchlist for a circle of friends</p>';
  document.body.append(t);
});
await wait(2500);
await page.evaluate(() => {
  const t = document.getElementById('demo-title');
  t.style.opacity = '0';
  setTimeout(() => t.remove(), 700);
});
await wait(800);

// Who's watching
await caption('First, pick who you are', 'No passwords: claiming your name gives this browser a private key');
await snap('pick-member');
await click(dialog().locator('.member-choice', { hasText: 'Ana' }), 900);
await caption('');

// Read: browse the queue
await caption('READ: browse the shared queue', 'Tabs show what is up next, in progress, and finished');
await snap('queue');
await click(page.locator('.tab', { hasText: 'Watching' }), 1000);
await click(page.locator('.tab', { hasText: 'Completed' }), 1200);
await snap('completed');
await click(page.locator('.tab', { hasText: 'All' }), 900);

await caption('Filter by type or genre, and sort', 'Here: Sci-Fi, highest rated first');
await select(page.getByLabel('Genre', { exact: true }), 'Sci-Fi');
await select(page.getByLabel('Sort by'), 'rating');
await snap('filter-sort');
await select(page.getByLabel('Sort by'), 'runtime_asc');
await caption('Sort by runtime', 'Books (pages) and screen time (minutes) stay grouped');
await select(page.getByLabel('Genre', { exact: true }), '');
await click(page.getByRole('button', { name: '📖 Books' }), 1000);
await click(page.getByRole('button', { name: 'All types' }), 600);
await select(page.getByLabel('Sort by'), 'newest');

await caption('Open a title to read the group’s reviews');
await click(card('Paddington 2').locator('h3'), 1800);
await snap('reviews');
await page.mouse.wheel(0, 400);
await wait(1500);
await click(dialog().getByRole('button', { name: 'Close' }), 600);

// Create
await caption('CREATE: suggest something new', 'Add a title, genre, length and a short pitch');
await click(page.getByRole('button', { name: '+ Suggest' }), 800);
const form = dialog();
await click(form.locator('.segmented label', { hasText: 'Show' }), 400);
await type(form.getByLabel('Title'), 'Andor');
await type(form.getByLabel('Genre'), 'Sci-Fi');
await type(form.getByLabel(/minutes/), '45');
await type(
  form.getByLabel(/Pitch/),
  'A slow-burn spy thriller set in a galaxy far away. Season one ends with an all-timer of a speech.',
);
await snap('suggest-form');
await click(form.getByRole('button', { name: 'Add to backlog' }), 1500);
await snap('created');

// Update: status
await caption('UPDATE: move it along', 'Change status right from the card');
await select(page.getByLabel('Status of Andor'), 'watching');
await wait(600);
await click(page.locator('.tab', { hasText: 'Watching' }), 1400);
await snap('status-watching');

// Update: rate & review
await caption('Finished something? Mark it Completed and rate it');
await click(page.locator('.tab', { hasText: 'To Watch' }), 800);
await click(card('Spirited Away').locator('h3'), 1200);
await click(dialog().getByRole('button', { name: 'Completed', exact: true }), 1000);
await click(dialog().getByRole('radio', { name: '5 stars' }), 600);
await type(dialog().getByLabel('Your comment'), 'Even better than everyone said. The train scene!');
await click(dialog().getByRole('button', { name: 'Post review' }), 1600);
await snap('review-posted');

await caption('Edit details any time');
await click(dialog().getByRole('button', { name: /Edit details/ }), 900);
const edit = dialog();
await edit.getByLabel(/minutes/).fill('');
await type(edit.getByLabel(/minutes/), '124');
await click(edit.getByRole('button', { name: 'Save changes' }), 1300);
await click(dialog().getByRole('button', { name: 'Close' }), 600);

// Delete
await caption('DELETE: skip titles the group passes on');
await click(page.locator('.tab', { hasText: 'To Watch' }), 800);
await click(card('Arrival').locator('h3'), 1200);
await click(dialog().getByRole('button', { name: /Skip this title/ }), 1000);
await snap('skip-confirm');
await click(dialog().getByRole('button', { name: 'Skip it' }), 1600);
await snap('skipped');

await caption('That’s Media Club', 'Suggest · browse · track · rate · skip');
await wait(1800);

// ---------- save ----------

const video = page.video();
await context.close();
await browser.close();
renameSync(await video.path(), path.join(outDir, 'media-club-demo.webm'));
rmSync(videoTmp, { recursive: true, force: true });
server.removeAllListeners('exit');
await new Promise((resolve) => {
  server.once('exit', resolve);
  server.kill();
});
try {
  rmSync(dbDir, { recursive: true, force: true });
} catch {
  /* Windows may hold the file briefly; it's in the temp folder anyway */
}
console.log(`Saved demo/media-club-demo.webm and ${readdirSync(shotsDir).length} screenshots in demo/screenshots/`);

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try the next one */
    }
  }
  throw new Error('Could not find Chrome or Edge to record with.');
}
