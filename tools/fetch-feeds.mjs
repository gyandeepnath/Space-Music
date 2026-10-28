// Snapshots feeds that browsers can't read directly, so the site can serve
// them from its own address. Perseverance's raw-image feed sends no CORS
// header, so the app reads <out>/data/mars.json instead (same shape as the
// feed, trimmed). Runs at publish time and every few hours (feeds.yml).
//
// Usage: node tools/fetch-feeds.mjs [outDir=_site]

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const out = process.argv[2] || '_site';
const MARS =
  'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=100&page=0&order=sol+desc&extended=sample_type::full,';

async function getJSON(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'space-music feed snapshot' } });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

await mkdir(join(out, 'data'), { recursive: true });
try {
  const d = await getJSON(MARS);
  const images = (d.images || [])
    .filter((i) => i.image_files?.large || i.image_files?.medium)
    .map((i) => ({
      image_files: { large: i.image_files.large, medium: i.image_files.medium },
      sol: i.sol,
      camera: { instrument: i.camera?.instrument },
      date_taken_utc: i.date_taken_utc,
    }));
  if (!images.length) throw new Error('the feed listed no images');
  await writeFile(join(out, 'data', 'mars.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), images }));
  console.log(`mars: ${images.length} images, latest sol ${images[0].sol}`);
} catch (e) {
  // Keep publishing without it; the app falls back to NASA's image library.
  console.log(`::warning::Perseverance feed snapshot failed: ${e.message}`);
}
