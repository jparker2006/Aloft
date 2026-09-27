// Capture loop (SPEC section 15): renders every bookmark at every preset through shot mode, pairs each
// capture with its reference image, diffs against committed baselines and builds a contact sheet.
//
// Usage: npm run capture -- [options]
//   --bookmarks a,b     bookmarks to capture (default: all bookmarks up to --milestone)
//   --presets a,b       presets to capture (default: dusk,night)
//   --milestone n       highest milestone whose bookmarks are included (default: 1)
//   --flash t           seconds into the strike for night mid-flash frames (default: 0.05)
//   --no-flash          skip mid-flash frames
//   --seed n            run seed (default: 1)
//   --extra k=v&k2      extra query string appended to every shot URL (A/B flags)
//   --run name          output folder name under captures/ (default: a timestamp)
//   --update-baseline   write these captures as the new baselines
//   --critique id       write docs/critiques/<id>.jpg (sheet) and a <id>.md template if missing
//   --root dir          serve the app from a snapshot of the tree (see npm run capture:snapshot), so the
//                       working tree can keep changing while a slow capture runs
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer } from 'vite';
import { launchBrowser } from './browser.mjs';
import { COMPAT_INIT_SCRIPT } from './compat.mjs';
import { imageStats, readImage, resizeToWidth, ssim, writePng } from './image.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const VIEWPORT = { width: 1536, height: 1024 };
const BASELINE_WIDTH = 768;
const SSIM_THRESHOLD = 0.97;
const SHOT_TIMEOUT_MS = 20 * 60 * 1000;

const { values: args } = parseArgs({
  options: {
    bookmarks: { type: 'string' },
    presets: { type: 'string', default: 'dusk,night' },
    milestone: { type: 'string', default: '1' },
    flash: { type: 'string', default: '0.05' },
    'no-flash': { type: 'boolean', default: false },
    seed: { type: 'string', default: '1' },
    extra: { type: 'string', default: '' },
    run: { type: 'string' },
    'update-baseline': { type: 'boolean', default: false },
    critique: { type: 'string' },
    root: { type: 'string' },
  },
});
const SERVE_ROOT = args.root ? resolve(args.root) : ROOT;

const runName = args.run ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(ROOT, 'captures', runName);
mkdirSync(outDir, { recursive: true });

const server = await createServer({
  root: SERVE_ROOT,
  configFile: join(SERVE_ROOT, 'vite.config.ts'),
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
await server.listen();
const { port } = server.httpServer.address();
const base = `http://127.0.0.1:${port}`;

const { BOOKMARKS } = await server.ssrLoadModule('/src/shots.ts');
const milestone = Number(args.milestone);
const bookmarkNames = args.bookmarks
  ? args.bookmarks.split(',')
  : Object.values(BOOKMARKS)
      .filter((b) => b.milestone <= milestone)
      .map((b) => b.name);
for (const name of bookmarkNames) if (!BOOKMARKS[name]) throw new Error(`unknown bookmark ${name}`);
const presets = args.presets.split(',');

/** @type {{ id: string, bookmark: string, preset: string, flash: number | null }[]} */
const jobs = [];
for (const bookmark of bookmarkNames) {
  for (const preset of presets) {
    jobs.push({ id: `${preset}__${bookmark}`, bookmark, preset, flash: null });
    if (preset === 'night' && !args['no-flash']) {
      jobs.push({ id: `${preset}__${bookmark}__flash`, bookmark, preset, flash: Number(args.flash) });
    }
  }
}

const browser = await launchBrowser();
const results = [];
try {
  for (const job of jobs) {
    const started = Date.now();
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    await page.addInitScript(COMPAT_INIT_SCRIPT);
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));

    const q = new URLSearchParams({ shot: job.bookmark, preset: job.preset, seed: args.seed });
    if (job.flash !== null) q.set('flash', String(job.flash));
    const url = `${base}/?${q}${args.extra ? `&${args.extra}` : ''}`;
    process.stdout.write(`[capture] ${job.id} ... `);
    await page.goto(url);
    await page.waitForFunction(() => window.__shotReady === true || window.__shotError !== undefined, null, {
      timeout: SHOT_TIMEOUT_MS,
      polling: 500,
    });
    const shotError = await page.evaluate(() => window.__shotError);
    if (shotError) errors.push(shotError);
    const info = await page.evaluate(() => window.__shotInfo ?? null);
    const file = join(outDir, `${job.id}.png`);
    await page.screenshot({ path: file, type: 'png' });
    await page.close();

    const img = readImage(file);
    const small = resizeToWidth(img, BASELINE_WIDTH);
    const result = { ...job, file: `${job.id}.png`, seconds: (Date.now() - started) / 1000, info, errors };
    result.stats = imageStats(small);

    const refPath = join(ROOT, 'references', `${job.id}.jpg`);
    if (existsSync(refPath)) {
      result.reference = refPath;
      result.referenceStats = imageStats(resizeToWidth(readImage(refPath), BASELINE_WIDTH));
    }

    const baselinePath = join(ROOT, 'tests/visual/baseline', `${job.id}.png`);
    if (args['update-baseline']) {
      mkdirSync(join(ROOT, 'tests/visual/baseline'), { recursive: true });
      writePng(baselinePath, small);
      result.baseline = 'updated';
    } else if (existsSync(baselinePath)) {
      const baseline = readImage(baselinePath);
      result.ssim = baseline.width === small.width ? +ssim(small, baseline).toFixed(4) : 0;
      result.baseline = result.ssim < SSIM_THRESHOLD ? 'changed' : 'same';
    } else {
      result.baseline = 'none';
    }
    results.push(result);
    console.log(
      `${result.seconds.toFixed(0)} s, baseline ${result.baseline}${result.ssim !== undefined ? ` (ssim ${result.ssim})` : ''}` +
        (errors.length ? `, ${errors.length} error(s)` : ''),
    );
    for (const e of errors) console.log(`    error: ${e.split('\n')[0]}`);
  }
} finally {
  await browser.close();
}

