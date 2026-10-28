// Runs on GitHub Actions (which has open internet): lists license-checked music
// candidates and checks every live data feed the app uses. Writes reports/ so
// the results can be reviewed and curated. Node 20+, no dependencies.

import { mkdir, writeFile } from 'node:fs/promises';

const OUT = 'reports';
await mkdir(OUT, { recursive: true });

async function get(url, { json = true, timeout = 25000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'SpaceMusic/0.2 (github.com/gyandeepnath/Space-Music)', ...headers } });
    const body = json ? await res.json().catch(() => null) : await res.text();
    return { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers), body };
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

const log = (...a) => console.log(...a);

// ---- Kevin MacLeod (incompetech), CC BY 4.0 -----------------------------------

async function incompetech() {
  const r = await get('https://incompetech.com/music/royalty-free/pieces.json');
  log('incompetech pieces.json', r.status, Array.isArray(r.body) ? `${r.body.length} pieces` : '');
  if (!Array.isArray(r.body)) return { status: r.status, error: r.error, pieces: [] };
  log('fields:', Object.keys(r.body[0] || {}).join(', '));
  const text = (p) => JSON.stringify(p).toLowerCase();
  const want = /(calm|relax|ambient|ethereal|mysterious|space|dream|meditat|serene|somber|atmospher|drone|eerie|floating|peaceful|tranquil|hypnotic|cosmic|star)/;
  const avoid = /(action|aggressive|funny|bouncy|comedy|silly|polka|rock|metal|march|holiday|christmas|ragtime|dance|hip hop|swing|bright)/;
  const pieces = r.body.filter((p) => want.test(text(p)) && !avoid.test(text(p)));
  log(`ambient-ish candidates: ${pieces.length}`);
  return { status: r.status, total: r.body.length, fields: Object.keys(r.body[0] || {}), pieces };
}

// ---- Internet Archive: public domain and CC BY ------------------------------------

const OK_LICENSES = [
  'http://creativecommons.org/publicdomain/zero/1.0/',
  'https://creativecommons.org/publicdomain/zero/1.0/',
  'http://creativecommons.org/publicdomain/mark/1.0/',
  'https://creativecommons.org/publicdomain/mark/1.0/',
  'http://creativecommons.org/licenses/by/2.0/',
  'http://creativecommons.org/licenses/by/2.5/',
  'http://creativecommons.org/licenses/by/3.0/',
  'http://creativecommons.org/licenses/by/4.0/',
  'https://creativecommons.org/licenses/by/3.0/',
  'https://creativecommons.org/licenses/by/4.0/',
];
const licenseClause = `(${OK_LICENSES.map((l) => `licenseurl:"${l}"`).join(' OR ')})`;

async function archiveSearch(name, q, rows = 40) {
  const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&fl[]=downloads&fl[]=subject&sort[]=downloads+desc&rows=${rows}&output=json`;
  const r = await get(url);
  const docs = r.body?.response?.docs || [];
  log(`archive.org [${name}]`, r.status, `${docs.length} results`);
  return { name, q, status: r.status, docs };
}

async function archiveFiles(identifier) {
  const r = await get(`https://archive.org/metadata/${encodeURIComponent(identifier)}`);
  const m = r.body?.metadata || {};
  const files = (r.body?.files || [])
    .filter((f) => /\.(mp3|ogg|flac)$/i.test(f.name))
    .map((f) => ({ name: f.name, format: f.format, length: f.length, title: f.title, creator: f.creator, size: f.size }));
  return { identifier, status: r.status, title: m.title, creator: m.creator, licenseurl: m.licenseurl, rights: m.rights, date: m.date, files };
}

async function archive() {
  const searches = await Promise.all([
    archiveSearch('holst-planets', 'creator:(holst) AND title:(planets) AND mediatype:(audio)'),
    archiveSearch('space-ambient-cc', `(subject:(space ambient) OR subject:("space music") OR subject:(spacesynth ambient) OR title:("space ambient")) AND mediatype:(audio) AND ${licenseClause}`),
    archiveSearch('ambient-cc', `subject:(ambient) AND mediatype:(audio) AND ${licenseClause}`, 60),
    archiveSearch('drone-cc', `(subject:(drone) OR subject:(dark ambient)) AND mediatype:(audio) AND ${licenseClause}`),
    archiveSearch('musopen', 'musopen AND mediatype:(audio)'),
  ]);
  // Fetch file lists for the most promising items (top results per search).
  const ids = [...new Set(searches.flatMap((s) => s.docs.slice(0, s.name === 'ambient-cc' ? 25 : 12).map((d) => d.identifier)))];
  const items = [];
  for (const id of ids) items.push(await archiveFiles(id));
  return { searches, items };
}

