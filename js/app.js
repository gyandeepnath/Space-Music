// Space Music: wires stations, views, the music engine, SomaFM, the DJ and the
// radio faceplate together.

import { STATIONS } from './stations.js';
import { MusicEngine } from './engine.js';
import { StreamPlayer, SOMA_CHANNELS } from './radio.js';
import { SpaceDJ } from './dj.js';
import { Starfield, Slideshow, IssView, LaunchView } from './views.js';
import { WorldMap } from './map.js';
import { store } from './sources.js';

const $ = (s) => document.querySelector(s);
const N = STATIONS.length;
const body = document.body;

const settings = {
  nasaKey: store.get('nasaKey', ''),
  issVideo: store.get('issVideo', ''),
  voice: store.get('voice', ''),
  djEvery: Number(store.get('djEvery', 6)),
};
const sourceSettings = () => ({ nasaKey: settings.nasaKey.trim() || 'DEMO_KEY' });

const state = {
  index: Math.max(0, STATIONS.findIndex((s) => s.id === store.get('station', 'iss'))),
  powered: false,
  source: store.get('source', 'gen'),
  djOn: store.get('dj', true),
  volume: Number(store.get('volume', 0.8)),
  issMain: store.get('issMain', 'camera'),
  data: Object.fromEntries(STATIONS.map((s) => [s.id, {}])),
  status: {},
  errors: {},
  updatedAt: {},
  visualFailed: {},
  slide: null,
  bulletinCount: 0,
  streamNote: '',
};

const station = () => STATIONS[state.index];
const data = () => state.data[station().id];
const generative = () => state.powered && state.source === 'gen';

const engine = new MusicEngine();
const stream = new StreamPlayer($('#stream-out'));
const dj = new SpaceDJ({
  onCaption: (text) => {
    $('#subtitle').textContent = text;
    $('#subtitle').hidden = !text;
  },
  onDuck: (on) => {
    engine.duck(on);
    stream.duck(on);
  },
});
dj.enabled = state.djOn;
dj.voiceName = settings.voice;

new Starfield($('#stars'));
const slideshow = new Slideshow($('#view-slides'));
const issView = new IssView($('#view-iss'), new WorldMap($('#view-iss .iss-map')));
const launchView = new LaunchView($('#view-launch'));

// ---------------------------------------------------------------- faceplate

const dialPos = (i) => 7 + (i / (N - 1)) * 86;

function buildRadio() {
  const scale = $('#dial-scale');
  const presets = $('#presets');
  STATIONS.forEach((s, i) => {
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'dial-mark';
    mark.style.left = `${dialPos(i)}%`;
    mark.innerHTML = '<b></b><small></small>';
    mark.firstChild.textContent = s.freq;
    mark.lastChild.textContent = s.name;
    mark.addEventListener('click', () => tune(i));
    scale.append(mark);

    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'preset';
    p.title = `${s.name} · ${s.tagline} (${i + 1})`;
    p.innerHTML = '<span class="num"></span><span class="lbl"></span>';
    p.firstChild.textContent = i + 1;
    p.lastChild.textContent = s.name;
    p.addEventListener('click', () => tune(i));
    presets.append(p);
  });
  $('#vu').innerHTML = Array.from({ length: 10 }, (_, i) => `<i style="--i:${i}"></i>`).join('');
  vuBars = [...document.querySelectorAll('#vu i')];
  $('#dial').setAttribute('aria-valuemax', N);
}

// RDS-style text: the LCD's second line steps through short segments.
const rds = {
  el: $('#lcd-rds'),
  segments: [],
  i: 0,
  set(segments, reset = false) {
    this.segments = segments.filter(Boolean);
    if (reset || this.i >= this.segments.length) {
      this.i = 0;
      this.show();
    }
    if (!this.timer) {
      this.show();
      this.timer = setInterval(() => {
        this.i = (this.i + 1) % Math.max(1, this.segments.length);
        this.show();
      }, 2800);
    }
  },
  show() {
    const text = this.segments[this.i] || '';
    if (this.el.textContent === text) return;
    this.el.classList.add('swap');
    void this.el.offsetWidth; // restart the fade-in animation
    this.el.classList.remove('swap');
    this.el.textContent = text;
  },
};

