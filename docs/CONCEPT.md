# Space Music: concept exploration

> **A radio for the solar system.** Tune between live views of space (the ISS, the whole Earth, the Sun, Mars, the deep sky, the next rocket launch) and hear music that is composed, live, from what you're looking at.

This doc explores the idea: what makes it different, how people would use it, how the music could work, how it gets into a car or onto a TV, and which decisions are still open. The prototype in this repo implements the core of it.

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
| 3 | **193** Å (SDO channel) | **Solar Live** | SDO's Sun in six wavelengths | Solar wind speed and density, Kp index (NOAA) | Wind speed sets tempo and brightness, density sets the noise, Kp sets the tension. A geomagnetic storm (Kp ≥ 5) switches to a whole-tone scale |
| 4 | **225** M km (to Mars) | **Jezero** | Perseverance's latest raw images | Mission sol, local time at Jezero, Earth–Mars distance and signal delay (computed) | Mars daytime is brighter. Afternoons are windier, matching the dust-devil peak |
| 5 | **13.8** Gyr (age of the universe) | **Deep Field** | Astronomy Picture of the Day, plus the archive | Today's date | The key and melody are seeded by the date, so there's a new piece every day |
| 6 | **T-0** | **Launch Pad** | Countdown to the next launch anywhere on Earth | Upcoming launches (Launch Library 2) | Energy builds over the last 48 hours, and the "telemetry blips" speed up toward liftoff |

**The radio around it:** presets 1–6, a dial you can drag with real static between stations, an LCD with car-radio-style scrolling text, and a **Space DJ**. The DJ uses the device's own text-to-speech to read live facts between the music, for example: *"The crew is moving at 27,600 kilometres an hour, over Kazakhstan, where it's 4:12 pm. Orbital sunset in about 11 minutes."* The music ducks while it talks, and every line is captioned.

## 3. Three ways to use it

| Mode | Where | The screen | The sound |
| --- | --- | --- | --- |
| **Window** | TV, desktop second screen, tablet on a stand | Full-bleed live view; the controls fade away | Ambient, always on |
| **Radio** | Phone, headphones | Glanceable | Primary: the DJ tells you what's happening |
| **Car** | Phone in a dash mount (later: CarPlay / Android Auto) | Six giant presets and an LCD. **Nothing moves** | Primary: steering-wheel next/previous changes station |

All three exist in the prototype (the **Window** and **Car** buttons; radio is the default).

## 4. Music strategy (the big decision)

| Option | Pros | Cons | Status |
| --- | --- | --- | --- |
| **A. Generative and sonified**: a synth engine driven by data | Unique (the core idea), free, no licensing, endless, works offline | Stays ambient; the sound has a quality ceiling until it's sample-based | **Built** (Web Audio, no samples) |
| **B. Curated internet radio** (SomaFM) | Real, well-curated music; *Mission Control* mixes in NASA comms | Third-party dependency; check SomaFM's terms before any commercial use; can't react to the data | **Built** as a second source, falling back to A if unreachable |
| **C. Licensed production-music catalogue** | Polished, many genres | Recurring cost; streaming and broadcast rights need checking | Not built |
| **D. User's own Spotify / Apple Music** | Familiar | Their developer terms restrict pairing recordings with visuals and other audio, which is exactly this app; verify current terms first | Not recommended |
| **E. Artist stems arranged by data** | Real musicians *and* live reactivity, like adaptive game music | Needs commissioning and a stem-mixing engine | The natural "v2" of A |
| **F. NASA sounds as interstitials**: Chandra sonifications, Perseverance's Mars microphone, mission audio | Authentic, mostly public domain (check each item) | Not music on its own | Easy add-on |

