// Browser smoke test: serves the app, answers every external API with fixtures
// shaped like that API's documented responses (test/fixtures.mjs), and drives
// the real UI: splash, all six stations, the music engine, two listeners in
// sync, swiping and the tuner, the sheet, sharing and QR, settings, TV and car
// modes, a phone viewport, and the 16:9 and vertical broadcast layouts.
// Screenshots go to test/screenshots/.
//
// Fixtures are test data, not live readings. Run with: npm run smoke
// (needs Playwright: `npm i -D playwright && npx playwright install chromium`).

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, routeContext, loadChromium, root } from './fixtures.mjs';

const shots = join(root, 'test', 'screenshots');
await mkdir(shots, { recursive: true });
const { server, origin } = await startServer();
const browser = await loadChromium().launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

const problems = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) problems.push(msg);
};

async function open(viewport, url, options = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', ...options });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await routeContext(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  await page.goto(origin + url);
  return page;
}

const readout = (page) =>
  page.evaluate(() => ({
    station: spaceMusic.STATIONS[spaceMusic.state.index].id,
    name: document.querySelector('#np-name').textContent,
    cards: [...document.querySelectorAll('#cards .card')].map((c) => `${c.querySelector('dt').textContent}: ${c.querySelector('dd').textContent}`),
    lost: document.querySelector('#signal').classList.contains('lost') && !document.querySelector('#signal').hidden,
  }));

// ---- desktop ---------------------------------------------------------------------

const page = await open({ width: 1440, height: 900 }, '/#iss');
await page.waitForFunction(() => document.querySelector('#np-name').textContent === 'ISS Live');
check(await page.isVisible('#splash'), 'splash greets a visitor arriving on a shared link');
check((await page.textContent('#splash-eyebrow')).includes('invited'), 'splash says they were invited');
await page.screenshot({ path: join(shots, 'desktop-splash.png') });

await page.click('#tune-in');
await sleep(7000); // two ISS fixes so the ground track direction is known
let r = await readout(page);
check(r.cards.some((x) => x.startsWith('Altitude: 418')), `ISS telemetry (${r.cards.join(' | ')})`);
const audio = await page.evaluate(() => ({ state: spaceMusic.engine.ctx?.state, level: spaceMusic.engine.level() }));
check(audio.state === 'running', `audio running (${audio.state})`);
check(audio.level > 0.001, `engine producing sound (rms ${audio.level.toFixed(4)})`);
check(await page.evaluate(() => location.hash === '#iss'), 'address bar holds a shareable station link');
await page.screenshot({ path: join(shots, 'desktop-iss.png') });

const expectations = {
  earth: (x) => x.cards.some((s) => s.startsWith('Images: 8')),
  sun: (x) => x.cards.some((s) => s.startsWith('Solar wind: 458')) && x.cards.some((s) => s.startsWith('Kp index: 2.7')),
  mars: (x) => x.cards.some((s) => s.startsWith('Mission sol:')) && x.cards.some((s) => s.startsWith('Camera:')),
  deep: (x) => x.cards.some((s) => s.includes('Test Pattern Nebula')),
  launch: (x) => x.cards.some((s) => s.startsWith('Mission: Fixture Mission A')),
};
for (let i = 1; i < 6; i++) {
  await page.keyboard.press(String(i + 1));
  await sleep(4200);
  r = await readout(page);
  check(expectations[r.station](r) && !r.lost, `${r.station}: ${r.cards.join(' | ')}`);
  await page.screenshot({ path: join(shots, `desktop-${r.station}.png`) });
}
const level = await page.evaluate(() => spaceMusic.engine.level());
check(level > 0.001, `music still playing after five station changes (rms ${level.toFixed(4)})`);

// Tuner: scroll the ruler two stations over and let it settle.
await page.evaluate(() => {
  const t = document.querySelector('#tuner');
  t.scrollLeft = t.querySelector('.tuner-mark').offsetWidth * 2;
});
await sleep(900);
check((await readout(page)).station === 'sun', 'scrolling the tuner changes station');

// Share falls back to copying the link when there's no share sheet.
await page.click('#share-btn');
await sleep(400);
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(clip.endsWith('#sun'), `share copies a join link (${clip})`);

