// Browser smoke test: serves the app, answers every external API with fixtures
// shaped like that API's documented responses, drives the UI through all six
// stations, the audio engine, car mode and a phone viewport, and saves
// screenshots to test/screenshots/.
//
// Fixtures are test data, not live readings. Run with: npm run smoke
// (needs Playwright: `npm i -D playwright && npx playwright install chromium`).

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { issOrbitFrom, isInEarthShadow, subsolarPoint } from '../js/astro.js';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(`${process.env.NODE_PATH || '/opt/node22/lib/node_modules'}/playwright`));
}

const root = fileURLToPath(new URL('..', import.meta.url));
const shots = join(root, 'test', 'screenshots');
await mkdir(shots, { recursive: true });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, path.endsWith('/') ? `${path}index.html` : path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, r));
const origin = `http://localhost:${server.address().port}`;

// ---- fixtures ------------------------------------------------------------------

const t0 = Date.now();
const issModel = issOrbitFrom({ lat: 38, lon: 52, ascending: true });
function issFixture() {
  const now = Date.now();
  const p = issModel((now - t0) / 1000);
  const lit = !isInEarthShadow(p.lat, p.lon, 418, subsolarPoint(now));
  return { name: 'iss', id: 25544, latitude: p.lat, longitude: p.lon, altitude: 418.4, velocity: 27583.2, visibility: lit ? 'daylight' : 'eclipsed', timestamp: Math.floor(now / 1000), units: 'kilometers' };
}

const day = new Date(t0 - 86400e3).toISOString().slice(0, 10);
const iso = (ms) => new Date(ms).toISOString();
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

