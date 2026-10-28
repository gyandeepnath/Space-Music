# Space Music

**Live radio from the solar system.** Six stations of live space views (the ISS, the whole Earth, the Sun, Mars, the deep sky and the next rocket launch), with music picked by each station's live data. **Everyone on a station hears the same music at the same moment**, so you can send someone a link, or put it on YouTube or TikTok, and listen together.

**Live at https://gyandeepnath.github.io/Space-Music/** (published automatically; see [docs/PLAN.md](docs/PLAN.md) for the one-time switch-on and what to do next).

| Phone | Live data | Desktop |
| --- | --- | --- |
| ![ISS Live on a phone](docs/screenshots/phone-iss.png) | ![Live data sheet](docs/screenshots/phone-sheet.png) | ![Solar Live on desktop](docs/screenshots/desktop-sun.png) |

| Going live (16:9) | Vertical stream | Car mode |
| --- | --- | --- |
| ![Broadcast layout](docs/screenshots/broadcast-16x9.png) | ![Vertical broadcast layout](docs/screenshots/broadcast-9x16.png) | ![Car mode](docs/screenshots/car-mode.png) |

> The screenshots were rendered by the smoke test with **fixture data and synthetic stand-in images** (marked "TEST IMAGE"), because the build sandbox had no internet access. Real use shows NASA's live imagery.

The thinking behind it (direction, music licensing, listening together, the TV and car paths, and open decisions) is in **[docs/CONCEPT.md](docs/CONCEPT.md)**. How to stream it is in **[docs/BROADCAST.md](docs/BROADCAST.md)**.

## Stations

| # | Dial | Station | You see | The music follows |
| --- | --- | --- | --- | --- |
| 1 | 408 | **ISS Live** | A live map of the station's orbit, with the ground track and day/night line, or NASA's live camera | Orbital day and night (brighter or darker music), latitude |
| 2 | 1.5 | **Blue Marble** | The whole sunlit Earth from NASA EPIC at L1 | Warm, gentle music; in live composition the chords follow longitude |
| 3 | 193 | **Solar Live** | The Sun in six SDO wavelengths | Solar wind speed, Kp index and magnetic field: quiet, active or storm music |
| 4 | 225 | **Jezero** | Perseverance's latest raw images (snapshotted every 3 hours) | Local time on Mars: day and night music; dusty afternoon winds |
| 5 | 13.8 | **Deep Field** | Astronomy Picture of the Day, or Hubble and Webb images from NASA's library | Slow, spacious music, including Holst conducting *The Planets* (1922) |
| 6 | T-0 | **Launch Pad** | Countdown to the next launch on Earth | Calm until the last 24 hours, then building |

## Music

Three sources, switched in ⋯ or with `M`:

