// Runs tests/gpu in headless Chromium with WebGPU and reports failures (npm run test:gpu).
import { createServer } from 'vite';
import { launchBrowser } from './browser.mjs';
import { COMPAT_INIT_SCRIPT } from './compat.mjs';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const { port } = server.httpServer.address();
const browser = await launchBrowser();
let failed = 0;
try {
  const page = await browser.newPage();
  await page.addInitScript(COMPAT_INIT_SCRIPT);
  page.on('pageerror', (e) => console.log(`[page] error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && console.log(`[page] ${m.text()}`));
  await page.goto(`http://127.0.0.1:${port}/tests/gpu/index.html`);
  await page.waitForFunction(() => window.__gpuTestsDone === true, null, { timeout: 300000 });
  const results = await page.evaluate(() => window.__gpuTests);
  for (const r of results) {
    const ok = r.failures.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${r.name}: ${r.detail}`);
    for (const f of r.failures) console.log(`    ${f}`);
  }
} finally {
  await browser.close();
  await server.close();
}
process.exitCode = failed ? 1 : 0;
