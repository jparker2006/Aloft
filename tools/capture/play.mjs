// Plays the live game (not shot mode) at a simulated 60 fps and screenshots bookmarks (npm run play).
// Stills freeze time, so anything temporal (TAA history, motion blur, moving particles, the free camera
// riding the waves) only shows here. The loop is stopped and stepped with fixed 1/60 s frames, each synced
// to the GPU queue, so a slow software GPU still sees the frame-to-frame motion a 60 fps player sees.
// Usage: node tools/capture/play.mjs [outPrefix] [frames] [query] [Key:name,...]
import { createServer } from 'vite';
import { launchBrowser } from './browser.mjs';
import { COMPAT_INIT_SCRIPT } from './compat.mjs';
const out = process.argv[2] ?? 'captures/play';
const frames = Number(process.argv[3] ?? 40);
const query = process.argv[4] ?? '';
const only = (process.argv[5] ?? 'Digit1:sea_low,Digit2:sea_high,Digit4:storm_sky')
  .split(',')
  .map((p) => p.split(':'));
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const { port } = server.httpServer.address();
const browser = await launchBrowser();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(COMPAT_INIT_SCRIPT);
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  await page.waitForSelector('.notice button', { timeout: 300000 });
  await page.click('.notice button');
  await page.waitForSelector('.help', { timeout: 60000 });
  await page.evaluate(() => document.querySelector('.help')?.remove());
  await page.evaluate(() => window.__app.stop());
  const step = (n) =>
    page.evaluate(async (n) => {
      const device = window.__app.renderer.backend.device;
      for (let i = 0; i < n; i++) {
        window.__app.frame(1 / 60);
        await device.queue.onSubmittedWorkDone();
      }
    }, n);
  for (const [key, name] of only) {
    await page.keyboard.press(key);
    await step(frames);
    await page.screenshot({ path: `${out}-${name}.png`, timeout: 300000 });
    console.log('shot', name);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no console errors');
