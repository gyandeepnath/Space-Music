// Assembles the publishable site in _site/: the app, plus the station music
// (via fetch-music.mjs) and feed snapshots (via fetch-feeds.mjs), with
// absolute link-preview URLs for social apps.
// Usage: SITE_URL=https://user.github.io/repo/ node tools/build-site.mjs

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const SITE = '_site';
const siteUrl = (process.env.SITE_URL || '').replace(/\/?$/, '/');

await rm(SITE, { recursive: true, force: true });
await mkdir(SITE, { recursive: true });
for (const p of ['index.html', 'manifest.webmanifest', 'sw.js', 'og.png', 'css', 'js', 'data', 'fonts', 'icons', 'art', 'vendor']) {
  await cp(p, `${SITE}/${p}`, { recursive: true });
}
await writeFile(`${SITE}/.nojekyll`, '');

if (siteUrl !== '/') {
  let html = await readFile(`${SITE}/index.html`, 'utf8');
  html = html
    .replace('<meta property="og:image" content="og.png" />', `<meta property="og:image" content="${siteUrl}og.png" />\n    <meta property="og:url" content="${siteUrl}" />`)
    .replace('<meta name="twitter:card" content="summary_large_image" />', `<meta name="twitter:card" content="summary_large_image" />\n    <meta name="twitter:image" content="${siteUrl}og.png" />`);
  await writeFile(`${SITE}/index.html`, html);
}

execFileSync('node', ['tools/fetch-music.mjs', `${SITE}/music`], { stdio: 'inherit' });
execFileSync('node', ['tools/fetch-feeds.mjs', SITE], { stdio: 'inherit' });
console.log(`site assembled in ${SITE}/ for ${siteUrl}`);
