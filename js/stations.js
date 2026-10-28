// The station lineup. Each station pairs a live view with a musical mood and a
// mapping from live data to the engine's modulators ("sonification"), plus
// what the Space DJ says about it.
//
// Music is composed on a shared wall-clock grid (see engine.js), so everyone
// tuned to a station hears the same thing at the same moment.
//
// Dial "frequencies" are real numbers tied to each subject:
//   408   ISS altitude in km        1.5  Earth–L1 distance, million km
//   193   SDO wavelength in Å       225  mean Earth–Mars distance, million km
//   13.8  age of the universe, Gyr  T-0  launch countdown

import {
  nextOrbitalTerminator,
  perseveranceClock,
  earthMarsDistance,
  roughOceanName,
  JEZERO,
} from './astro.js';
import { hashString } from './engine.js';
import {
  issNow,
  placeBelow,
  epicLatest,
  sdoImages,
  spaceWeather,
  marsImages,
  apod,
  upcomingLaunches,
} from './sources.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const int = (v) => Math.round(v).toLocaleString('en-US');
const fmtLat = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? 'E' : 'W'}`;

function regionName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase());
  } catch {
    return code;
  }
}

function localTime(timeZone) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date());
  } catch {
    return null;
  }
}

export function spokenDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return 'less than a minute';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const hours = h < 48 ? `${h} hour${h === 1 ? '' : 's'}` : `${Math.round(h / 24)} days`;
  return rest && h < 48 ? `${hours} and ${rest} minute${rest === 1 ? '' : 's'}` : hours;
}

// msUntil > 0 before liftoff (T−), negative after (T+).
export function countdown(msUntil) {
  const sign = msUntil >= 0 ? '−' : '+';
  let s = Math.floor(Math.abs(msUntil) / 1000);
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const pad = (n) => String(n).padStart(2, '0');
  const hms = `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return `T${sign} ${d ? `${d}d ` : ''}${hms}`;
}

function firstSentences(text = '', max = 260) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > max) break;
    out += s;
  }
  return (out || sentences[0]).trim();
}

// --- ISS ---------------------------------------------------------------------

function issPlace(d) {
  if (!d.place || !d.fix) return null;
  const cc = d.place.countryCode;
  if (cc && cc !== '??') return regionName(cc);
  return roughOceanName(d.fix.lat, d.fix.lon) ?? 'open water';
}

function issLit(d) {
  if (!d.fix) return true;
  return d.fix.visibility ? d.fix.visibility === 'daylight' : !d.terminator?.inShadow;
}

