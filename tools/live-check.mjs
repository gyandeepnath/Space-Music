// Opens the published site in a real browser on GitHub's network, tunes
// through every station with the live feeds, and saves what it finds to
// reports/live/: summary.json (data shown, music playing, errors, failed
// requests) and a phone and a desktop screenshot of each station.
//
// Usage: SITE_URL=https://owner.github.io/repo/ node tools/live-check.mjs

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const SITE = process.env.SITE_URL || 'https://gyandeepnath.github.io/Space-Music/';
const out = 'reports/live';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const summary = { site: SITE, checkedAt: new Date().toISOString(), files: {}, viewports: {} };

// The music files: catalog, and a range request on one track (needed to seek).
for (const path of ['', 'music/catalog.json', 'music/CREDITS.md', 'music/youtube-description.txt', 'sw.js']) {
  const res = await fetch(SITE + path, { signal: AbortSignal.timeout(20000) }).catch((e) => ({ status: String(e) }));
  summary.files[path || '/'] = res.status;
}
try {
  const catalog = await (await fetch(SITE + 'music/catalog.json')).json();
  const t = catalog.tracks[0];
  const res = await fetch(SITE + t.file, { headers: { Range: 'bytes=1000-1999' } });
  summary.files[t.file] = `${res.status} ${res.headers.get('content-type')} ${res.headers.get('content-range')}`;
  summary.catalog = { tracks: catalog.tracks.length, hours: +(catalog.tracks.reduce((s, x) => s + x.duration, 0) / 3600).toFixed(2) };
} catch (e) {
  summary.catalog = String(e);
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

async function run(name, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const log = { console: [], failed: [], stations: [] };
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type())) log.console.push(`${m.type()}: ${m.text()}`.slice(0, 400));
  });
  page.on('pageerror', (e) => log.console.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => log.failed.push(`${r.failure()?.errorText} ${r.url()}`.slice(0, 300)));
  page.on('response', (r) => r.status() >= 400 && log.failed.push(`${r.status()} ${r.url()}`.slice(0, 300)));

  console.log(`${name}: opening ${SITE}`);
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  await page.screenshot({ path: join(out, `${name}-splash.jpg`), quality: 70 });
  await page.click('#tune-in');
  for (let i = 0; i < 6; i++) {
    if (i) await page.keyboard.press(String(i + 1));
    await sleep(i ? 11000 : 14000);
    const s = await page.evaluate(() => {
      const sm = window.spaceMusic;
      const deck = sm.tracks.decks?.[sm.tracks.active]?.el;
      const slide = document.querySelector('#view-slides .slide.on');
      return {
        station: sm.STATIONS[sm.state.index].id,
        name: document.querySelector('#np-name')?.textContent,
        line: document.querySelector('#np-line')?.textContent,
        cards: [...document.querySelectorAll('#cards .row')].map((c) => `${c.querySelector('dt')?.textContent}: ${c.querySelector('dd')?.textContent}`),
        facts: [...document.querySelectorAll('#facts div')].map((c) => `${c.querySelector('dt')?.textContent}: ${c.querySelector('dd')?.textContent}`),
        signal: document.querySelector('#signal')?.hidden ? null : document.querySelector('#signal')?.textContent,
        source: sm.state.source,
        nowPlaying: sm.state.nowPlaying ? `${sm.state.nowPlaying.title} · ${sm.state.nowPlaying.artist}` : null,
        music: deck ? { paused: deck.paused, time: +deck.currentTime.toFixed(1), src: deck.currentSrc.split('/').pop() } : null,
        audio: { ctx: sm.engine.ctx?.state, level: +sm.engine.level().toFixed(4) },
        slide: slide ? { src: slide.currentSrc, w: slide.naturalWidth, h: slide.naturalHeight } : null,
        iframe: document.querySelector('#view-iss iframe')?.src || null,
      };
    });
    log.stations.push(s);
    console.log(`${name}: ${s.station} checked`);
    await page.screenshot({ path: join(out, `${name}-${s.station}.jpg`), quality: 70 });
  }
  // Phones open the details sheet; computers show it in the side panel already.
  if (await page.isVisible('#details-btn')) await page.click('#details-btn');
  await sleep(900);
  await page.screenshot({ path: join(out, `${name}-sheet.jpg`), quality: 70 });
  await context.close();
  return log;
}

summary.viewports.phone = await run('phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
summary.viewports.desktop = await run('desktop', { viewport: { width: 1440, height: 900 } });
await browser.close();

await writeFile(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
for (const [vp, log] of Object.entries(summary.viewports)) {
  for (const s of log.stations) console.log(`${vp} ${s.station}: ${s.signal ? `SIGNAL ${s.signal}` : 'ok'} · ${s.nowPlaying} · level ${s.audio.level} · ${s.cards.length} facts`);
  console.log(`${vp}: ${log.console.length} console messages, ${log.failed.length} failed requests`);
}
