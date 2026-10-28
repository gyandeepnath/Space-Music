// Test fixtures: a static server for the app, and responses for every external
// API shaped like that API's documented format. Images are synthetic stand-ins
// (clearly labelled "test image") so screenshots show the layout without the
// network. None of this is live data.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { issOrbitFrom, isInEarthShadow, subsolarPoint } from '../js/astro.js';

const require = createRequire(import.meta.url);

export function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch {
    return require(`${process.env.NODE_PATH || '/opt/node22/lib/node_modules'}/playwright`).chromium;
  }
}

export const root = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

export async function startServer() {
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
  return { server, origin: `http://localhost:${server.address().port}` };
}

const t0 = Date.now();
const issModel = issOrbitFrom({ lat: 38, lon: 52, ascending: true });
const day = new Date(t0 - 86400e3).toISOString().slice(0, 10);
const iso = (ms) => new Date(ms).toISOString();
const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

function issFixture() {
  const now = Date.now();
  const p = issModel((now - t0) / 1000);
  const lit = !isInEarthShadow(p.lat, p.lon, 418, subsolarPoint(now));
  return { name: 'iss', id: 25544, latitude: p.lat, longitude: p.lon, altitude: 418.4, velocity: 27583.2, visibility: lit ? 'daylight' : 'eclipsed', timestamp: Math.floor(now / 1000), units: 'kilometers' };
}

const label = (w, h) =>
  `<text x="${w - 24}" y="${h - 22}" fill="rgba(255,255,255,0.45)" font-family="sans-serif" font-size="${Math.round(w / 48)}" text-anchor="end">TEST IMAGE · fixture</text>`;

const SDO_COLORS = { '0171': ['#fff2b0', '#e8b030', '#6b4200'], '0193': ['#ffe6c0', '#c98a3a', '#4a2a06'], '0304': ['#ffd0b0', '#e0502a', '#5a0e04'], '0211': ['#f4d6ff', '#a556c8', '#3a0f4a'], '0131': ['#d6fff8', '#2fa8a0', '#06343a'], HMIIC: ['#fff1c8', '#ff9a2e', '#7a2a04'] };