function placeholder(label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><defs><radialGradient id="g" cx="40%" cy="35%"><stop offset="0" stop-color="#3a4a6a"/><stop offset="1" stop-color="#0a0f1a"/></radialGradient></defs><rect width="1024" height="1024" fill="#05070d"/><circle cx="512" cy="512" r="400" fill="url(#g)"/><text x="512" y="500" fill="#8d9ab0" font-family="sans-serif" font-size="34" text-anchor="middle">TEST IMAGE</text><text x="512" y="550" fill="#5d6a80" font-family="sans-serif" font-size="24" text-anchor="middle">${label}</text></svg>`;
  return { status: 200, contentType: 'image/svg+xml', body: svg };
}

function route(url) {
  const u = new URL(url);
  const host = u.hostname;
  if (host === 'api.wheretheiss.at') {
    if (u.pathname.includes('/coordinates/')) {
      const [lat, lon] = u.pathname.split('/').pop().split(',').map(Number);
      const kz = lat > 40 && lat < 55 && lon > 47 && lon < 87;
      return json({ latitude: lat, longitude: lon, timezone_id: kz ? 'Asia/Almaty' : 'Etc/GMT', offset: kz ? 5 : 0, country_code: kz ? 'KZ' : '??' });
    }
    return json(issFixture());
  }
  if (host === 'epic.gsfc.nasa.gov' && u.pathname.startsWith('/api/')) {
    return json(
      Array.from({ length: 8 }, (_, i) => {
        const hh = String(1 + i * 2).padStart(2, '0');
        return { identifier: `${day.replace(/-/g, '')}${hh}0000`, caption: 'This image was taken by NASA\'s EPIC camera onboard the NOAA DSCOVR spacecraft', image: `epic_1b_${day.replace(/-/g, '')}${hh}0000`, centroid_coordinates: { lat: 5 - i, lon: 160 - i * 30 }, date: `${day} ${hh}:00:00` };
      }),
    );
  }
  if (host === 'services.swpc.noaa.gov') {
    // Old header-row format for plasma, new object format for Kp.
    if (u.pathname.includes('plasma')) return json([['time_tag', 'density', 'speed', 'temperature'], ['2026-10-28 08:50:00.000', '4.21', '462.5', '91234'], ['2026-10-28 08:55:00.000', '4.05', '458.1', '90011']]);
    if (u.pathname.includes('planetary_k_index_1m')) return json([{ time_tag: '2026-10-28T08:54:00', kp_index: 2, estimated_kp: 2.33, kp: '2P' }, { time_tag: '2026-10-28T08:55:00', kp_index: 3, estimated_kp: 2.67, kp: '3M' }]);
  }
  if (host === 'mars.nasa.gov' && u.pathname.startsWith('/rss/api')) {
    const cams = ['NAVCAM_LEFT', 'MCZ_RIGHT', 'FRONT_HAZCAM_LEFT_A', 'SHERLOC_WATSON', 'MCZ_LEFT', 'NAVCAM_RIGHT', 'REAR_HAZCAM_RIGHT'];
    return json({ images: cams.map((c, i) => ({ image_files: { large: `https://mars.nasa.gov/mars2020-raw-images/test/${c}_${i}.png`, medium: `https://mars.nasa.gov/mars2020-raw-images/test/${c}_${i}_m.png` }, sol: 1660 - (i % 2), camera: { instrument: c }, date_taken_utc: iso(t0 - i * 3600e3) })) });
  }
  if (host === 'api.nasa.gov' && u.pathname.includes('apod')) {
    const item = (d, title) => ({ date: d, title, explanation: `${title} is a fixture explanation used by the smoke test. It has a second sentence. And a third one that is a little longer than the others.`, url: `https://apod.nasa.gov/apod/image/test/${encodeURIComponent(title)}.jpg`, media_type: 'image', copyright: 'Test Photographer' });
    if (u.searchParams.get('count')) return json(['Fixture Nebula', 'Fixture Galaxy', 'Fixture Comet'].map((t, i) => item(`2019-0${i + 1}-15`, t)));
    return json(item(new Date(t0).toISOString().slice(0, 10), 'Fixture: The Test Pattern Nebula'));
  }
  if (host === 'll.thespacedevs.com') {
    const mk = (h, name, provider, pad) => ({ name, net: iso(t0 + h * 3600e3), status: { abbrev: h < 30 ? 'Go' : 'TBC', name: h < 30 ? 'Go for Launch' : 'To Be Confirmed' }, launch_service_provider: { name: provider }, pad: { location: { name: pad } }, image: { image_url: 'https://thespacedevs-prod.nyc3.digitaloceanspaces.com/test/rocket.png' } });
    return json({ results: [mk(5.2, 'Test Rocket 9 | Fixture Mission A', 'Example Launch Co', 'Test Range, FL, USA'), mk(31, 'Fixture Heavy | Fixture Mission B', 'Sample Space', 'Sample Spaceport'), mk(76, 'Demo-1 | Fixture Mission C', 'Demo Aerospace', 'Demo Pad 2')] });
  }
  if (host.endsWith('youtube.com')) {
    return { status: 200, contentType: 'text/html', body: '<body style="margin:0;background:#020306;color:#5d6a80;font:20px sans-serif;display:grid;place-items:center;height:100vh">ISS live camera (test placeholder: no network in the test sandbox)</body>' };
  }
  if (host === 'fonts.googleapis.com') return { status: 200, contentType: 'text/css', body: '' };
  if (/\.(png|jpe?g)$/i.test(u.pathname) || host === 'sdo.gsfc.nasa.gov') return placeholder(`${host}${u.pathname.slice(0, 48)}`);
  return null; // everything else (SomaFM streams, fonts) fails as if offline
}

// ---- run -----------------------------------------------------------------------

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
await context.route(/^https?:\/\/(?!localhost)/, async (r) => {
  const res = route(r.request().url());
  if (res) await r.fulfill(res);
  else await r.abort('internetdisconnected');
});

const problems = [];
const page = await context.newPage();
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) problems.push(`console: ${m.text()}`);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) problems.push(msg);
};
const readout = () =>
  page.evaluate(() => ({
    name: document.querySelector('#lcd-name').textContent,
    rows: [...document.querySelectorAll('#tele-rows dd')].map((d) => d.previousSibling.textContent + ': ' + d.textContent),
    noSignal: !document.querySelector('#nosignal').hidden,
    status: document.querySelector('#tele-status').textContent,
  }));