function updateRadioUI() {
  const st = station();
  $('#lcd-freq').textContent = st.freq;
  $('#lcd-unit').textContent = st.unit;
  $('#lcd-name').textContent = st.name;
  $('#lcd-src').textContent = state.source === 'gen' ? 'GEN' : 'FM';
  $('#lcd').classList.toggle('off', !state.powered);
  $('#power').setAttribute('aria-pressed', state.powered);
  $('#needle').style.left = `${dialPos(state.index)}%`;
  $('#dial').setAttribute('aria-valuenow', state.index + 1);
  $('#dial').setAttribute('aria-valuetext', `${st.freq} ${st.unit} ${st.name}`);
  document.querySelectorAll('.preset').forEach((p, i) => p.setAttribute('aria-current', i === state.index));
  document.querySelectorAll('.dial-mark').forEach((m, i) => m.setAttribute('aria-current', i === state.index));
  document.querySelectorAll('[data-source]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.source === state.source));
  $('#dj-toggle').setAttribute('aria-pressed', state.djOn);
  $('#car-btn').setAttribute('aria-pressed', body.classList.contains('car'));
  $('#car-btn').textContent = body.classList.contains('car') ? 'Exit car' : 'Car';
  $('#window-btn').setAttribute('aria-pressed', body.classList.contains('window'));
  $('#volume').value = state.volume;
  $('.iss-swap span').textContent = state.issMain === 'camera' ? 'Map' : 'Camera';
}

// ---------------------------------------------------------------- tuning

function tune(i, { initial = false } = {}) {
  const target = ((i % N) + N) % N;
  if (target === state.index && !initial) {
    if (state.powered) announceSoon(); // press the preset again to hear what's on
    return;
  }
  const prev = station();
  state.index = target;
  const st = station();
  store.set('station', st.id);
  state.slide = null;
  state.visualFailed[st.id] = false;
  leaveView(prev);
  enterView(st);
  updateRadioUI();
  rds.set(segmentsFor(st), true);
  startPolling(st);
  if (state.powered) {
    if (state.source === 'gen') engine.setMood(st.mood, st.sonify(data(), Date.now()));
    else {
      engine.staticBurst();
      playStream(st);
    }
    dj.stop();
    announceSoon();
  }
  render();
}

function enterView(st) {
  for (const v of document.querySelectorAll('.view')) v.hidden = true;
  const id = { iss: '#view-iss', launch: '#view-launch' }[st.view] || '#view-slides';
  $(id).hidden = false;
  if (st.view === 'iss' && !body.classList.contains('car')) issView.enter(settings.issVideo, state.issMain);
  if (st.view === 'slides') showSlides(st);
}

function leaveView(st) {
  if (st.view === 'iss') issView.leave();
  if (st.view === 'slides') slideshow.stop();
}

function showSlides(st) {
  slideshow.show(st.slides(state.data[st.id]), {
    onSlide: (item) => {
      state.slide = item;
      state.visualFailed[st.id] = false;
      if (st.onSlide && generative()) engine.setData(st.onSlide(item));
      render();
    },
    onFail: () => {
      state.visualFailed[st.id] = true;
      render();
    },
  });
}

// ---------------------------------------------------------------- live data

let pollTimer = null;
let pollGen = 0;

function startPolling(st) {
  clearTimeout(pollTimer);
  const gen = ++pollGen;
  const run = async () => {
    await refresh(st);
    if (gen === pollGen) pollTimer = setTimeout(run, st.refreshMs);
  };
  run();
}

async function refresh(st) {
  if (state.status[st.id] !== 'ok') state.status[st.id] = 'loading';
  if (station() === st) render();
  try {
    state.data[st.id] = await st.refresh(state.data[st.id], sourceSettings());
    state.status[st.id] = 'ok';
    state.errors[st.id] = null;
    state.updatedAt[st.id] = Date.now();
  } catch (e) {
    state.status[st.id] = 'error';
    state.errors[st.id] = e.name === 'AbortError' ? 'timed out' : e.message || String(e);
    console.warn(`[${st.id}]`, e);
  }
  if (station() !== st) return;
  if (st.view === 'slides') showSlides(st);
  if (generative()) engine.setData(st.sonify(data(), Date.now()));
  render();
  if (announcePending) announceSoon();
}

// ---------------------------------------------------------------- rendering

function segmentsFor(st) {
  const d = state.data[st.id];
  const segs = st.ticker(d, Date.now(), state.slide).split(' · ');
  if (!state.powered) segs.unshift('PRESS ⏻ TO TUNE IN');
  return segs;
}

function ago(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function renderTelemetry() {
  const st = station();
  const d = data();
  const now = Date.now();
  $('#tele-title').textContent = `${st.freq} ${st.unit} · ${st.tagline}`;
  const rows = st.telemetry(d, now, state.slide);
  $('#tele-rows').replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      return [dt, dd];
    }),
  );
  const status = state.status[st.id];
  const el = $('#tele-status');
  if (status === 'ok') el.innerHTML = `<span class="live">● Live</span> · updated ${ago(state.updatedAt[st.id])}`;
  else if (status === 'error') {
    el.innerHTML = '<span class="err">○ No signal</span> · retrying · ';
    el.append(state.errors[st.id] || '');
  } else el.textContent = '◌ Tuning…';
  const music =
    state.source === 'fm'
      ? state.streamNote || `SomaFM · ${SOMA_CHANNELS[st.soma]}`
      : 'Music generated live from this station’s data';
  $('#tele-music').textContent = `♪ ${music}`;
}