function svg(w, h, inner) {
  return { status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}${label(w, h)}</svg>` };
}

function stars(w, h, n, seed) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => `<circle cx="${r() * w}" cy="${r() * h}" r="${r() * 1.6 + 0.3}" fill="#fff" opacity="${0.3 + r() * 0.7}"/>`).join('');
}

function image(u) {
  const host = u.hostname;
  if (host === 'epic.gsfc.nasa.gov') {
    return svg(1024, 1024, `<rect width="1024" height="1024" fill="#000"/><defs><radialGradient id="e" cx="42%" cy="40%" r="62%"><stop offset="0" stop-color="#9fd4ff"/><stop offset=".35" stop-color="#2f78c4"/><stop offset=".75" stop-color="#123a78"/><stop offset="1" stop-color="#061633"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="14"/></filter><clipPath id="c"><circle cx="512" cy="512" r="430"/></clipPath></defs><circle cx="512" cy="512" r="430" fill="url(#e)"/><g clip-path="url(#c)" filter="url(#b)"><ellipse cx="430" cy="430" rx="150" ry="110" fill="#5f9a4a" opacity=".85"/><ellipse cx="640" cy="620" rx="120" ry="160" fill="#b49a62" opacity=".8"/><ellipse cx="380" cy="700" rx="200" ry="40" fill="#fff" opacity=".7"/><ellipse cx="600" cy="300" rx="220" ry="36" fill="#fff" opacity=".75"/><ellipse cx="520" cy="520" rx="260" ry="26" fill="#fff" opacity=".5"/></g>`);
  }
  if (host === 'sdo.gsfc.nasa.gov') {
    const id = u.pathname.match(/latest_1024_(\w+)\.jpg/)?.[1] || '0171';
    const [a, b, c] = SDO_COLORS[id] || SDO_COLORS['0171'];
    return svg(1024, 1024, `<rect width="1024" height="1024" fill="#000"/><defs><radialGradient id="s"><stop offset="0" stop-color="${a}"/><stop offset=".7" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient><radialGradient id="g"><stop offset=".72" stop-color="${b}" stop-opacity=".55"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient><filter id="f"><feTurbulence baseFrequency=".012" numOctaves="3" seed="${id.length}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .5 0"/></filter></defs><circle cx="512" cy="512" r="500" fill="url(#g)"/><circle cx="512" cy="512" r="400" fill="url(#s)"/><circle cx="512" cy="512" r="400" filter="url(#f)" opacity=".35"/>`);
  }
  if (host === 'mars.nasa.gov') {
    return svg(1600, 1200, `<defs><linearGradient id="sky" x2="0" y2="1"><stop offset="0" stop-color="#d9b48a"/><stop offset="1" stop-color="#e8c9a0"/></linearGradient><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="#a5552c"/><stop offset="1" stop-color="#5a2410"/></linearGradient><filter id="t"><feTurbulence baseFrequency=".02 .05" numOctaves="4" seed="3"/><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .08  0 0 0 0 .02  0 0 0 .6 0"/></filter></defs><rect width="1600" height="1200" fill="url(#sky)"/><path d="M0 560 Q 300 500 620 548 T 1200 520 T 1600 560 V1200 H0z" fill="#b8693a"/><path d="M0 640 Q 400 600 800 650 T 1600 630 V1200 H0z" fill="url(#g)"/><rect y="600" width="1600" height="600" filter="url(#t)"/><ellipse cx="420" cy="880" rx="70" ry="30" fill="#3a1608"/><ellipse cx="1100" cy="980" rx="110" ry="44" fill="#341306"/><ellipse cx="820" cy="760" rx="34" ry="14" fill="#401a0a"/>`);
  }
  if (host === 'apod.nasa.gov') {
    return svg(1600, 1000, `<rect width="1600" height="1000" fill="#04020c"/><defs><filter id="b"><feGaussianBlur stdDeviation="60"/></filter></defs><g filter="url(#b)"><ellipse cx="620" cy="460" rx="340" ry="200" fill="#6a2bd8" opacity=".75"/><ellipse cx="900" cy="560" rx="300" ry="170" fill="#ff4f9a" opacity=".55"/><ellipse cx="760" cy="420" rx="160" ry="100" fill="#7fd6ff" opacity=".6"/><ellipse cx="1060" cy="380" rx="120" ry="80" fill="#ffb347" opacity=".4"/></g>${stars(1600, 1000, 260, 7)}`);
  }
  if (host.includes('thespacedevs')) {
    return svg(1600, 1000, `<defs><linearGradient id="d" x2="0" y2="1"><stop offset="0" stop-color="#0b1430"/><stop offset=".65" stop-color="#5a2a4a"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#d)"/><rect x="780" y="300" width="40" height="560" rx="18" fill="#e8e8ee"/><path d="M780 320 L800 240 L820 320z" fill="#e8e8ee"/><rect x="0" y="860" width="1600" height="140" fill="#08080c"/>`);
  }
  return svg(1024, 1024, `<rect width="1024" height="1024" fill="#05070d"/>`);
}

