# Your plan: what's done, and the little that's left

Everything below is set up. You can rest; nothing here is urgent.

## What's done

- **The app**: six live stations (ISS, Earth, Sun, Mars, deep sky, launches), a phone-first design, sharing and QR codes, TV, car and broadcast modes.
- **The music**: 53 tracks chosen for you, about 5 hours.
  - 46 pieces by **Kevin MacLeod** (incompetech.com, CC BY 4.0).
  - **Gustav Holst conducting his own *The Planets*** with the London Symphony Orchestra, recorded 1922–24 (public domain).
  - Each station has playlists for its moods: day and night on the ISS and on Mars; quiet, active and storm on the Sun; waiting and countdown for launches. The live data picks the mood. See [`music/selection.json`](../music/selection.json).
- **Listening together**: everyone on a station hears the same track at the same second. This is tested: two browsers joining apart play 0.00 s apart.
- **Licenses handled**: the music is downloaded from the official sources when the site is published, and the Internet Archive license is checked automatically. Credits are generated for the app, for `music/CREDITS.md` and for a ready-to-paste YouTube description, `music/youtube-description.txt`.
- **Checked against the real feeds**: on GitHub's network, the ISS, Earth (EPIC), Kp, Mars raw images and launch feeds all work. Two broken sources were fixed:
  - NOAA retired its solar-wind file, so the app now uses NOAA's newer summary.
  - The APOD API returns NASA-logo placeholders instead of pictures. Deep Field skips those and shows Hubble and Webb nebulae and galaxies from NASA's image library instead.
  - Solar Live also shows the solar wind's magnetic field now (a southward field means aurora is more likely).
  - Perseverance's image feed can't be read by browsers, so the site now publishes a snapshot of it every 3 hours.
- **Checked on the live site**: a real browser on GitHub's network opens the published site and tunes through every station. The latest results and screenshots are in `reports/live/`; run *Actions → Check the live site* to repeat it.
- **The interface**: minimal and organised. On phones, the live view sits on top; under it are the station, what's playing, three headline facts and a tab for each station. Tap the facts for everything else. On computers, everything sits in a side panel next to the view.
- **Publishing is automatic**: every change to the main branch rebuilds the site and publishes it to the `gh-pages` branch. The audio never enters your main history.

## What's left for you

**Nothing.** GitHub Pages is on, and the site is live at **https://gyandeepnath.github.io/Space-Music/**. It updates itself whenever the project changes.

One thing to know: GitHub pauses scheduled jobs in repositories with no activity for 60 days. If Jezero ever shows old pictures, open *Actions → Refresh feed snapshots* and press *Enable workflow*.

## When you feel like it (optional, no rush)

| When | What | Time |
| --- | --- | --- |
| Any evening | Open the site on your phone, press **Tune in**, and listen with headphones | 10 min |
| Later | Send the link to 2–3 friends. Ask one thing: "would you leave this on?" | 5 min |
| Later | Install it on your phone: share menu → *Add to Home Screen* | 1 min |
| If you want an audience | A 24/7 YouTube stream with OBS: follow [BROADCAST.md](BROADCAST.md) and paste `music/youtube-description.txt` as the description | 30 min, once |
| On big space days | Launches, eclipses, aurora storms: share the matching station link on those days | 2 min |

## Changing the music later

Add or swap tracks in [`music/selection.json`](../music/selection.json):

- For a Kevin MacLeod track, copy its title and file name from incompetech.com.
- List the track under a station's mood.
- Push the change. The next publish downloads it, checks it and credits it.

Only use music that is CC BY, CC0 or public domain. "Non-commercial" or "no derivatives" licenses aren't allowed, because the app evens out loudness and excerpts long pieces.