function render() {
  const st = station();
  const d = data();
  rds.set(segmentsFor(st));
  renderTelemetry();
  if (st.view === 'iss') issView.update(d, st);
  if (st.view === 'launch') launchView.update(st, d, Date.now());

  const failed = state.visualFailed[st.id] || (state.status[st.id] === 'error' && !st.hasSignal(d));
  $('#nosignal').hidden = !failed;
  if (failed) {
    $('.ns-detail').textContent = state.visualFailed[st.id]
      ? `${st.name}’s images aren’t loading right now. Retrying automatically.`
      : `${st.name} isn’t reachable right now (${state.errors[st.id]}). Retrying automatically.`;
  }
  updateMediaSession();
}

// Once a second: countdowns, clocks, the ISS dead-reckoning readouts.
setInterval(() => {
  const st = station();
  renderTelemetry();
  if (st.view === 'launch') launchView.update(st, data(), Date.now());
}, 1000);

// Time-driven sonification (Mars local time, launch countdown) every 30 s.
setInterval(() => {
  if (generative()) engine.setData(station().sonify(data(), Date.now()));
}, 30e3);

// ---------------------------------------------------------------- audio

async function powerOn() {
  if (state.powered) return;
  state.powered = true;
  const st = station();
  engine.setVolume(state.volume);
  stream.setVolume(state.volume);
  if (state.source === 'gen') {
    engine.setMood(st.mood, st.sonify(data(), Date.now()));
    await engine.start($('#engine-out'));
    engine.setVolume(state.volume);
  } else {
    await engine.prepare($('#engine-out'));
    engine.setVolume(state.volume);
    engine.staticBurst();
    playStream(st);
  }
  setupMediaSession();
  restartBulletins();
  announceSoon();
  updateRadioUI();
  render();
}

function powerOff() {
  if (!state.powered) return;
  state.powered = false;
  engine.suspend();
  stream.stop();
  dj.stop();
  clearInterval(bulletinTimer);
  updateRadioUI();
  render();
}