await page.goto(origin);
await page.waitForFunction(() => document.querySelector('#lcd-name').textContent === 'ISS Live');
await sleep(6500); // two ISS fixes so the ground track direction is known
let r = await readout();
check(r.rows.some((x) => x.startsWith('Altitude: 418')), `ISS telemetry parsed (${r.rows.join(' | ')})`);
check(!r.noSignal, 'ISS shows signal');
await page.screenshot({ path: join(shots, '1-iss-standby.png') });

await page.click('#power');
await sleep(3500);
const audio = await page.evaluate(() => ({ state: spaceMusic.engine.ctx?.state, level: spaceMusic.engine.level(), voices: spaceMusic.engine.voices.size }));
check(audio.state === 'running', `audio context running (${audio.state})`);
check(audio.level > 0.001, `engine producing sound (rms ${audio.level.toFixed(4)}, ${audio.voices} voices)`);
await page.screenshot({ path: join(shots, '2-iss-playing.png') });

const expectations = {
  earth: (x) => x.rows.some((s) => s.startsWith('Images: 8')),
  sun: (x) => x.rows.some((s) => s.startsWith('Solar wind: 458')) && x.rows.some((s) => s.startsWith('Kp index: 2.7')),
  mars: (x) => x.rows.some((s) => s.startsWith('Mission sol:')) && x.rows.some((s) => s.startsWith('Camera:')),
  deep: (x) => x.rows.some((s) => s.includes('Test Pattern Nebula')),
  launch: (x) => x.rows.some((s) => s.startsWith('Mission: Fixture Mission A')),
};
const ids = await page.evaluate(() => spaceMusic.STATIONS.map((s) => s.id));
for (let i = 1; i < ids.length; i++) {
  await page.keyboard.press(String(i + 1));
  await sleep(4000);
  r = await readout();
  check(expectations[ids[i]](r) && !r.noSignal, `${ids[i]}: ${r.rows.join(' | ')}`);
  await page.screenshot({ path: join(shots, `${i + 2}-${ids[i]}.png`) });
}
const level = await page.evaluate(() => spaceMusic.engine.level());
check(level > 0.001, `music still playing after five station changes (rms ${level.toFixed(4)})`);

// SomaFM can't be reached here: the player should fall back to generative music.
await page.keyboard.press('m');
await page.waitForFunction(() => spaceMusic.state.source === 'gen', null, { timeout: 45000 }).catch(() => {});
check((await page.evaluate(() => spaceMusic.state.source)) === 'gen', 'unreachable SomaFM falls back to generative');

await page.keyboard.press('1');
await sleep(1500);
await page.keyboard.press('c');
await sleep(1200);
await page.screenshot({ path: join(shots, '8-car-mode.png') });
await page.keyboard.press('c');

// Settings: Enter in a field saves (not cancels).
await page.click('#settings-btn');
await page.fill('input[name=nasaKey]', 'TEST_KEY_123');
await page.press('input[name=nasaKey]', 'Enter');
await sleep(300);
const savedKey = await page.evaluate(() => JSON.parse(localStorage.getItem('spacemusic:nasaKey')));
check(savedKey === 'TEST_KEY_123', `settings saved on Enter (${savedKey})`);

await page.keyboard.press('w');
await sleep(800);
check(await page.evaluate(() => document.body.classList.contains('window')), 'window mode toggles on');
await page.keyboard.press('w');

const phone = await context.newPage();
phone.on('pageerror', (e) => problems.push(`phone pageerror: ${e.message}`));
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(origin);
await sleep(6500);
await phone.screenshot({ path: join(shots, '9-phone.png') });

await browser.close();
server.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`\nAll good. Screenshots in ${shots}`);
