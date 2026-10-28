// Builds the station music from music/selection.json:
//   download each track from its official source (cached), check its license,
//   make an excerpt of very long pieces, even out loudness, and write
//   <out>/tracks/*.mp3, <out>/catalog.json, <out>/CREDITS.md and
//   <out>/youtube-description.txt.
//
// Usage: node tools/fetch-music.mjs [outDir=_site/music]
// Needs internet access and ffmpeg/ffprobe. Runs in the Publish workflow.

import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';

const run = promisify(execFile);
const out = process.argv[2] || '_site/music';
const cache = process.env.MUSIC_CACHE || '.music-cache';
const sel = JSON.parse(await readFile('music/selection.json', 'utf8'));
const MAX = sel.maxSeconds || 720;

await mkdir(join(out, 'tracks'), { recursive: true });
await mkdir(cache, { recursive: true });

const exists = async (p) => (await stat(p).catch(() => null))?.size > 0;

async function download(url, to) {
  if (await exists(to)) return;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'SpaceMusic/0.2 (github.com/gyandeepnath/Space-Music)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(to, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (attempt === 3) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=channels', '-of', 'json', file]);
  const j = JSON.parse(stdout);
  return { duration: Number(j.format?.duration) || 0, channels: j.streams?.[0]?.channels || 2 };
}

// Internet Archive items: verify the license, then map tracks to files.
const archiveFiles = {};
for (const [key, src] of Object.entries(sel.sources)) {
  if (!src.archive) continue;
  const res = await fetch(`https://archive.org/metadata/${src.archive}`);
  const meta = await res.json();
  const license = meta.metadata?.licenseurl || '';
  if (!license.includes(src.expectLicense)) throw new Error(`${src.archive}: license is "${license}", expected ${src.expectLicense}`);
  archiveFiles[key] = (meta.files || []).filter((f) => /\.mp3$/i.test(f.name) && !/_sample/i.test(f.name));
  console.log(`archive ${src.archive}: license ok (${license}), ${archiveFiles[key].length} mp3 files`);
}

function sourceUrl(t) {
  const src = sel.sources[t.source];
  if (src.downloadBase) return src.downloadBase + encodeURIComponent(t.file).replace(/%2F/g, '/');
  const f = archiveFiles[t.source].find((x) => x.name.includes(t.match));
  if (!f) throw new Error(`no file matching "${t.match}" in ${src.archive}`);
  return `https://archive.org/download/${src.archive}/${encodeURIComponent(f.name)}`;
}

async function build(t) {
  const src = sel.sources[t.source];
  const url = sourceUrl(t);
  const raw = join(cache, `${t.id}.src.mp3`);
  await download(url, raw);
  const info = await probe(raw);
  const excerpt = info.duration > MAX + 30;
  const length = excerpt ? MAX : info.duration;
  const filters = ['loudnorm=I=-18:TP=-1.5:LRA=11', 'afade=t=in:d=0.3'];
  if (excerpt) filters.push(`afade=t=out:st=${MAX - 10}:d=10`);
  const mono = info.channels === 1;
  const file = join(out, 'tracks', `${t.id}.mp3`);
  await run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-t', String(length), '-af', filters.join(','), '-ac', mono ? '1' : '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', mono ? '64k' : '112k', '-map_metadata', '-1', file]);
  const { duration } = await probe(file);
  const changes = excerpt ? `excerpt (first ${Math.round(MAX / 60)} of ${Math.round(info.duration / 60)} minutes), loudness evened` : 'loudness evened';
  return {
    id: t.id,
    title: t.title,
    artist: src.artist,
    license: src.license,
    licenseUrl: src.licenseUrl,
    site: src.site,
    sourceUrl: url,
    file: `music/tracks/${t.id}.mp3`,
    duration: Math.round(duration * 100) / 100,
    changes,
    credit: src.credit.replace('{title}', t.title),
  };
}

// A few at a time: polite to the sources, quick enough for CI.
const results = [];
const failures = [];
const queue = [...sel.tracks];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const t = queue.shift();
      try {
        const r = await build(t);
        results.push(r);
        console.log(`ok   ${t.id} ${Math.round(r.duration)}s (${r.changes})`);
      } catch (e) {
        failures.push({ id: t.id, error: e.message });
        console.log(`FAIL ${t.id}: ${e.message}`);
      }
    }
  }),
);

const order = Object.fromEntries(sel.tracks.map((t, i) => [t.id, i]));
results.sort((a, b) => order[a.id] - order[b.id]);
const catalog = { generated: new Date().toISOString(), tracks: results, stations: sel.stations };
await writeFile(join(out, 'catalog.json'), JSON.stringify(catalog));

const hours = results.reduce((s, t) => s + t.duration, 0) / 3600;
const credits = [
  '# Music credits',
  '',
  `Space Music plays ${results.length} tracks (${hours.toFixed(1)} hours). Changes made: loudness evened; very long pieces are excerpts.`,
  '',
  ...results.map((t) => `- ${t.credit}. Changes: ${t.changes}. Source: ${t.sourceUrl}`),
  '',
].join('\n');
await writeFile(join(out, 'CREDITS.md'), credits);

const yt = [
  'Live views of space, with music chosen by what is happening right now: orbital sunrise on the ISS, solar wind, the time of day on Mars. Tune in on your phone and hear the same music in sync: link in the QR code on screen.',
  '',
  'Data and imagery: NASA (EPIC/DSCOVR, SDO, APOD, Perseverance raw images · NASA/JPL-Caltech), NOAA SWPC, wheretheiss.at, The Space Devs.',
  '',
  'Music:',
  ...results.map((t) => t.credit),
  '',
].join('\n');
await writeFile(join(out, 'youtube-description.txt'), yt);

console.log(`\n${results.length} tracks, ${hours.toFixed(2)} hours; ${failures.length} failed`);
if (failures.length) console.log(JSON.stringify(failures, null, 1));
if (!results.length) process.exit(1);