const togglePower = () => (state.powered ? powerOff() : powerOn());

async function playStream(st) {
  state.streamNote = `Connecting to SomaFM ${SOMA_CHANNELS[st.soma]}…`;
  renderTelemetry();
  try {
    const name = await stream.play(st.soma);
    if (!name) return; // superseded by another tune
    state.streamNote = `SomaFM · ${name} · listener-supported radio`;
  } catch (e) {
    state.streamNote = '';
    console.warn(e);
    if (state.source === 'fm' && station() === st) {
      dj.caption(`${e.message}. Switching to generative music.`, 6);
      setSource('gen');
    }
  }
  renderTelemetry();
}

function setSource(src) {
  if (src === state.source) return;
  state.source = src;
  store.set('source', src);
  if (state.powered) {
    const st = station();
    if (src === 'gen') {
      stream.stop();
      engine.staticBurst();
      engine.setMood(st.mood, st.sonify(data(), Date.now()));
      engine.start();
    } else {
      engine.stop();
      engine.staticBurst();
      playStream(st);
    }
  }
  updateRadioUI();
  render();
}

function setVolume(v) {
  state.volume = v;
  store.set('volume', v);
  engine.setVolume(v);
  stream.setVolume(v);
}

// VU meter: real output level of the engine (SomaFM can't be measured
// cross-origin, so in FM mode it only shows the tuning static).
let vuBars = [];
function vuLoop() {
  const level = state.powered ? Math.min(1, engine.level() * 5) : 0;
  const lit = Math.round(level * vuBars.length);
  vuBars.forEach((b, i) => {
    b.classList.toggle('on', i < lit);
    b.classList.toggle('hot', i >= vuBars.length - 2);
  });
  requestAnimationFrame(vuLoop);
}

// ---------------------------------------------------------------- DJ

let announceTimer = null;
let announcePending = false;
let bulletinTimer = null;

// Speak the station intro once its data has had a moment to arrive.
function announceSoon() {
  if (!state.djOn || !state.powered) return;
  announcePending = true;
  clearTimeout(announceTimer);
  const ready = state.status[station().id] !== 'loading';
  announceTimer = setTimeout(announceNow, ready ? 1800 : 6000);
}

function announceNow() {
  announcePending = false;
  if (!state.powered || !state.djOn) return;
  const st = station();
  dj.say(st.intro(data(), Date.now()));
  restartBulletins();
}

function restartBulletins() {
  clearInterval(bulletinTimer);
  bulletinTimer = setInterval(bulletin, settings.djEvery * 60e3);
}

function bulletin() {
  if (!state.powered || !state.djOn) return;
  const st = station();
  const lines = st.bulletins(data(), Date.now()).filter(Boolean);
  if (!lines.length) return;
  const n = state.bulletinCount++;
  const line = lines[n % lines.length];
  dj.say(n % 3 === 2 ? `${line} You’re listening to ${st.name}, on Space Music.` : line);
}

function setDJ(on) {
  state.djOn = on;
  dj.enabled = on;
  store.set('dj', on);
  if (!on) dj.stop();
  else announceSoon();
  updateRadioUI();
}

// ---------------------------------------------------------------- OS media controls

let mediaKey = '';
let mediaAt = 0;