// ---- NASA audio (public domain, credit NASA) ---------------------------------------

async function nasaAudio() {
  const queries = ['sputnik', 'launch', 'mars sounds', 'perseverance microphone', 'voyager', 'apollo', 'space sounds', 'plasma waves', 'saturn radio', 'jupiter'];
  const out = [];
  for (const q of queries) {
    const r = await get(`https://images-api.nasa.gov/search?media_type=audio&q=${encodeURIComponent(q)}&page_size=25`);
    const items = (r.body?.collection?.items || []).map((it) => ({ nasa_id: it.data?.[0]?.nasa_id, title: it.data?.[0]?.title, center: it.data?.[0]?.center, date: it.data?.[0]?.date_created, description: (it.data?.[0]?.description || '').slice(0, 300), manifest: it.href }));
    log(`nasa audio [${q}]`, r.status, `${items.length} items`);
    out.push({ q, status: r.status, items });
  }
  return out;
}

// ---- Live data feeds used by the app ------------------------------------------------

const FEEDS = {
  'wheretheiss.now': 'https://api.wheretheiss.at/v1/satellites/25544',
  'wheretheiss.coordinates': 'https://api.wheretheiss.at/v1/coordinates/37.795517,-122.393693',
  'epic.natural': 'https://epic.gsfc.nasa.gov/api/natural',
  'epic.via-api.nasa.gov': 'https://api.nasa.gov/EPIC/api/natural?api_key=DEMO_KEY',
  'swpc.plasma-5-minute': 'https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json',
  'swpc.kp-1m': 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
  'swpc.kp-products': 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
  'mars.raw-images': 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=5&page=0&order=sol+desc&extended=sample_type::full,',
  'mars.photos-api': 'https://api.nasa.gov/mars-photos/api/v1/rovers/perseverance/latest_photos?api_key=DEMO_KEY',
  'nasa.images-api': 'https://images-api.nasa.gov/search?q=perseverance&media_type=image&page_size=2',
  apod: 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true&start_date=' + new Date(Date.now() - 3 * 86400e3).toISOString().slice(0, 10),
  'launches.2.3.0': 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=2',
  'launches.2.2.0': 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=2',
  'sdo.latest-0171': 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg',
  'youtube.nasa-live': 'https://www.youtube.com/embed/live_stream?channel=UCLA_DiR1FfKNvjuUpBHmylQ',
  'somafm.missioncontrol': 'https://ice.somafm.com/missioncontrol',
};

function shape(v, depth = 0) {
  if (Array.isArray(v)) return depth > 2 ? `[${v.length}]` : [`len=${v.length}`, v.length ? shape(v[v.length - 1], depth + 1) : null];
  if (v && typeof v === 'object') return depth > 2 ? '{…}' : Object.fromEntries(Object.entries(v).slice(0, 25).map(([k, x]) => [k, shape(x, depth + 1)]));
  return typeof v === 'string' ? v.slice(0, 80) : v;
}

async function liveCheck() {
  const results = {};
  for (const [name, url] of Object.entries(FEEDS)) {
    const binary = /\.(jpg|png)$|somafm|youtube/.test(url);
    let r;
    if (binary) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(url, { signal: ctrl.signal, headers: { origin: 'https://example.com' } });
        r = { ok: res.ok, status: res.status, headers: Object.fromEntries(res.headers) };
        ctrl.abort();
      } catch (e) {
        r = { ok: false, status: 0, error: String(e) };
      } finally {
        clearTimeout(t);
      }
    } else {
      r = await get(url, { headers: { origin: 'https://example.com' } });
    }
    results[name] = {
      url,
      status: r.status,
      ok: r.ok,
      cors: r.headers?.['access-control-allow-origin'] ?? null,
      contentType: r.headers?.['content-type'] ?? null,
      error: r.error,
      shape: r.body ? shape(r.body) : undefined,
    };
    log(`feed ${name}`, r.status, 'CORS:', results[name].cors);
  }
  return results;
}

const [inc, arc, nasa, feeds] = [await incompetech(), await archive(), await nasaAudio(), await liveCheck()];
await writeFile(`${OUT}/incompetech-candidates.json`, JSON.stringify(inc, null, 1));
await writeFile(`${OUT}/archive-candidates.json`, JSON.stringify(arc, null, 1));
await writeFile(`${OUT}/nasa-audio.json`, JSON.stringify(nasa, null, 1));
await writeFile(`${OUT}/live-feeds.json`, JSON.stringify(feeds, null, 1));
log('done');
