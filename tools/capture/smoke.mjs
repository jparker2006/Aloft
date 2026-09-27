// Runs the WebGPU smoke page in headless Chromium and saves a screenshot.
// Usage: node tools/capture/smoke.mjs [outPng]
import { createServer } from 'vite';
import { launchBrowser } from './browser.mjs';
import { COMPAT_INIT_SCRIPT } from './compat.mjs';

const out = process.argv[2] ?? 'captures/smoke.png';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const { port } = server.httpServer.address();
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.addInitScript(COMPAT_INIT_SCRIPT);
  page.on('console', (m) => console.log(`[page] ${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => console.log(`[page] error: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}/tools/capture/smoke/index.html`);
  await page.waitForFunction(() => window.__smoke !== undefined, null, { timeout: 120000 });
  const result = await page.evaluate(() => window.__smoke);
  console.log('[smoke]', JSON.stringify(result));
  await page.screenshot({ path: out });
  console.log('[smoke] screenshot', out);
  if (!result.ok) process.exitCode = 1;
} finally {
  await browser.close();
  await server.close();
}