// Returns a Playwright fulfil() payload, or null to fail the request as offline.
export function routeFixture(url) {
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
        return { identifier: `${day.replace(/-/g, '')}${hh}0000`, caption: "This image was taken by NASA's EPIC camera onboard the NOAA DSCOVR spacecraft", image: `epic_1b_${day.replace(/-/g, '')}${hh}0000`, centroid_coordinates: { lat: 5 - i, lon: 160 - i * 30 }, date: `${day} ${hh}:00:00` };
      }),
    );
  }
  if (host === 'services.swpc.noaa.gov') {
    // Old header-row format for plasma, new (2026) object format for Kp.
    if (u.pathname.includes('plasma')) return json([['time_tag', 'density', 'speed', 'temperature'], ['2026-10-28 08:50:00.000', '4.21', '462.5', '91234'], ['2026-10-28 08:55:00.000', '4.05', '458.1', '90011']]);
    if (u.pathname.includes('planetary_k_index_1m')) return json([{ time_tag: '2026-10-28T08:54:00', kp_index: 2, estimated_kp: 2.33, kp: '2P' }, { time_tag: '2026-10-28T08:55:00', kp_index: 3, estimated_kp: 2.67, kp: '3M' }]);
  }
  if (host === 'mars.nasa.gov' && u.pathname.startsWith('/rss/api')) {
    const cams = ['NAVCAM_LEFT', 'MCZ_RIGHT', 'FRONT_HAZCAM_LEFT_A', 'SHERLOC_WATSON', 'MCZ_LEFT', 'NAVCAM_RIGHT', 'REAR_HAZCAM_RIGHT'];
    return json({ images: cams.map((c, i) => ({ image_files: { large: `https://mars.nasa.gov/mars2020-raw-images/test/${c}_${i}.png`, medium: `https://mars.nasa.gov/mars2020-raw-images/test/${c}_${i}_m.png` }, sol: 1660 - (i % 2), camera: { instrument: c }, date_taken_utc: iso(t0 - i * 3600e3) })) });
  }
  if (host === 'api.nasa.gov' && u.pathname.includes('apod')) {
    const item = (d, title) => ({ date: d, title, explanation: `${title} is a fixture explanation used by the smoke test. It has a second sentence. And a third one that is a little longer than the others.`, url: `https://apod.nasa.gov/apod/image/test/${encodeURIComponent(title)}.jpg`, media_type: 'image', copyright: 'Test Photographer' });
    const days = Array.from({ length: 8 }, (_, i) => new Date(t0 - (7 - i) * 86400e3).toISOString().slice(0, 10));
    const titles = ['Fixture Nebula', 'Fixture Galaxy', 'Fixture Comet', 'Fixture Aurora', 'Fixture Eclipse', 'Fixture Cluster', 'Fixture Moon', 'Fixture: The Test Pattern Nebula'];
    return json(days.map((d, i) => item(d, titles[i])));
  }
  if (host === 'll.thespacedevs.com') {
    const mk = (h, name, provider, pad) => ({ name, net: iso(t0 + h * 3600e3), status: { abbrev: h < 30 ? 'Go' : 'TBC', name: h < 30 ? 'Go for Launch' : 'To Be Confirmed' }, launch_service_provider: { name: provider }, pad: { location: { name: pad } }, image: { image_url: 'https://thespacedevs-prod.nyc3.digitaloceanspaces.com/test/rocket.png' } });
    return json({ results: [mk(5.2, 'Test Rocket 9 | Fixture Mission A', 'Example Launch Co', 'Test Range, FL, USA'), mk(31, 'Fixture Heavy | Fixture Mission B', 'Sample Space', 'Sample Spaceport'), mk(76, 'Demo-1 | Fixture Mission C', 'Demo Aerospace', 'Demo Pad 2')] });
  }
  if (host.endsWith('youtube.com')) {
    return {
      status: 200,
      contentType: 'text/html',
      body: '<meta charset="utf-8"><body style="margin:0;height:100vh;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 120%,#1b4f9a 0,#0b2350 35%,#02040a 70%);color:rgba(255,255,255,.45);font:18px sans-serif">ISS camera · test placeholder</body>',
    };
  }
  if (host === 'fonts.googleapis.com') return { status: 200, contentType: 'text/css', body: '' };
  if (/\.(png|jpe?g)$/i.test(u.pathname) || host === 'sdo.gsfc.nasa.gov') return image(u);
  return null; // everything else (SomaFM streams, fonts) fails as if offline
}

export async function routeContext(context) {
  await context.route(/^https?:\/\/(?!localhost)/, async (r) => {
    const res = routeFixture(r.request().url());
    if (res) await r.fulfill(res);
    else await r.abort('internetdisconnected');
  });
}
