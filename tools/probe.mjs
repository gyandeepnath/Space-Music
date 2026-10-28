// One-off probes run on GitHub Actions: candidate endpoints and download URLs.
import { writeFile, mkdir } from 'node:fs/promises';
await mkdir('reports', { recursive: true });
const probe = async (url, { body = true } = {}) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { origin: 'https://example.com', range: body ? undefined : 'bytes=0-1023' } });
    const type = res.headers.get('content-type') || '';
    let sample = null;
    if (body && /json|text|scpls/.test(type)) sample = (await res.text()).slice(0, 3000);
    else ctrl.abort();
    return { url, status: res.status, type, cors: res.headers.get('access-control-allow-origin'), length: res.headers.get('content-length'), sample };
  } catch (e) {
    return { url, status: 0, error: String(e) };
  } finally {
    clearTimeout(t);
  }
};
const urls = [
  'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true&start_date=2015-10-24&end_date=2015-11-01',
  'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true&start_date=2023-10-24&end_date=2023-11-01',
  'https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json',
  'https://images-api.nasa.gov/search?q=James%20Webb%20Space%20Telescope&media_type=image&page_size=3',
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json',
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-6-hour.json',
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json',
  'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json',
  'https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json',
  'https://services.swpc.noaa.gov/products/solar-wind/',
  'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true&start_date=' + new Date(Date.now() - 9 * 86400e3).toISOString().slice(0, 10),
  'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=1&page=0&order=sol+desc&extended=sample_type::full,',
  'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=1',
  'https://archive.org/metadata/holst-the-planets-holst-london-symphony-orchestra-1922-1924',
];
const binaries = [
  'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluidscape.mp3',
  'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Tranquility%20Base.mp3',
  'https://ice1.somafm.com/missioncontrol-128-mp3',
  'https://ice2.somafm.com/missioncontrol-128-mp3',
  'https://ice4.somafm.com/missioncontrol-128-mp3',
  'https://ice6.somafm.com/missioncontrol-128-mp3',
  'https://ice.somafm.com/missioncontrol',
  'https://somafm.com/missioncontrol130.pls',
];
const out = [];
for (const u of urls) out.push(await probe(u));
for (const u of binaries) out.push(await probe(u, { body: u.endsWith('.pls') }));
for (const r of out) console.log(r.status, r.cors, r.type, r.url);
await writeFile('reports/probe.json', JSON.stringify(out, null, 1));
