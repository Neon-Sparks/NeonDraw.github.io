// Run Neon Sparks Draw's self tests in headless Chromium and fail if anything breaks.
// Used by the GitHub Actions workflow; you can run it locally too:
//   npm install
//   npx playwright install chromium
//   npm test
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

// tiny static server for the repository folder
const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.join(root, rel.endsWith('/') ? rel + 'index.html' : rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
let failed = false;
try {
  // 1. the self tests
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/tests/tests.html');
  await page.waitForFunction(() => /passed/.test(document.getElementById('sum').textContent), null, { timeout: 180000 });
  const summary = (await page.textContent('#sum')).trim();
  const rows = await page.$$eval('#out li', (lis) => lis.map((li) => li.textContent.trim()));
  rows.forEach((r) => console.log(r));
  console.log('\n' + summary);
  if (!/ 0 failed/.test(summary)) failed = true;
  if (errors.length) { console.log('Page errors:\n' + errors.join('\n')); failed = true; }

  // 2. the app itself starts without errors
  const app = await browser.newPage();
  const appErrors = [];
  app.on('pageerror', (e) => appErrors.push(e.message));
  await app.goto(base + '/index.html');
  await app.waitForFunction(() => window.ND && ND.App && ND.App.doc && !document.body.classList.contains('nd-loading'), null, { timeout: 60000 });
  if (appErrors.length) { console.log('App errors:\n' + appErrors.join('\n')); failed = true; } else console.log('App starts cleanly');
} catch (e) {
  console.error(e);
  failed = true;
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
