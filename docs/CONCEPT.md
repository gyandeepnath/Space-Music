# Space Music: concept exploration

> **A radio for the solar system.** Tune between live views of space (the ISS, the whole Earth, the Sun, Mars, the deep sky, the next rocket launch) and hear music that is composed, live, from what you're looking at.

This doc explores the idea: what makes it different, how people would use it, how the music could work, how people listen together, how it gets onto a TV or into a car, and which decisions are still open. The prototype in this repo implements the core of it.

**Direction (decided): phone and web first, and social.** It should be easy to send someone a link and listen together, and to put the stream on YouTube, TikTok and other social platforms so people can tune in from there.

---

## 1. What already exists, and the gap

| Already out there | What it gives you | What it doesn't |
| --- | --- | --- |
| NASA's live ISS camera on YouTube | A real window on Earth | No music; often black (night side) or a blue "loss of signal" screen; no context |
| Ambient "space" channels (YouTube, Spotify playlists) | Nice music, pretty loops | Nothing live; the picture has nothing to do with the sound |
| SomaFM *Mission Control*, *Deep Space One* | Great curated space ambient, some with real NASA comms | Audio only |
| NASA apps / APOD | Real imagery and facts | Something you read, not something you leave on |

The gap is the combination: **live** space imagery, **music that reacts to it**, and a **lean-back radio format** you can leave on all day, on a TV, in headphones or in a car.

## 2. The hook: the data plays the music

Each station maps live (or live-computed) data onto the music. That's what makes this more than a NASA viewer with a playlist: the music is *about* what's happening, and it never plays the same way twice.

| Preset | Dial | Station | Live view | Live data | What the data does to the music |
| --- | --- | --- | --- | --- | --- |
| 1 | **408** km (ISS altitude) | **ISS Live** | NASA's ISS camera, plus a map with the ground track and day/night line | Position, altitude, speed, sunlight vs Earth's shadow | Orbital sunrise switches to a bright lydian key, Earth's shadow to a darker dorian one, about 16 times a day. Higher latitudes bring more "wind" |
| 2 | **1.5** M km (to L1) | **Blue Marble** | NASA EPIC's full-disk Earth images from DSCOVR | Longitude at the centre of each frame | The chord follows the longitude, so the harmony turns with the planet |
| 3 | **193** Å (SDO channel) | **Solar Live** | SDO's Sun in six wavelengths | Solar wind speed and density, Kp index (NOAA) | Wind speed makes it busier and brighter, density sets the noise, Kp sets the tension. A geomagnetic storm (Kp ≥ 5) switches to a whole-tone scale |
| 4 | **225** M km (to Mars) | **Jezero** | Perseverance's latest raw images | Mission sol, local time at Jezero, Earth–Mars distance and signal delay (computed) | Mars daytime is brighter. Afternoons are windier, matching the dust-devil peak |
| 5 | **13.8** Gyr (age of the universe) | **Deep Field** | Astronomy Picture of the Day, plus the archive | Today's date | The key and melody are seeded by the date, so there's a new piece every day |
| 6 | **T-0** | **Launch Pad** | Countdown to the next launch anywhere on Earth | Upcoming launches (Launch Library 2) | It gets busier over the last 48 hours, and the "telemetry blips" speed up towards liftoff |

**The radio around it:** swipe between stations, or drag a tuning ruler with real static between the stations. The player's text steps through live facts, like RDS on a car radio, and an oscilloscope draws the actual music. There's also a **Space DJ**. The DJ uses the device's own text-to-speech to read live facts between the music, for example: *"The crew is moving at 27,600 kilometres an hour, over Kazakhstan, where it's 4:12 pm. Orbital sunset in about 11 minutes."* The music ducks while it talks, and each sentence is subtitled as it's spoken.

## 3. Ways to use it

| Mode | Where | The screen | The sound |
| --- | --- | --- | --- |
| **Phone and web** (primary) | Phone, laptop, headphones | Full-bleed live view: swipe between stations, a tuning ruler, live data in a sheet | Station music or the live composition, with the DJ between the music |
| **Broadcast** | YouTube Live, Twitch, TikTok, Instagram, YouTube Shorts | An on-air layout with a QR code to tune in, 16:9 or vertical | The same live composition, so viewers can join on their phones |
| **TV** | TV, desktop second screen | Full screen; the controls fade away | Ambient, always on |
| **Car** | Phone in a dash mount (later: CarPlay / Android Auto) | Six big presets. **Nothing moves** | Primary: steering-wheel next/previous changes station |

