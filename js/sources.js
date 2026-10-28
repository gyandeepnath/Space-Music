// Live data sources. Every source is free and keyless or works with NASA's
// DEMO_KEY; each one has a fallback where a second public endpoint exists.
// Nothing here invents data: on failure the caller gets an error and the UI
// shows "no signal".

import { hashString, mulberry32 } from './engine.js';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`spacemusic:${key}`);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`spacemusic:${key}`, JSON.stringify(value));
    } catch {
      /* private mode or quota: settings just won't persist */
    }
  },
};

export async function getJSON(url, { timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function cached(key, ttlMs, load) {
  const hit = store.get(`cache:${key}`);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  const value = await load();
  store.set(`cache:${key}`, { t: Date.now(), v: value });
  return value;
}

async function firstOk(loaders) {
  let lastError = new Error('no source responded');
  for (const load of loaders) {
    try {
      const value = await load();
      if (value != null && !(Array.isArray(value) && value.length === 0)) return value;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// Shuffled the same way for everyone on the same UTC day, so slideshows stay in sync.
function dailyShuffle(list, salt) {
  const rand = mulberry32(hashString(`${salt}:${new Date().toISOString().slice(0, 10)}`));
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const num = (v) => (v == null || v === '' ? NaN : Number(v));

// NOAA SWPC serves some products as [header, ...rows] and (since 2026) others as
// arrays of objects. Normalise both to objects.
export function tableToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (Array.isArray(rows[0])) {
    const [head, ...rest] = rows;
    return rest.map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
  }
  return rows;
}

function lastWhere(records, pick) {
  for (let i = records.length - 1; i >= 0; i--) {
    const v = pick(records[i]);
    if (Number.isFinite(v)) return { value: v, record: records[i] };
  }
  return null;
}

// --- ISS (wheretheiss.at) --------------------------------------------------------

export async function issNow() {
  const d = await getJSON('https://api.wheretheiss.at/v1/satellites/25544', { timeout: 8000 });
  return {
    lat: d.latitude,
    lon: d.longitude,
    alt: d.altitude,
    velocity: d.velocity,
    visibility: d.visibility,
    time: d.timestamp * 1000,
  };
}

export async function placeBelow(lat, lon) {
  const d = await getJSON(`https://api.wheretheiss.at/v1/coordinates/${lat.toFixed(3)},${lon.toFixed(3)}`, {
    timeout: 8000,
  });
  return { countryCode: d.country_code, timezone: d.timezone_id };
}

// --- Earth from L1 (NASA EPIC on DSCOVR) -----------------------------------------

function epicItem(x, base, query = '') {
  const [day] = x.date.split(' ');
  const [y, m, d] = day.split('-');
  return {
    src: `${base}/${y}/${m}/${d}/jpg/${x.image}.jpg${query}`,
    caption: `DSCOVR / EPIC · ${x.date} UTC`,
    time: `${x.date.replace(' ', 'T')}Z`,
    lat: x.centroid_coordinates?.lat,
    lon: x.centroid_coordinates?.lon,
  };
}

export function epicLatest(nasaKey) {
  return cached('epic', 3 * 3600e3, () =>
    firstOk([
      async () =>
        (await getJSON('https://epic.gsfc.nasa.gov/api/natural')).map((x) =>
          epicItem(x, 'https://epic.gsfc.nasa.gov/archive/natural'),
        ),
      async () =>
        (await getJSON(`https://api.nasa.gov/EPIC/api/natural?api_key=${nasaKey}`)).map((x) =>
          epicItem(x, 'https://api.nasa.gov/EPIC/archive/natural', `?api_key=${nasaKey}`),
        ),
    ]),
  );
}

// --- The Sun (SDO imagery + NOAA SWPC space weather) -----------------------------

export const SDO_CHANNELS = [
  { id: '0171', label: 'AIA 171 Å', detail: 'coronal loops, ~600,000 °C' },
  { id: '0193', label: 'AIA 193 Å', detail: 'corona and hot flare plasma, ~1 million °C' },
  { id: '0304', label: 'AIA 304 Å', detail: 'chromosphere and prominences, ~50,000 °C' },
  { id: '0211', label: 'AIA 211 Å', detail: 'active-region corona, ~2 million °C' },
  { id: '0131', label: 'AIA 131 Å', detail: 'flaring regions, up to ~10 million °C' },
  { id: 'HMIIC', label: 'HMI continuum', detail: 'visible-light surface and sunspots' },
];

export function sdoImages() {
  const bust = Math.floor(Date.now() / 900e3); // SDO refreshes these every few minutes
  return SDO_CHANNELS.map((c) => ({
    src: `https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_${c.id}.jpg?t=${bust}`,
    caption: `NASA SDO · ${c.label} · ${c.detail}`,
    channel: c,
  }));
}

async function solarWind() {
  const records = tableToObjects(await getJSON('https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json'));
  const speed = lastWhere(records, (r) => num(r.speed));
  if (!speed) throw new Error('no solar wind reading');
  return { speed: speed.value, density: num(speed.record.density), time: speed.record.time_tag };
}

async function kpIndex() {
  return firstOk([
    async () => {
      const records = await getJSON('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json');
      const kp = lastWhere(records, (r) => num(r.estimated_kp ?? r.kp_index ?? parseFloat(r.kp)));
      return kp && { value: kp.value, time: kp.record.time_tag };
    },
    async () => {
      const records = tableToObjects(await getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'));
      const kp = lastWhere(records, (r) => num(r.Kp ?? r.kp ?? r.kp_index));
      return kp && { value: kp.value, time: kp.record.time_tag };
    },
  ]);
}

export async function spaceWeather() {
  const [wind, kp] = await Promise.allSettled([solarWind(), kpIndex()]);
  if (wind.status === 'rejected' && kp.status === 'rejected') throw wind.reason;
  return {
    wind: wind.status === 'fulfilled' ? wind.value : null,
    kp: kp.status === 'fulfilled' ? kp.value : null,
  };
}

// --- Mars (Perseverance raw images) ----------------------------------------------

const CAMERA_NAMES = [
  ['MCZ', 'Mastcam-Z'],
  ['NAVCAM', 'Navcam'],
  ['HAZCAM', 'Hazcam'],
  ['SUPERCAM', 'SuperCam'],
  ['SHERLOC', 'SHERLOC WATSON'],
  ['SKYCAM', 'MEDA SkyCam'],
  ['CACHECAM', 'CacheCam'],
];

function cameraName(instrument = '') {
  const hit = CAMERA_NAMES.find(([prefix]) => instrument.toUpperCase().includes(prefix));
  return hit ? hit[1] : instrument.replace(/_/g, ' ') || 'Camera';
}

export function marsImages(nasaKey) {
  return cached('mars', 2 * 3600e3, () =>
    firstOk([
      async () => {
        const d = await getJSON(
          'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=60&page=0&order=sol+desc&extended=sample_type::full,',
        );
        const all = (d.images || [])
          .filter((i) => i.image_files?.large || i.image_files?.medium)
          .map((i) => ({
            src: i.image_files.large || i.image_files.medium,
            caption: `Perseverance · ${cameraName(i.camera?.instrument)} · Sol ${i.sol}`,
            sol: i.sol,
            camera: cameraName(i.camera?.instrument),
            time: i.date_taken_utc,
          }));
        // Prefer the landscape cameras over close-up engineering shots.
        const scenic = all.filter((i) => ['Mastcam-Z', 'Navcam', 'Hazcam', 'MEDA SkyCam'].includes(i.camera));
        return (scenic.length >= 6 ? scenic : all).slice(0, 30);
      },
      async () => {
        const d = await getJSON(
          `https://api.nasa.gov/mars-photos/api/v1/rovers/perseverance/latest_photos?api_key=${nasaKey}`,
        );
        return (d.latest_photos || []).slice(0, 30).map((p) => ({
          src: p.img_src,
          caption: `Perseverance · ${p.camera?.full_name ?? 'Camera'} · Sol ${p.sol}`,
          sol: p.sol,
          camera: p.camera?.full_name,
          time: p.earth_date,
        }));
      },
      () => nasaLibrary('Perseverance rover Jezero crater'),
    ]),
  );
}

// --- NASA Image and Video Library (archival fallback) ----------------------------

export async function nasaLibrary(query) {
  const d = await getJSON(
    `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=60`,
  );
  const items = (d.collection?.items || [])
    .map((it) => {
      const data = it.data?.[0];
      const href = it.links?.find((l) => l.render === 'image')?.href || it.links?.[0]?.href;
      if (!href) return null;
      return {
        src: href.replace('~thumb', '~medium'),
        fallback: href,
        caption: `${data?.title ?? 'NASA'} · NASA Image Library (archive)`,
        time: data?.date_created,
        archive: true,
      };
    })
    .filter(Boolean);
  return dailyShuffle(items, query).slice(0, 30);
}

// --- Deep space (APOD) -----------------------------------------------------------

function apodItem(a) {
  if (!a) return null;
  const src = a.media_type === 'image' ? a.url : a.thumbnail_url;
  if (!src) return null;
  return {
    src,
    caption: `APOD ${a.date} · ${a.title}${a.copyright ? ` · © ${a.copyright.replace(/\s+/g, ' ').trim()}` : ''}`,
    title: a.title,
    date: a.date,
    explanation: a.explanation,
  };
}

// Today's picture plus the days before it: the same list for everyone.
export function apod(nasaKey) {
  const day = new Date().toISOString().slice(0, 10);
  return cached(`apod:${day}`, 6 * 3600e3, async () => {
    const since = new Date(Date.now() - 9 * 86400e3).toISOString().slice(0, 10);
    let error;
    try {
      const list = await getJSON(`https://api.nasa.gov/planetary/apod?api_key=${nasaKey}&thumbs=true&start_date=${since}`);
      const items = list.map(apodItem).filter(Boolean).reverse(); // newest first
      if (items.length) return { today: items[0], items };
    } catch (e) {
      error = e;
    }
    const archive = await nasaLibrary('James Webb Space Telescope');
    if (!archive.length) throw error || new Error('no APOD images');
    return { today: null, items: archive };
  });
}

// --- Launches (The Space Devs, Launch Library 2) ---------------------------------

function launchItem(r) {
  const [rocket, mission] = r.name.includes('|') ? r.name.split('|').map((s) => s.trim()) : [r.name, r.name];
  return {
    name: r.name,
    rocket,
    mission,
    net: Date.parse(r.net),
    status: r.status?.abbrev || r.status?.name || '',
    statusName: r.status?.name || '',
    provider: r.launch_service_provider?.name || r.lsp_name || '',
    location: r.pad?.location?.name || r.location || '',
    image: typeof r.image === 'string' ? r.image : r.image?.image_url || r.image?.thumbnail_url || null,
  };
}

export function upcomingLaunches() {
  // The free tier allows ~15 requests an hour, so cache generously.
  return cached('launches', 30 * 60e3, () =>
    firstOk([
      async () => (await getJSON('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=6')).results.map(launchItem),
      async () => (await getJSON('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=6')).results.map(launchItem),
    ]),
  );
}