**Recommendation:** lead with **A** (it *is* the product and it's legally clean), keep **B** as the "just play me something" option, and grow toward **E**: invite artists to write stems for each station, and let the live data arrange them.

## 5. Getting into the car

**Today (built): an installable web app (PWA).**
- The **Media Session API** puts station and live info ("ISS Live · over Kazakhstan · daylight") on the car's display over Bluetooth, and maps **steering-wheel next/previous to station changes**.
- The **Screen Wake Lock API** keeps a dash-mounted phone awake.
- Car mode hides all moving imagery and shows only big targets.

**Next steps, in order of effort:**
1. **Android Auto:** needs a native Android app with a Media3 `MediaLibraryService`. The car draws its own templated UI (a browse list of six stations plus now-playing), and you never draw visuals while driving.
2. **Android Automotive OS** (cars with Google built in: Polestar, Volvo, GM and others): the same media-app model, distributed through Play. Video is allowed only while parked, on some makes.
3. **CarPlay:** needs Apple's CarPlay audio entitlement and a native iOS app (`CPListTemplate` / `CPNowPlayingTemplate`).

**The architectural fork this exposes:** today the music is generated *in your browser*. Native car apps, smart speakers ("Alexa, play Solar Live"), TuneIn and similar outlets all want an **audio stream**. Rendering each station on a server and broadcasting it (Icecast/HLS) would make Space Music a *real* radio station: everyone hears the same orbital sunrise at the same moment, the DJ can be rendered server-side with a better voice, and one server fetch serves all listeners, which also fixes API rate limits. The trade-off is hosting cost, and losing the personal, offline-capable version.

## 6. Getting onto the TV

- Window mode already works as a TV screensaver: cast a tab, or open it in a smart-TV browser.
- Samsung (Tizen) and LG (webOS) TV apps are web apps, so this codebase ports with little change. Apple TV, Android TV and Fire TV need native shells.
- The pitch here is "ambient TV": like Apple's Aerial screensavers, but live, and with sound.

## 7. More station and feature ideas

- **"Look up!" ISS pass alerts:** using your location plus orbital elements (CelesTrak TLEs and SGP4), the DJ breaks in with *"The ISS will be overhead in 3 minutes, look to the north-west."* Probably the single most delightful feature.
- **Deep Space Network station:** NASA's *DSN Now* shows which spacecraft are talking to Earth right now. Each active link becomes a voice: pitch from the frequency band, volume from signal strength, echo from the round-trip light time (Voyager 1's is around two days). Needs a tiny CORS proxy.
- **Launch cut-in:** within 10 minutes of a launch, a banner offers to cut to the webcast from any station.
- **Aurora station:** NOAA's OVATION forecast plus all-sky cameras, with music driven by the aurora's power.
- **Moon / JWST / Juno stations**, a sleep timer, and an "orbital sunrise" alarm clock.
- **Shared listening rooms** (natural with server broadcast).

## 8. Risks and open questions

- **Live sources are flaky by nature.** The ISS camera is dark for about a third of each orbit and has loss-of-signal gaps. The prototype answers this with the map, the "in Earth's shadow, sunrise in N min" overlay and an honest "no signal" state, never fake data.
- **Rate limits:** NASA's DEMO_KEY allows about 30 requests an hour per IP, and Launch Library about 15 an hour. Fine for one person; real users need a small caching backend, or the server-broadcast design above.
- **Licensing:** NASA imagery is generally free to use, but **APOD images are often copyrighted by their photographers** (credits are shown; commercial use needs permission). Don't use NASA logos in a way that implies endorsement. SomaFM's terms need checking for commercial use.
- **Endpoint churn:** NOAA reformatted several JSON feeds in March 2026 (the prototype parses both formats). The Perseverance raw-image feed is a public website API rather than a formal one. YouTube live IDs change; the prototype embeds NASA's channel by default and lets you paste a specific stream.
- **Driver distraction:** car mode must stay audio-first; native car platforms enforce this anyway.

## 9. Decisions for you

1. **Which form factor first?** TV/ambient, phone radio, or car? Each pulls the design in a different direction.
2. **Music direction:** generative-first (as built), curated radio, or artist collaborations (stems)?
3. **Personal app or broadcast station?** (client-generated vs server-streamed; see §5)
4. **Next platform:** polish the PWA, native Android (Android Auto), or iOS (CarPlay)?