All four exist in the prototype.

## 4. Listening together

**Everyone on a station hears the same music at the same moment, with no server.** The composition runs on a grid of eighth notes counted from the Unix epoch, and every random choice (which notes sound, the melody's walk, the chord colours) is seeded by station and grid slot. The live data that shapes the music (orbital sunrise, solar wind, the time on Mars) is the same for everyone, and slideshows are locked to the clock too. So when a friend opens your link, their phone joins mid-chord, on the same note and the same picture. Device clocks are typically within a fraction of a second of each other, which is plenty for ambient music.

What's built:
- **Shareable station links** (`…/#sun`), the phone's **share sheet** (with copy-link as a fallback), and a **QR code** for people in the same room.
- **Link previews** for messaging and social apps (Open Graph image and text).
- **Broadcast mode** (`?broadcast`) for YouTube, Twitch, TikTok and Instagram: an on-air layout with a QR code, a ticker and an "up next" schedule that follows the clock. See [BROADCAST.md](BROADCAST.md).
- **Lock-screen and headset controls** with per-station artwork, and **home-screen shortcuts** to each station when installed.

What would need a small backend (none of it is built):
- **"142 listening now"** presence, reactions or chat. A tiny realtime service (e.g. Cloudflare Durable Objects or Supabase Realtime) would do; it doesn't have to carry audio.
- **Unattended 24/7 YouTube channel:** today it needs OBS running on some machine. A headless renderer on a server could stream it on its own.
- **Shareable clips** (a 15-second vertical video of "this moment" for Reels/TikTok): in-browser recording is possible, but many space images aren't served with the CORS headers needed to draw them into a video, so this likely needs a server-side renderer.

## 5. Music strategy (the big decision)

| Option | Pros | Cons | Status |
| --- | --- | --- | --- |
| **A. Generative and sonified**: a synth engine driven by data | Unique (the core idea), free, no licensing, endless, works offline | Stays ambient; the sound has a quality ceiling until it's sample-based | **Built** (Web Audio, no samples) |
| **B. Curated internet radio** (SomaFM) | Real, well-curated music; *Mission Control* mixes in NASA comms | Third-party dependency; check SomaFM's terms before any commercial use; can't react to the data | **Built** as a second source, falling back to A if unreachable |
| **C. Free-licensed recordings** (CC BY, CC0, public domain), scheduled by mood | Real music, free, streamable on YouTube; no contracts or contact with artists; the data still picks the mood | Credit required (CC BY); a fixed catalogue, so it repeats after a few hours; Content ID can misfire on CC BY music | **Built and the default**: 53 tracks by Kevin MacLeod and Holst's own 1922 *The Planets* (see `music/selection.json`) |
| **C2. Licensed production-music catalogue** | Polished, many genres | Recurring cost; streaming and broadcast rights need checking | Not built |
| **D. User's own Spotify / Apple Music** | Familiar | Their developer terms restrict pairing recordings with visuals and other audio, which is exactly this app; verify current terms first | Not recommended |
| **E. Artist stems arranged by data** | Real musicians *and* live reactivity, like adaptive game music | Needs commissioning and a stem-mixing engine | The natural "v2" of A |
| **F. NASA sounds as interstitials**: Chandra sonifications, Perseverance's Mars microphone, mission audio | Authentic, mostly public domain (check each item) | Not music on its own | Easy add-on |

**Recommendation:** lead with **A** (it *is* the product and it's legally clean), keep **B** as the "just play me something" option, and grow toward **E**: invite artists to write stems for each station, and let the live data arrange them.

## 6. Getting into the car

**Today (built): an installable web app (PWA).**
- The **Media Session API** puts station and live info ("ISS Live · over Kazakhstan · daylight") on the car's display over Bluetooth, and maps **steering-wheel next/previous to station changes**.
- The **Screen Wake Lock API** keeps a dash-mounted phone awake.
- Car mode hides all moving imagery and shows only big targets.

**Next steps, in order of effort:**
1. **Android Auto:** needs a native Android app with a Media3 `MediaLibraryService`. The car draws its own templated UI (a browse list of six stations plus now-playing), and you never draw visuals while driving.
2. **Android Automotive OS** (cars with Google built in: Polestar, Volvo, GM and others): the same media-app model, distributed through Play. Video is allowed only while parked, on some makes.
3. **CarPlay:** needs Apple's CarPlay audio entitlement and a native iOS app (`CPListTemplate` / `CPNowPlayingTemplate`).

**The architectural fork this exposes:** today the music is generated *in your browser*. Native car apps, smart speakers ("Alexa, play Solar Live"), TuneIn and similar outlets all want an **audio stream**. Rendering each station on a server and broadcasting it (Icecast/HLS) would make Space Music a *real* radio station: everyone hears the same orbital sunrise at the same moment, the DJ can be rendered server-side with a better voice, and one server fetch serves all listeners, which also fixes API rate limits. The trade-off is hosting cost, and losing the personal, offline-capable version.

## 7. Getting onto the TV

- TV mode already works as a TV screensaver: cast a tab, or open it in a smart-TV browser.
- Samsung (Tizen) and LG (webOS) TV apps are web apps, so this codebase ports with little change. Apple TV, Android TV and Fire TV need native shells.
- The pitch here is "ambient TV": like Apple's Aerial screensavers, but live, and with sound.

## 8. More station and feature ideas

- **"Look up!" ISS pass alerts:** using your location plus orbital elements (CelesTrak TLEs and SGP4), the DJ breaks in with *"The ISS will be overhead in 3 minutes, look to the north-west."* Probably the single most delightful feature.
- **Deep Space Network station:** NASA's *DSN Now* shows which spacecraft are talking to Earth right now. Each active link becomes a voice: pitch from the frequency band, volume from signal strength, echo from the round-trip light time (Voyager 1's is around two days). Needs a tiny CORS proxy.
- **Launch cut-in:** within 10 minutes of a launch, a banner offers to cut to the webcast from any station.
- **Aurora station:** NOAA's OVATION forecast plus all-sky cameras, with music driven by the aurora's power.
- **Moon / JWST / Juno stations**, a sleep timer, and an "orbital sunrise" alarm clock.
- **Shared listening rooms** (natural with server broadcast).

## 9. Risks and open questions

- **Live sources are flaky by nature.** The ISS camera is dark for about a third of each orbit and has loss-of-signal gaps. The prototype answers this with the map, the "in Earth's shadow, sunrise in N min" overlay and an honest "no signal" state, never fake data.
- **Rate limits:** NASA's DEMO_KEY allows about 30 requests an hour per IP, and Launch Library about 15 an hour. Fine for one person; real users need a small caching backend, or the server-broadcast design above.
- **Licensing:** NASA imagery is generally free to use, but **APOD images are often copyrighted by their photographers** (credits are shown; commercial use needs permission). Don't use NASA logos in a way that implies endorsement. SomaFM's terms need checking for commercial use. The station music is CC BY or public domain, and its credits are generated automatically.
- **Endpoint churn:** NOAA reformatted several JSON feeds in March 2026 (the prototype parses both formats). The Perseverance raw-image feed is a public website API rather than a formal one. YouTube live IDs change; the prototype embeds NASA's channel by default and lets you paste a specific stream.
- **Driver distraction:** car mode must stay audio-first; native car platforms enforce this anyway.

## 10. Decisions for you

1. ~~**Which form factor first?**~~ Decided: **phone and web**, with social listening and streaming.
2. ~~**Music direction:**~~ Decided: **existing free-licensed music** (option C), with the live composition as the alternative. No artist collaborations.
3. **A 24/7 channel?** Run OBS on an always-on machine now, or invest in a server-side renderer that streams unattended (and also unlocks clips and smart speakers; see §6)?
4. **Presence and chat:** worth adding a small realtime backend for "N listening now" and reactions?
5. **A name and a domain:** the QR codes and share links need a public home (GitHub Pages works today).