const iss = {
  id: 'iss',
  freq: '408',
  unit: 'km',
  name: 'ISS Live',
  tagline: 'International Space Station · live from low Earth orbit',
  about:
    'A live camera on the International Space Station, about 400 km up, and a map of where it is right now. The station circles Earth every 93 minutes, so for a third of each orbit the camera looks into night.',
  sound:
    'Orbital sunrise switches the music to a bright key; Earth’s shadow brings a darker one, about sixteen times a day. Higher latitudes add wind.',
  view: 'iss',
  soma: 'missioncontrol',
  refreshMs: 5000,
  mood: {
    root: 'D',
    scale: 'lydian',
    bpm: 66,
    progression: [0, 4, 5, 3],
    padWave: 'sawtooth',
    pluckWave: 'sine',
    density: 0.38,
    wind: 0.25,
    reverb: 0.6,
  },

  async refresh(prev) {
    const fix = await issNow();
    const last = prev.fix;
    if (last && fix.time > last.time && Math.abs(fix.lat - last.lat) > 1e-4) {
      fix.ascending = fix.lat > last.lat;
      fix.directionKnown = true;
    } else {
      fix.ascending = last?.ascending ?? true;
      fix.directionKnown = !!last?.directionKnown;
    }
    const data = { ...prev, fix };
    if (!prev.placeAt || Date.now() - prev.placeAt > 30e3) {
      try {
        data.place = await placeBelow(fix.lat, fix.lon);
        data.placeAt = Date.now();
      } catch {
        /* keep the last known place */
      }
    }
    data.terminator = fix.directionKnown ? nextOrbitalTerminator(fix, Date.now()) : null;
    return data;
  },

  hasSignal: (d) => !!d.fix,
  isLit: issLit,

  // Orbital sunrise flips the key from dark dorian to bright lydian.
  sonify(d) {
    if (!d.fix) return {};
    const lit = issLit(d);
    return {
      scale: lit ? 'lydian' : 'dorian',
      brightness: lit ? 0.72 : 0.28,
      energy: 0.5,
      wind: (Math.abs(d.fix.lat) / 52) * 0.7,
      pulse: 0.35,
      tension: lit ? 0.05 : 0.2,
    };
  },

  telemetry(d) {
    if (!d.fix) return [];
    const f = d.fix;
    const rows = [
      ['Position', `${fmtLat(f.lat)} ${fmtLon(f.lon)}`],
      ['Altitude', `${f.alt.toFixed(0)} km`],
      ['Speed', `${int(f.velocity)} km/h`],
      ['Over', issPlace(d) ?? '…'],
      ['Light', issLit(d) ? '☀ orbital day' : '☾ Earth’s shadow'],
    ];
    if (d.terminator?.minutes) rows.push([`Orbital ${d.terminator.event}`, `in ${Math.round(d.terminator.minutes)} min`]);
    return rows;
  },

  ticker(d) {
    if (!d.fix) return 'Acquiring ISS telemetry';
    const f = d.fix;
    const place = issPlace(d);
    return [
      place && `Over ${place}`,
      issLit(d) ? 'Orbital daylight' : 'In Earth’s shadow',
      `${int(f.velocity)} km/h`,
      `${f.alt.toFixed(0)} km up`,
      `${fmtLat(f.lat)} ${fmtLon(f.lon)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  },

  intro(d) {
    if (!d.fix) {
      return 'You’re tuned to ISS 408, live from the International Space Station. Telemetry is out of range right now, so we’ll keep listening.';
    }
    return `You’re tuned to ISS 408, live from the International Space Station, ${d.fix.alt.toFixed(0)} kilometres up. ${this.where(d)} ${this.light(d)}`;
  },

  where(d) {
    const place = issPlace(d);
    const speed = `The crew is moving at ${int(d.fix.velocity)} kilometres an hour`;
    if (!place) return `${speed}.`;
    const tz = d.place?.countryCode !== '??' && d.place?.timezone ? localTime(d.place.timezone) : null;
    return `${speed}, over ${place}${tz ? `, where it’s ${tz}` : ''}.`;
  },

  light(d) {
    const lit = issLit(d);
    const t = d.terminator;
    const now = lit ? 'The station is in orbital daylight' : 'The station is in Earth’s shadow, so the cameras see mostly darkness';
    return t?.minutes ? `${now}. Orbital ${t.event} in about ${spokenDuration(t.minutes)}.` : `${now}.`;
  },

  bulletins(d) {
    if (!d.fix) return [];
    return [
      `ISS update. ${this.where(d)}`,
      this.light(d),
      'The station circles the Earth about every 93 minutes, so the crew sees around sixteen sunrises and sixteen sunsets every day.',
      `At ${int(d.fix.velocity)} kilometres an hour, the ISS could cross from London to New York in about twelve minutes.`,
    ];
  },
};

// --- Earth from L1 -----------------------------------------------------------

const earth = {
  id: 'earth',
  freq: '1.5',
  unit: 'M km',
  name: 'Blue Marble',
  tagline: 'The whole sunlit Earth, from NASA’s EPIC camera at L1',
  about:
    'The whole sunlit face of Earth, photographed by NASA’s EPIC camera on the DSCOVR spacecraft, 1.5 million km away. Every frame is a real photo from the latest day.',
  sound: 'The chords follow the longitude at the centre of the picture, so the harmony turns with the planet.',
  view: 'slides',
  soma: 'spacestation',
  refreshMs: 30 * 60e3,
  mood: {
    root: 'G',
    scale: 'mixolydian',
    bpm: 58,
    chordBeats: 12,
    progression: [0, 3, 4, 0],
    padWave: 'triangle',
    pluckWave: 'sine',
    density: 0.3,
    wind: 0.25,
    reverb: 0.7,
  },

  async refresh(prev, settings) {
    return { ...prev, items: await epicLatest(settings.nasaKey) };
  },

  hasSignal: (d) => !!d.items?.length,
  slides: (d) => ({ items: d.items || [], fit: 'contain', interval: 9000 }),

  // The chord follows the longitude at the centre of the frame on screen, so
  // the harmony turns with the planet.
  onSlide(item) {
    if (!Number.isFinite(item?.lon)) return {};
    return { degree: Math.floor(((item.lon + 180) / 360) * 7) % 7 };
  },

  sonify: () => ({ brightness: 0.55, energy: 0.35, wind: 0.25, pulse: 0.05, tension: 0 }),

  telemetry(d, now, slide) {
    if (!d.items?.length) return [];
    const rows = [['Images', `${d.items.length} from the latest day`]];
    if (slide?.time) rows.push(['Taken', `${slide.time.replace('T', ' ').slice(0, 16)} UTC`]);
    if (Number.isFinite(slide?.lat)) rows.push(['Centred on', `${fmtLat(slide.lat)} ${fmtLon(slide.lon)}`]);
    rows.push(['From', 'DSCOVR at Sun–Earth L1']);
    return rows;
  },

  ticker(d, now, slide) {
    if (!d.items?.length) return 'Waiting for DSCOVR';
    const parts = ['The whole Earth, from L1', `${d.items.length} photos from the latest day`];
    if (Number.isFinite(slide?.lat)) parts.push(`Centred on ${fmtLat(slide.lat)} ${fmtLon(slide.lon)}`);
    return parts.join(' · ');
  },

  intro(d) {
    const when = d.items?.[0]?.time ? ` These are its latest images, from ${new Date(d.items[0].time).toUTCString().slice(5, 16)}.` : '';
    return `This is Blue Marble, one point five on your dial. You’re looking at the whole sunlit face of the Earth, seen by NASA’s EPIC camera on the DSCOVR spacecraft, a million and a half kilometres away.${when} The chords follow the planet as it turns.`;
  },

  bulletins: () => [
    'DSCOVR sits at the Lagrange point between the Earth and the Sun, where it can watch the sunlit side of our planet all day, every day.',
    'Every frame on Blue Marble is a real photograph. EPIC builds each natural-colour image from red, green and blue exposures taken a few minutes apart.',
  ],
};

// --- The Sun -----------------------------------------------------------------

function stormLevel(kp) {
  if (!Number.isFinite(kp)) return null;
  if (kp >= 5) return `G${Math.min(5, Math.floor(kp) - 4)} geomagnetic storm`;
  if (kp >= 4) return 'active';
  return 'quiet';
}

const sun = {
  id: 'sun',
  freq: '193',
  unit: 'Å',
  name: 'Solar Live',
  tagline: 'The Sun right now, from NASA SDO · space weather from NOAA',
  about:
    'The Sun as NASA’s Solar Dynamics Observatory saw it minutes ago, cycling through six wavelengths of light that each show plasma at a different temperature.',
  sound:
    'A faster solar wind makes the music busier and brighter, denser wind adds noise, and geomagnetic activity adds tension. A storm switches to a whole-tone scale.',
  view: 'slides',
  soma: 'deepspaceone',
  refreshMs: 5 * 60e3,
  mood: {
    root: 'E',
    scale: 'mixolydian',
    bpm: 72,
    chordBeats: 16,
    progression: [0, 6, 3, 4],
    padWave: 'sawtooth',
    pluckWave: 'triangle',
    density: 0.42,
    wind: 0.7,
    reverb: 0.55,
  },

  async refresh(prev) {
    return { ...prev, weather: await spaceWeather() };
  },

  hasSignal: () => true, // SDO images are plain <img> loads; the slideshow handles failures
  slides: () => ({ items: sdoImages(), fit: 'contain', interval: 10000 }),

  // Solar wind speed drives how busy and bright it is, proton density the wind
  // noise, Kp the tension; a geomagnetic storm (Kp ≥ 5) switches to whole-tone.
  sonify(d) {
    const w = d.weather?.wind;
    const kp = d.weather?.kp?.value;
    const energy = w ? clamp01((w.speed - 280) / 520) : 0.4;
    return {
      energy,
      brightness: 0.55 + 0.3 * energy,
      wind: w && Number.isFinite(w.density) ? clamp01(w.density / 15) : 0.4,
      tension: Number.isFinite(kp) ? clamp01((kp - 2) / 6) : 0.1,
      pulse: 0.2 + 0.4 * energy,
      scale: kp >= 5 ? 'wholeTone' : null,
    };
  },

  telemetry(d, now, slide) {
    const rows = [];
    const w = d.weather?.wind;
    const kp = d.weather?.kp?.value;
    if (slide?.channel) rows.push(['Channel', `${slide.channel.label} · ${slide.channel.detail}`]);
    if (w) rows.push(['Solar wind', `${int(w.speed)} km/s`]);
    if (w && Number.isFinite(w.density)) rows.push(['Density', `${w.density.toFixed(1)} protons/cm³`]);
    if (Number.isFinite(kp)) rows.push(['Kp index', `${kp.toFixed(1)} · ${stormLevel(kp)}`]);
    rows.push(['Light delay', '≈ 8 min 20 s']);
    return rows;
  },

  ticker(d, now, slide) {
    const parts = [];
    const w = d.weather?.wind;
    if (w) parts.push(`Solar wind ${int(w.speed)} km/s`);
    const kp = d.weather?.kp?.value;
    if (Number.isFinite(kp)) parts.push(`Kp ${kp.toFixed(1)} (${stormLevel(kp)})`);
    if (slide?.channel) parts.push(`${slide.channel.label}: ${slide.channel.detail}`);
    return parts.join(' · ') || 'The Sun, live';
  },

  weatherReport(d) {
    const w = d.weather?.wind;
    const kp = d.weather?.kp?.value;
    const parts = [];
    if (w) {
      const dens = Number.isFinite(w.density) ? `, carrying about ${w.density.toFixed(0)} protons per cubic centimetre` : '';
      parts.push(`The solar wind is blowing past Earth at ${int(w.speed)} kilometres per second${dens}.`);
    }
    if (Number.isFinite(kp)) {
      const level = stormLevel(kp);
      parts.push(
        kp >= 5
          ? `The planetary K index is ${kp.toFixed(1)}: that’s a ${level}. Aurora may reach lower latitudes than usual tonight.`
          : `The planetary K index is ${kp.toFixed(1)}, which is ${level}.`,
      );
    }
    return parts.join(' ');
  },

  intro(d) {
    const report = this.weatherReport(d);
    return `Solar Live, one nine three on your dial. This is the Sun from NASA’s Solar Dynamics Observatory, cycling through its ultraviolet channels. ${report || 'Space weather data is out of range right now.'}`;
  },

  bulletins(d) {
    const report = this.weatherReport(d);
    return [
      report && `Space weather update. ${report}`,
      'Sunlight takes about eight minutes and twenty seconds to reach us, so everything on screen is the Sun as it was a few minutes ago.',
      'Each colour on Solar Live is a different wavelength of extreme ultraviolet light, and each one shows plasma at a different temperature.',
    ].filter(Boolean);
  },
};

// --- Mars --------------------------------------------------------------------

function marsFacts(now) {
  const clock = perseveranceClock(now);
  const dist = earthMarsDistance(now);
  return { clock, dist, daylight: clock.hours >= 6 && clock.hours < 18, afternoon: clock.hours >= 11 && clock.hours < 17 };
}

const mars = {
  id: 'mars',
  freq: '225',
  unit: 'M km',
  name: 'Jezero',
  tagline: 'Perseverance rover · latest raw images from Mars',
  about:
    'The latest raw images from NASA’s Perseverance rover in Jezero Crater, straight from its cameras. The clock is the local time on Mars where the rover is.',
  sound:
    'The music follows the time of day at Jezero: brighter in daylight, and windier in the afternoon, when dust devils are most common.',
  view: 'slides',
  soma: 'dronezone',
  refreshMs: 60 * 60e3,
  mood: {
    root: 'C',
    scale: 'aeolian',
    bpm: 52,
    chordBeats: 16,
    progression: [0, 5, 3, 4],
    padWave: 'triangle',
    pluckWave: 'triangle',
    density: 0.26,
    wind: 0.85,
    reverb: 0.75,
  },

  async refresh(prev, settings) {
    return { ...prev, items: await marsImages(settings.nasaKey) };
  },

  hasSignal: (d) => !!d.items?.length,
  slides: (d) => ({ items: d.items || [], fit: 'cover', interval: 11000 }),

  // Follows the local time at Jezero: brighter by day, and windier in the
  // afternoon when convective dust devils are most common.
  sonify(d, now) {
    const m = marsFacts(now);
    return {
      scale: m.daylight ? 'dorian' : 'aeolian',
      brightness: m.daylight ? 0.5 : 0.18,
      wind: m.afternoon ? 0.9 : m.daylight ? 0.5 : 0.25,
      energy: 0.3,
      pulse: 0.15,
      tension: 0.15,
    };
  },

  telemetry(d, now, slide) {
    const m = marsFacts(now);
    const light = m.dist.lightSeconds;
    const rows = [
      ['Mission sol', `${m.clock.sol}`],
      ['Jezero time', `${m.clock.label} LMST ${m.daylight ? '☀' : '☾'}`],
      ['Distance', `${(m.dist.km / 1e6).toFixed(1)} M km`],
      ['Signal delay', `${Math.floor(light / 60)} min ${Math.round(light % 60)} s`],
    ];
    if (slide?.camera) rows.push(['Camera', slide.camera]);
    if (slide?.sol != null) rows.push(['Image sol', `${slide.sol}`]);
    return rows;
  },

  ticker(d, now) {
    const m = marsFacts(now);
    return [
      `Sol ${m.clock.sol}`,
      `${m.clock.label} at Jezero, ${m.daylight ? 'daytime' : 'night'}`,
      `${(m.dist.km / 1e6).toFixed(0)} million km away`,
      `Signals take ${Math.round(m.dist.lightSeconds / 60)} min`,
    ].join(' · ');
  },

  clockLine(now) {
    const m = marsFacts(now);
    const light = m.dist.lightSeconds;
    return `On Mars it’s sol ${m.clock.sol} of Perseverance’s mission, and ${m.clock.label} local time at ${JEZERO.name}, ${m.daylight ? 'daytime' : 'night'} on the crater floor. Mars is ${(m.dist.km / 1e6).toFixed(0)} million kilometres away today, so a signal from the rover takes ${Math.floor(light / 60)} minutes and ${Math.round(light % 60)} seconds to reach us.`;
  },

  intro(d, now) {
    const pics = d.items?.length
      ? d.items[0].archive
        ? ' The raw image feed is out of range, so these are from NASA’s archive.'
        : ' On screen are the rover’s latest raw images, straight from the cameras, unprocessed.'
      : '';
    return `You’re tuned to Jezero, two two five on the dial. ${this.clockLine(now)}${pics}`;
  },

  bulletins(d, now) {
    return [
      `Mars time check. ${this.clockLine(now)}`,
      'A day on Mars, called a sol, lasts 24 hours and 39 minutes. Mission teams on Earth sometimes live on Mars time to keep up with their rovers.',
      'The music on Jezero follows the local time at the crater: it brightens at sunrise, and the wind picks up in the afternoon, when dust devils are most common.',
    ];
  },
};

// --- Deep field ----------------------------------------------------------------

const ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const deep = {
  id: 'deep',
  freq: '13.8',
  unit: 'Gyr',
  name: 'Deep Field',
  tagline: 'Astronomy Picture of the Day, and the wider cosmos',
  about: 'NASA’s Astronomy Picture of the Day and the days before it: galaxies, nebulae, eclipses, and the occasional rocket.',
  sound: 'The key and the melody are seeded by today’s date, so there’s a new piece every day.',
  view: 'slides',
  soma: 'deepspaceone',
  refreshMs: 6 * 3600e3,

  // Today's sky has its own song: the key and the dice are seeded by the date.
  get mood() {
    const seed = hashString(`deep:${new Date().toISOString().slice(0, 10)}`);
    return {
      root: ROOTS[seed % ROOTS.length],
      scale: seed % 2 ? 'lydian' : 'ionian',
      bpm: 50,
      chordBeats: 24,
      progression: [0, 5, 3, 4, 2, 5],
      padWave: 'sawtooth',
      pluckWave: 'sine',
      density: 0.22,
      wind: 0.15,
      reverb: 1,
      seed,
    };
  },

  async refresh(prev, settings) {
    return { ...prev, ...(await apod(settings.nasaKey)) };
  },

  hasSignal: (d) => !!d.items?.length,
  slides: (d) => ({ items: d.items || [], fit: 'contain', interval: 14000 }),
  sonify: () => ({ brightness: 0.45, energy: 0.25, wind: 0.2, pulse: 0.08, tension: 0.1 }),

  telemetry(d, now, slide) {
    const rows = [];
    if (d.today) rows.push(["Today's APOD", d.today.title]);
    if (slide?.title && slide.date !== d.today?.date) rows.push(['On screen', `${slide.title} (${slide.date})`]);
    else if (slide?.caption && !slide.title) rows.push(['On screen', slide.caption]);
    return rows;
  },

  ticker(d, now, slide) {
    if (!d.items?.length) return 'Scanning the deep sky';
    if (slide?.title) return [slide.title, slide.date === d.today?.date ? 'Today’s picture' : `APOD ${slide.date}`].join(' · ');
    return slide?.caption || 'Deep Field';
  },

  intro(d) {
    const name = 'Deep Field, thirteen point eight on your dial, named for the 13.8 billion years since the Big Bang.';
    if (d.today) return `${name} Today’s Astronomy Picture of the Day is “${d.today.title}”. ${firstSentences(d.today.explanation)}`;
    return `${name} Today’s music is seeded by today’s date, so it will never play quite the same way again.`;
  },

  bulletins(d) {
    const items = (d.items || []).filter((i) => i.title && i.date !== d.today?.date).slice(0, 3);
    return [
      ...items.map((i) => `From the archive, ${i.date}: “${i.title}”. ${firstSentences(i.explanation, 200)}`),
      'The music on Deep Field is seeded by today’s date. Tomorrow, the key and the melody will be different.',
    ];
  },
};

// --- Launches ------------------------------------------------------------------

function nextLaunch(d, now) {
  return (d.launches || []).find((l) => l.net > now - 30 * 60e3) || null;
}

const launch = {
  id: 'launch',
  freq: 'T-0',
  unit: '',
  name: 'Launch Pad',
  tagline: 'The next rocket launch on Earth, counting down',
  about: 'A live countdown to the next rocket launch anywhere on Earth, with what’s coming after it.',
  sound: 'The music gets busier over the last 48 hours of the countdown, and the telemetry blips speed up towards liftoff.',
  view: 'launch',
  soma: 'missioncontrol',
  refreshMs: 30 * 60e3,
  mood: {
    root: 'A',
    scale: 'mixolydian',
    bpm: 76,
    chordBeats: 8,
    progression: [0, 3, 6, 4],
    padWave: 'sawtooth',
    pluckWave: 'triangle',
    density: 0.4,
    wind: 0.3,
    reverb: 0.5,
  },

  async refresh(prev) {
    return { ...prev, launches: await upcomingLaunches() };
  },

  hasSignal: (d) => !!d.launches?.length,
  next: nextLaunch,

  // Energy climbs over the last 48 hours of the countdown.
  sonify(d, now) {
    const next = nextLaunch(d, now);
    if (!next) return { energy: 0.3, pulse: 0.2 };
    const hours = (next.net - now) / 3600e3;
    const energy = clamp01(1 - hours / 48);
    return { energy, pulse: 0.2 + 0.7 * energy, brightness: 0.4 + 0.4 * energy, tension: hours < 0.25 && hours > 0 ? 0.5 : 0.1 };
  },

  telemetry(d, now) {
    const n = nextLaunch(d, now);
    if (!n) return [];
    return [
      ['Mission', n.mission],
      ['Vehicle', n.rocket],
      ['Provider', n.provider],
      ['From', n.location],
      ['Status', n.statusName || n.status],
      ['NET', new Date(n.net).toUTCString().replace('GMT', 'UTC')],
    ].filter(([, v]) => v);
  },

  ticker(d, now) {
    const n = nextLaunch(d, now);
    if (!n) return 'No launch data';
    return [countdown(n.net - now), n.mission, n.rocket, n.location].filter(Boolean).join(' · ');
  },

  launchLine(d, now) {
    const n = nextLaunch(d, now);
    if (!n) return 'Launch data is out of range right now.';
    const mins = (n.net - now) / 60e3;
    const when = mins > 0 ? `Liftoff is scheduled in ${spokenDuration(mins)}` : 'The launch window is open now';
    const status =
      n.status === 'Go' ? 'Status: go for launch.' : ['TBD', 'TBC'].includes(n.status) ? 'The date is still to be confirmed.' : '';
    const from = n.location ? `, from ${n.location}` : '';
    return `Next up: ${n.mission}, on ${n.rocket}${from}. ${when}. ${status}`.trim();
  },

  intro(d, now) {
    return `Launch Pad, T zero on your dial. ${this.launchLine(d, now)}`;
  },

  bulletins(d, now) {
    const later = (d.launches || []).filter((l) => l.net > now).slice(1, 3);
    return [
      `Countdown check. ${this.launchLine(d, now)}`,
      ...later.map((l) => `Also coming up: ${l.mission} on ${l.rocket}, in ${spokenDuration((l.net - now) / 60e3)}.`),
    ];
  },
};

export const STATIONS = [iss, earth, sun, mars, deep, launch];