function setupMediaSession() {
  if (!('mediaSession' in navigator) || setupMediaSession.done) return;
  setupMediaSession.done = true;
  const ms = navigator.mediaSession;
  const handlers = {
    play: powerOn,
    pause: powerOff,
    stop: powerOff,
    // Steering-wheel and headset next/previous buttons change station.
    nexttrack: () => tune(state.index + 1),
    previoustrack: () => tune(state.index - 1),
  };
  for (const [action, fn] of Object.entries(handlers)) {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* unsupported action */
    }
  }
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
  const st = station();
  const title = `${st.freq} ${st.unit} · ${st.name}`.replace(/\s+·/, ' ·');
  const line = st
    .ticker(data(), Date.now(), state.slide)
    .split(' · ')
    .slice(0, 3)
    .join(' · ');
  navigator.mediaSession.playbackState = state.powered ? 'playing' : 'paused';
  const key = `${title}|${line}`;
  // Car displays redraw slowly; don't flood them.
  if (key === mediaKey || (Date.now() - mediaAt < 15e3 && key.startsWith(`${title}|`))) return;
  mediaKey = key;
  mediaAt = Date.now();
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: line,
    album: 'Space Music',
    artwork: [
      { src: new URL('icons/icon-192.png', location.href).href, sizes: '192x192', type: 'image/png' },
      { src: new URL('icons/icon-512.png', location.href).href, sizes: '512x512', type: 'image/png' },
    ],
  });
}

// ---------------------------------------------------------------- modes

let wakeLock = null;

async function keepAwake(on) {
  try {
    if (on && !wakeLock) {
      wakeLock = await navigator.wakeLock?.request('screen');
      wakeLock?.addEventListener('release', () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (body.classList.contains('car') || body.classList.contains('window'))) {
    keepAwake(true);
  }
});

function setCar(on) {
  const was = body.classList.contains('car');
  body.classList.toggle('car', on);
  if (on) body.classList.remove('window');
  // Car mode hides the view, so don't keep streaming the ISS video behind it.
  if (station().view === 'iss' && on !== was) {
    if (on) issView.leave();
    else issView.enter(settings.issVideo, state.issMain);
  }
  store.set('car', on);
  keepAwake(on);
  updateRadioUI();
}

let enteredFullscreen = false;

function setWindow(on) {
  body.classList.toggle('window', on);
  if (on) {
    body.classList.remove('car');
    wake();
    document.documentElement
      .requestFullscreen?.()
      .then(() => (enteredFullscreen = true))
      .catch(() => {});
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  keepAwake(on);
  updateRadioUI();
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && enteredFullscreen) {
    enteredFullscreen = false;
    body.classList.remove('window');
    updateRadioUI();
  }
});

// In window mode the chrome hides itself after a few idle seconds.
let idleTimer = null;
function wake() {
  body.classList.add('ui-awake');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => body.classList.remove('ui-awake'), 3500);
}
for (const ev of ['pointermove', 'pointerdown', 'keydown']) addEventListener(ev, wake, { passive: true });

// ---------------------------------------------------------------- settings

const dialog = $('#settings');

function fillVoices() {
  const select = dialog.querySelector('[name=voice]');
  const current = settings.voice;
  select.replaceChildren(new Option('Automatic', ''));
  for (const v of dj.voices()) select.append(new Option(`${v.name} (${v.lang})`, v.name));
  select.value = current;
  if (!dj.synth) select.disabled = true;
}

function openSettings() {
  dialog.returnValue = '';
  const f = dialog.querySelector('form');
  f.nasaKey.value = settings.nasaKey;
  f.issVideo.value = settings.issVideo;
  f.djEvery.value = String(settings.djEvery);
  fillVoices();
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  if (dialog.returnValue !== 'save') return;
  const f = dialog.querySelector('form');
  const keyChanged = f.nasaKey.value.trim() !== settings.nasaKey;
  const videoChanged = f.issVideo.value.trim() !== settings.issVideo;
  settings.nasaKey = f.nasaKey.value.trim();
  settings.issVideo = f.issVideo.value.trim();
  settings.voice = f.voice.value;
  settings.djEvery = Number(f.djEvery.value);
  for (const k of ['nasaKey', 'issVideo', 'voice', 'djEvery']) store.set(k, settings[k]);
  dj.voiceName = settings.voice;
  if (state.powered) restartBulletins();
  const st = station();
  if (videoChanged && st.view === 'iss') issView.enter(settings.issVideo, state.issMain);
  if (keyChanged) startPolling(st);
});