- **Station music** (the default): 53 tracks, about 5 hours, chosen to fit each station: 46 by **Kevin MacLeod** ([incompetech.com](https://incompetech.com), CC BY 4.0) and **Gustav Holst conducting his own *The Planets*** with the London Symphony Orchestra, 1922–24 (public domain). Each station has a playlist per mood (day and night on the ISS and Mars; quiet, active and storm on the Sun; waiting and countdown for launches), and the live data picks the mood. The selection is in [`music/selection.json`](music/selection.json).
- **Live composition**: a synth engine that composes from the station's data (Web Audio, no samples). It's also what plays when the music files aren't there, e.g. when running locally.
- **SomaFM**'s space channels, streamed (falls back to station music if unreachable).

The audio isn't stored in this repository. When the site is published, [`tools/fetch-music.mjs`](tools/fetch-music.mjs) downloads each track from its official source, checks the Internet Archive license, evens out loudness, shortens very long pieces to 12 minutes, and writes `music/catalog.json`, `music/CREDITS.md` and `music/youtube-description.txt` (a ready-to-paste credit for streams). The app shows the credit of whatever is playing, and all credits are in ⋯ → Music credits.

## Listening together

- **In sync without a server.** Each station's playlist runs on a schedule counted from the Unix epoch, so a friend who opens your link lands on the same track at the same second. The live composition works the same way: chords and notes sit on a clock grid and every random choice is seeded by station and time slot. Slideshows are locked to the clock too.
- **Share** from the top bar (share sheet on phones, copied link elsewhere), or show a **QR code** for people nearby. Links look like `…/#sun` and open straight on that station.
- **Go live** on YouTube, Twitch, TikTok or Instagram with `?broadcast`: an on-air layout with a "tune in on your phone" QR code. See [docs/BROADCAST.md](docs/BROADCAST.md).

## Run it

No build step and no runtime dependencies. It's plain HTML and ES modules, served over HTTP:

```sh
python3 -m http.server 8080     # or: npx serve .
# open http://localhost:8080 and press "Tune in"
```

Run locally like this, it plays the live composition, because the station music is only added when publishing. To get it locally too (needs ffmpeg and internet): `node tools/fetch-music.mjs music`.

**Publishing is automatic.** Every push to the default branch runs [`.github/workflows/publish.yml`](.github/workflows/publish.yml): it builds the site with the music ([`tools/build-site.mjs`](tools/build-site.mjs), which also makes the link-preview URLs absolute) and pushes it to the `gh-pages` branch, which GitHub Pages serves. On phones it installs as an app, with home-screen shortcuts to each station.

**Optional:** get a free NASA API key at [api.nasa.gov](https://api.nasa.gov) and paste it in ⋯ → Settings. The shared `DEMO_KEY` allows about 30 requests an hour.

### Controls

Swipe the picture or tap a station tab to change station. On phones, tap the facts card for all the live data, the music settings and sharing; on a computer they're in the side panel. Use ⋯ for TV mode, car mode, the join code, going live and settings. Lock-screen, headset and steering-wheel next/previous buttons change station.

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `1`–`6`, `←` `→` | Change station |
| `I` | Live data |
| `S` | Share |
| `M` | Music source: station music → live composition → SomaFM |
| `D` | Space DJ on/off |
| `T` | TV mode (full screen, controls fade away) |
| `C` | Car mode (big buttons, nothing moving; `Esc` exits) |

## How it works

```
sources.js   live data: wheretheiss.at, NASA EPIC / SDO / APOD / image library / Perseverance
             raw images, NOAA SWPC, Launch Library 2 (each with fallbacks, cached where
             rate-limited)
astro.js     computed locally: Sun position, ISS orbit and Earth's shadow, Mars time
             (Mars24 algorithm), Earth–Mars distance (JPL elements)
stations.js  each station: its mood (key, scale, tempo, timbre), how its data shapes the
             music, its live facts, and what the DJ says
tracks.js    station music: clock-scheduled playlists per mood, crossfades, drift correction
engine.js    the live composition: pads, sub bass, plucked "stars", wind, telemetry blips,
             reverb and tuning static (Web Audio, no samples), scheduled on a shared clock;
             under station music it keeps only the wind and blips
radio.js     SomaFM streams as an alternative music source
dj.js        Space DJ: speech synthesis, ducking, sentence-by-sentence subtitles
views.js     clock-synced slideshow, ISS camera + map, launch countdown, oscilloscope
map.js       world map: Natural Earth coastlines, terminator, ground track, footprint;
             on narrow screens it zooms in and follows the ISS
app.js       the interface: tuning, swipe, sheet, sharing and QR, TV/car/broadcast modes

music/selection.json     the chosen tracks and each station's mood playlists
tools/fetch-music.mjs    downloads, checks and prepares the music; writes the catalog and credits
tools/build-site.mjs     assembles the published site in _site/
tools/fetch-feeds.mjs    snapshots Perseverance's raw-image feed to data/mars.json, because the
                         feed can't be read from a browser (no CORS); feeds.yml refreshes it
                         every 3 hours
tools/live-check.mjs     opens the published site in a real browser on GitHub's network and saves
                         what it finds (data, music, errors, screenshots) to reports/live/
tools/discover-music.mjs, tools/probe.mjs
                         run on GitHub Actions (discover.yml) to list candidate tracks and
                         check the live feeds; results in reports/
```

When a source is unreachable the station says **no signal** and retries; it never shows made-up data. The ISS map, the Mars clock and the Earth–Mars distance are computed locally, so they keep working offline.

## Tests

```sh
npm test         # unit tests: astronomy, parsers, the in-sync composition and playlists (Node 20+)
npm run smoke    # browser test with Playwright; screenshots go to test/screenshots/
node tools/render-art.mjs   # re-render art/*.png (lock-screen artwork) and og.png
```

The smoke test answers every API with fixtures shaped like that API's documented responses (including both of NOAA's JSON formats). It generates short test tones as stand-in station music, then drives all six stations, two listeners joining a few seconds apart (checking they hear the same track at the same second, and the same chord of the live composition), the music sources, swiping, the tuner, sharing and QR, settings, TV and car modes, a phone viewport, and both broadcast layouts.

## Status

This is a **prototype**, checked against the real feeds from GitHub's servers (October 2026; see `reports/probe.json`). That check found and fixed three breakages: NOAA retired its solar-wind plasma file (the app now reads NOAA's summary), the APOD API returns placeholder images (Deep Field now uses NASA's image library instead), and Perseverance's raw-image feed can't be read from a browser (the site now publishes a snapshot of it). The published site itself is checked in a real browser by `tools/live-check.mjs` (see `reports/live/`). Feeds change, so check the browser console for `[station]` warnings now and then. Known limits:

- NASA's ISS camera on YouTube is often off air or shows other NASA broadcasts, so ISS Live opens on the map; the camera is one tap away. Paste a specific ISS stream in Settings if the channel shows something else.
- SomaFM's audio can't be measured cross-origin, so the oscilloscope doesn't draw it. SomaFM also refused connections from GitHub's servers, so it's untested from there; it falls back to station music.
- Background playback with the screen locked depends on the browser.

## Credits

Data and imagery: NASA (EPIC/DSCOVR, SDO, APOD, Perseverance raw images, NASA/JPL-Caltech), NOAA Space Weather Prediction Center, [wheretheiss.at](https://wheretheiss.at), [The Space Devs](https://thespacedevs.com) Launch Library 2. APOD images are often copyrighted by their photographers, and the app shows each credit. Music: Kevin MacLeod ([incompetech.com](https://incompetech.com)), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); Gustav Holst, *The Planets*, London Symphony Orchestra conducted by the composer, 1922–24 (public domain, via the [Internet Archive](https://archive.org/details/holst-the-planets-holst-london-symphony-orchestra-1922-1924)); the full list is generated as `music/CREDITS.md`. Radio: [SomaFM](https://somafm.com) (listener-supported). Map: Natural Earth (public domain). Fonts: Space Grotesk and JetBrains Mono (SIL Open Font License, in `fonts/`). QR codes: qrcode-generator by Kazuhiko Arase (MIT, in `vendor/`).