await page.click('#sheet [data-action=qr]');
await sleep(400);
check(await page.isVisible('#qr-dialog svg'), 'QR code dialog renders');
await page.screenshot({ path: join(shots, 'desktop-qr.png') });
await page.click('#qr-dialog [data-close]');

// SomaFM can't be reached here: the player should fall back to the live composition.
await page.keyboard.press('m');
await page.waitForFunction(() => spaceMusic.state.source === 'gen', null, { timeout: 45000 }).catch(() => {});
check((await page.evaluate(() => spaceMusic.state.source)) === 'gen', 'unreachable SomaFM falls back to live composition');

// Settings: Enter in a field saves.
await page.click('#menu-btn');
await page.click('#menu details summary');
await page.fill('input[name=nasaKey]', 'TEST_KEY_123');
await page.press('input[name=nasaKey]', 'Enter');
await sleep(300);
check((await page.evaluate(() => JSON.parse(localStorage.getItem('spacemusic:nasaKey')))) === 'TEST_KEY_123', 'settings save on Enter');

await page.keyboard.press('t');
await sleep(500);
check(await page.evaluate(() => document.body.classList.contains('tv')), 'TV mode toggles on');
await page.keyboard.press('t');

await page.keyboard.press('1');
await sleep(1200);
await page.keyboard.press('c');
await sleep(1000);
await page.screenshot({ path: join(shots, 'car-mode.png') });
await page.keyboard.press('c');

// ---- two listeners stay in sync ---------------------------------------------------------

const a = await open({ width: 800, height: 600 }, '/#sun');
await a.click('#tune-in');
await sleep(5000);
const b = await open({ width: 800, height: 600 }, '/#sun');
await b.click('#tune-in');
await sleep(4000);
const [ca, cb] = await Promise.all([a, b].map((p) => p.evaluate(() => ({ seed: spaceMusic.engine.seed, chord: spaceMusic.engine.currentChord }))));
check(ca.seed === cb.seed && ca.chord?.index === cb.chord?.index && ca.chord?.degree === cb.chord?.degree, `a listener who joins later hears the same chord (${JSON.stringify(ca.chord)} vs ${JSON.stringify(cb.chord)})`);
await a.context().close();
await b.context().close();

// ---- phone ----------------------------------------------------------------------------

const phone = await open({ width: 390, height: 844 }, '/', { deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await sleep(1500);
await phone.screenshot({ path: join(shots, 'phone-splash.png') });
await phone.click('#tune-in');
await sleep(7000);
await phone.screenshot({ path: join(shots, 'phone-iss.png') });
await phone.click('#details-btn');
await sleep(800);
check(await phone.evaluate(() => document.querySelector('#sheet').classList.contains('open')), 'phone: live data sheet opens');
await phone.screenshot({ path: join(shots, 'phone-sheet.png') });
await phone.click('#sheet-close');
await sleep(500);
// Swipe left on the view to go to the next station.
const before = (await readout(phone)).station;
await phone.mouse.move(300, 400);
await phone.mouse.down();
for (let x = 300; x >= 120; x -= 20) await phone.mouse.move(x, 405);
await phone.mouse.up();
await sleep(4500);
const after = (await readout(phone)).station;
check(before === 'iss' && after === 'earth', `phone: swiping changes station (${before} → ${after})`);
await phone.screenshot({ path: join(shots, 'phone-earth.png') });

// ---- broadcast --------------------------------------------------------------------------

const wide = await open({ width: 1920, height: 1080 }, '/?broadcast&rotate=10&join=https://spacemusic.example/');
await sleep(8000);
check(await wide.isVisible('#onair .oa-qr svg'), 'broadcast: QR code to tune in');
check((await wide.textContent('#oa-url')).startsWith('spacemusic.example/#'), 'broadcast: join link uses the public address');
check((await wide.textContent('#oa-ticker')).length > 40, 'broadcast: telemetry ticker filled');
check(await wide.isVisible('#oa-next'), 'broadcast: "up next" countdown shows');
await wide.screenshot({ path: join(shots, 'broadcast-16x9.png') });
const tall = await open({ width: 1080, height: 1920 }, '/?broadcast&join=https://spacemusic.example/#sun');
await sleep(7000);
await tall.screenshot({ path: join(shots, 'broadcast-9x16.png') });

await browser.close();
server.close();
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`\nAll good. Screenshots in ${shots}`);