if (dj.synth) dj.synth.addEventListener?.('voiceschanged', () => dialog.open && fillVoices());

// ---------------------------------------------------------------- input

function bindControls() {
  $('#power').addEventListener('click', togglePower);
  $('#prev').addEventListener('click', () => tune(state.index - 1));
  $('#next').addEventListener('click', () => tune(state.index + 1));
  $('#dj-toggle').addEventListener('click', () => setDJ(!state.djOn));
  $('#car-btn').addEventListener('click', () => setCar(!body.classList.contains('car')));
  $('#window-btn').addEventListener('click', () => setWindow(!body.classList.contains('window')));
  $('#settings-btn').addEventListener('click', openSettings);
  $('#settings-cancel').addEventListener('click', () => dialog.close('cancel'));
  $('#volume').addEventListener('input', (e) => setVolume(Number(e.target.value)));
  for (const b of document.querySelectorAll('[data-source]')) b.addEventListener('click', () => setSource(b.dataset.source));
  $('.iss-swap').addEventListener('click', () => {
    state.issMain = state.issMain === 'camera' ? 'map' : 'camera';
    store.set('issMain', state.issMain);
    issView.setMain(state.issMain);
    updateRadioUI();
  });

  // Drag the dial: static between stations, snap to the nearest on release.
  const dial = $('#dial');
  const valueAt = (clientX) => {
    const r = dial.getBoundingClientRect();
    const pct = ((clientX - r.left) / r.width) * 100;
    return Math.min(N - 1, Math.max(0, ((pct - 7) / 86) * (N - 1)));
  };
  let dragging = false;
  dial.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.dial-mark')) return;
    dragging = true;
    dial.setPointerCapture(e.pointerId);
    dial.classList.add('dragging');
  });
  dial.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const v = valueAt(e.clientX);
    $('#needle').style.left = `${dialPos(v)}%`;
    if (state.powered) engine.setStatic(Math.min(1, Math.abs(v - Math.round(v)) * 2.4));
  });
  const release = (e) => {
    if (!dragging) return;
    dragging = false;
    dial.classList.remove('dragging');
    engine.setStatic(0);
    const target = Math.round(valueAt(e.clientX));
    if (target === state.index) updateRadioUI();
    else tune(target);
  };
  dial.addEventListener('pointerup', release);
  dial.addEventListener('pointercancel', release);
  let wheelAt = 0;
  dial.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (Date.now() - wheelAt < 450) return; // trackpads fire bursts of events
      wheelAt = Date.now();
      tune(state.index + (e.deltaY > 0 || e.deltaX > 0 ? 1 : -1));
    },
    { passive: false },
  );

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || dialog.open) return;
    if (e.target.closest('input, select, textarea')) return;
    const onButton = e.target.closest('button');
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= String(N)) tune(Number(k) - 1);
    else if (k === 'arrowright' || k === 'arrowup') tune(state.index + 1);
    else if (k === 'arrowleft' || k === 'arrowdown') tune(state.index - 1);
    else if (k === ' ' && !onButton) {
      e.preventDefault();
      togglePower();
    } else if (k === 'm') setSource(state.source === 'gen' ? 'fm' : 'gen');
    else if (k === 'd') setDJ(!state.djOn);
    else if (k === 'c') setCar(!body.classList.contains('car'));
    else if (k === 'w') setWindow(!body.classList.contains('window'));
    else if (k === 'escape' && body.classList.contains('car')) setCar(false);
  });
}

// Keep layout offsets in sync with the real height of the radio.
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--radio-h', `${Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight)}px`);
}).observe($('#radio'));

// ---------------------------------------------------------------- boot

buildRadio();
bindControls();
if (store.get('car', false)) setCar(true);
tune(state.index, { initial: true });
updateRadioUI();
requestAnimationFrame(vuLoop);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for debugging and the smoke test.
window.spaceMusic = { state, engine, stream, dj, tune, powerOn, powerOff, setSource, STATIONS };