// Contact sheet: capture | reference, with value statistics under each pair.
const fmt = (s) =>
  s
    ? `mean ${s.mean} &middot; p05 ${s.p05} &middot; p50 ${s.p50} &middot; p95 ${s.p95} &middot; sat ${s.saturation} &middot; rgb ${s.rgb.join(',')}`
    : '';
const rows = results
  .map(
    (r) => `
  <section>
    <h2>${r.id}<span>${r.baseline}${r.ssim !== undefined ? ` ssim ${r.ssim}` : ''}${r.errors.length ? ' &middot; ERRORS' : ''}</span></h2>
    <div class="pair">
      <figure><img src="${r.file}"><figcaption>capture &middot; ${fmt(r.stats)}</figcaption></figure>
      ${
        r.reference
          ? `<figure><img src="file://${r.reference}"><figcaption>reference &middot; ${fmt(r.referenceStats)}</figcaption></figure>`
          : '<figure class="none"><div>no reference</div></figure>'
      }
    </div>
  </section>`,
  )
  .join('\n');
const sheetHtml = `<!doctype html><meta charset="utf-8"><title>${runName}</title>
<style>
  body { margin: 0; padding: 16px; background: #111418; color: #d6dbe0; font: 13px system-ui, sans-serif; }
  h1 { font-size: 16px; margin: 0 0 12px; font-weight: 600; }
  section { margin-bottom: 18px; }
  h2 { font-size: 14px; margin: 0 0 6px; font-weight: 600; }
  h2 span { font-weight: 400; opacity: 0.6; margin-left: 10px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  figure { margin: 0; }
  img { width: 100%; display: block; }
  figcaption { opacity: 0.7; margin-top: 3px; font-size: 11px; }
  .none div { aspect-ratio: 3 / 2; display: grid; place-items: center; background: #1b1f25; opacity: 0.5; }
</style>
<h1>Aloft capture ${runName} &middot; seed ${args.seed}${args.extra ? ` &middot; ${args.extra}` : ''}</h1>
${rows}`;
const sheetPath = join(outDir, 'sheet.html');
writeFileSync(sheetPath, sheetHtml);

const sheetBrowser = await launchBrowser();
try {
  const page = await sheetBrowser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.goto(`file://${sheetPath}`);
  await page.screenshot({ path: join(outDir, 'sheet.jpg'), type: 'jpeg', quality: 78, fullPage: true });
  // Smaller copy for docs/critiques, so the repository does not grow by half a megabyte per critique.
  await page.setViewportSize({ width: 960, height: 800 });
  await page.screenshot({ path: join(outDir, 'sheet_small.jpg'), type: 'jpeg', quality: 62, fullPage: true });
} finally {
  await sheetBrowser.close();
  await server.close();
}

writeFileSync(
  join(outDir, 'report.json'),
  JSON.stringify({ run: runName, seed: args.seed, results }, null, 2),
);
const table = [
  '| Shot | Capture mean / p05 / p50 / p95 / sat | Reference mean / p05 / p50 / p95 / sat | Baseline |',
  '|---|---|---|---|',
  ...results.map((r) => {
    const s = (x) => (x ? `${x.mean} / ${x.p05} / ${x.p50} / ${x.p95} / ${x.saturation}` : 'none');
    return `| \`${r.id}\` | ${s(r.stats)} | ${s(r.referenceStats)} | ${r.baseline}${r.ssim !== undefined ? ` (${r.ssim})` : ''} |`;
  }),
].join('\n');
writeFileSync(join(outDir, 'report.md'), `${table}\n`);
console.log(`\n${table}\n\n[capture] sheet: ${join(outDir, 'sheet.jpg')}`);

if (args.critique) {
  const dir = join(ROOT, 'docs/critiques');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(outDir, 'sheet_small.jpg'), join(dir, `${args.critique}.jpg`));
  const md = join(dir, `${args.critique}.md`);
  if (!existsSync(md)) {
    writeFileSync(
      md,
      `# ${args.critique}\n\nCapture run \`${runName}\`, seed ${args.seed}${args.extra ? `, flags \`${args.extra}\`` : ''}. Contact sheet: [${args.critique}.jpg](${args.critique}.jpg)\n\n${table}\n\n` +
        [
          'Value structure',
          'Color',
          'Foam and spray read',
          'Sky',
          'Better than the reference',
          'Worse than the reference',
          'Regressions',
          'Next fix',
        ]
          .map((h) => `**${h}:** TODO\n`)
          .join('\n'),
    );
  }
  console.log(`[capture] critique files: docs/critiques/${args.critique}.{md,jpg}`);
}

if (results.some((r) => r.errors.length)) process.exitCode = 1;
