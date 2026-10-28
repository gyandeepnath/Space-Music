// Space Music: wires stations, views, the music engine, SomaFM, the DJ and the
// interface together. One page, four layouts: phone/web (default), TV, car,
// and an on-air broadcast layout for YouTube, Twitch, TikTok and Instagram.

import { STATIONS } from './stations.js';
import { MusicEngine } from './engine.js';
import { StreamPlayer, SOMA_CHANNELS } from './radio.js';
import { SpaceDJ } from './dj.js';
import { Starfield, Slideshow, IssView, LaunchView, Scope } from './views.js';
import { WorldMap } from './map.js';
import { store } from './sources.js';
import { qrSvg } from './qr.js';
import { TrackPlayer, creditLine } from './tracks.js';

const $ = (s) => document.querySelector(s);
const N = STATIONS.length;
const body = document.body;
const params = new URLSearchParams(location.search);
const BROADCAST = params.has('broadcast');

const settings = {
  nasaKey: store.get('nasaKey', ''),
  issVideo: store.get('issVideo', ''),
  voice: store.get('voice', ''),
  djEvery: Number(store.get('djEvery', 6)),
};
const sourceSettings = () => ({ nasaKey: settings.nasaKey.trim() || 'DEMO_KEY' });

const indexOf = (id) => STATIONS.findIndex((s) => s.id === id);
const hashIndex = () => indexOf(location.hash.slice(1));

const state = {
  index: Math.max(0, hashIndex() >= 0 ? hashIndex() : indexOf(store.get('station', 'iss'))),
  powered: false,
  // 'tracks' (station music), 'gen' (live composition) or 'fm' (SomaFM). Broadcasts
  // never use SomaFM: rebroadcasting it needs their permission.
  source: BROADCAST ? 'tracks' : store.get('source', 'tracks'),
  nowPlaying: null,
  djOn: BROADCAST ? params.get('dj') !== '0' : store.get('dj', true),
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
  log: [],
};

const station = () => STATIONS[state.index];
const data = () => state.data[station().id];
// Station music falls back to the live composition until its catalog has loaded.
const source = () => (state.source === 'tracks' && !tracks.ready ? 'gen' : state.source);
const engineOn = () => state.powered && source() !== 'fm';
const generative = () => state.powered && source() === 'gen';

const engine = new MusicEngine();
const tracks = new TrackPlayer(engine, {
  onTrack: (t) => {
    state.nowPlaying = t;
    render();
  },
});
const stream = new StreamPlayer($('#stream-out'));
const dj = new SpaceDJ({
  onCaption: (text) => {
    $('#caption .caption-text').textContent = text;
    $('#caption').hidden = !text;
    body.classList.toggle('dj-talking', !!text);
  },
  onDuck: (on) => {
    engine.duck(on);
    stream.duck(on);
  },
});
dj.enabled = state.djOn;
dj.voiceName = settings.voice;

const starfield = new Starfield($('#stars'));
const slideshow = new Slideshow($('#view-slides'));
const issView = new IssView($('#view-iss'), new WorldMap($('#view-iss .iss-map')));
const launchView = new LaunchView($('#view-launch'));
const wave = (buf) => (engineOn() ? engine.waveform(buf) : null);
const scopes = [new Scope($('#scope'), wave), new Scope($('#oa-scope'), wave)];

// ---------------------------------------------------------------- small helpers

function haptic(ms = 8) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}

let toastTimer = null;
function toast(text, ms = 2600) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function joinUrl(st = station()) {
  const base = params.get('join') || `${location.origin}${location.pathname}`;
  return `${base.replace(/#.*$/, '')}#${st.id}`;
}

const prettyUrl = (url) => url.replace(/^https?:\/\//, '').replace(/\/index\.html/, '/');

// ---------------------------------------------------------------- tuner and presets

let markW = 86;

function buildTuner() {
  const track = $('#tuner-track');
  const presets = $('#presets');
  STATIONS.forEach((s, i) => {
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = 'tuner-mark';
    mark.dataset.index = i;
    mark.innerHTML = '<b></b><small></small>';
    mark.firstChild.textContent = s.freq;
    mark.lastChild.textContent = s.name;
    mark.setAttribute('aria-label', `${s.name}, ${s.freq} ${s.unit}`);
    mark.addEventListener('click', () => tune(i, { via: 'button' }));
    track.append(mark);

    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'preset';
    p.dataset.station = s.id;
    p.innerHTML = '<span class="orb" aria-hidden="true"></span><span><b></b><small></small></span>';
    p.querySelector('b').textContent = s.name;
    p.querySelector('small').textContent = `${i + 1} · ${s.freq} ${s.unit}`.trim();
    p.addEventListener('click', () => tune(i, { via: 'button' }));
    presets.append(p);
  });
  $('#tuner').setAttribute('aria-valuemax', N);
}

const tuner = $('#tuner');
let ignoreScrollUntil = 0;
let settleTimer = null;
let touching = false;
let lastDetent = null;

function measureMark() {
  markW = tuner.querySelector('.tuner-mark')?.offsetWidth || markW;
}

function scrollTunerTo(i, smooth) {
  measureMark();
  ignoreScrollUntil = Date.now() + (smooth ? 900 : 120);
  lastDetent = i;
  tuner.scrollTo({ left: i * markW, behavior: smooth ? 'smooth' : 'instant' });
}

function settleTuner() {
  if (touching || tuner.classList.contains('dragging')) return;
  engine.setStatic(0);
  const i = Math.max(0, Math.min(N - 1, Math.round(tuner.scrollLeft / markW)));
  if (i !== state.index) tune(i, { via: 'tuner' });
}

tuner.addEventListener(
  'scroll',
  () => {
    if (Date.now() < ignoreScrollUntil) return;
    const v = tuner.scrollLeft / markW;
    const near = Math.round(v);
    if (state.powered) engine.setStatic(Math.min(1, Math.abs(v - near) * 2.2));
    if (near !== lastDetent) {
      lastDetent = near;
      haptic(6);
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settleTuner, 160);
  },
  { passive: true },
);
tuner.addEventListener('touchstart', () => (touching = true), { passive: true });
tuner.addEventListener(
  'touchend',
  () => {
    touching = false;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settleTuner, 220);
  },
  { passive: true },
);

// Mouse: drag the ruler like a dial.
{
  let drag = null;
  tuner.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: tuner.scrollLeft, moved: false };
  });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 4) return;
    drag.moved = true;
    tuner.classList.add('dragging');
    tuner.scrollLeft = drag.left - dx;
  });
  addEventListener('pointerup', () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    tuner.classList.remove('dragging');
    const i = Math.max(0, Math.min(N - 1, Math.round(tuner.scrollLeft / markW)));
    engine.setStatic(0);
    scrollTunerTo(i, true);
    if (i !== state.index) tune(i, { via: 'tuner' });
    // Swallow the click that ends a drag.
    tuner.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
  });
  let wheelAt = 0;
  tuner.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // horizontal: native scroll
      e.preventDefault();
      if (Date.now() - wheelAt < 450) return;
      wheelAt = Date.now();
      tune(state.index + (e.deltaY > 0 ? 1 : -1), { via: 'button' });
    },
    { passive: false },
  );
}

// ---------------------------------------------------------------- swipe between stations

{
  const stage = $('#stage');
  let swipe = null;
  const activeView = () => [...document.querySelectorAll('.view')].find((v) => !v.hidden);
  stage.addEventListener('pointerdown', (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button') || body.classList.contains('car')) return;
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, active: false, dx: 0, t: performance.now() };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x;
    const dy = e.clientY - swipe.y;
    if (!swipe.active) {
      if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        swipe.active = true;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('dragging');
      } else if (Math.abs(dy) > 14) {
        swipe = null;
        return;
      } else return;
    }
    swipe.dx = dx;
    const v = activeView();
    if (v) {
      v.style.transform = `translateX(${dx * 0.4}px)`;
      v.style.opacity = String(1 - Math.min(0.6, Math.abs(dx) / 500));
    }
  });
  const end = () => {
    if (!swipe) return;
    const { active, dx, t } = swipe;
    swipe = null;
    if (!active) return;
    stage.classList.remove('dragging');
    const v = activeView();
    if (v) {
      v.style.transform = '';
      v.style.opacity = '';
    }
    const fast = Math.abs(dx) / (performance.now() - t) > 0.5;
    if (Math.abs(dx) > 70 || (fast && Math.abs(dx) > 30)) {
      haptic(10);
      tune(state.index + (dx < 0 ? 1 : -1), { via: 'swipe' });
    }
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------- tuning

function tune(i, { via = 'button' } = {}) {
  const target = ((i % N) + N) % N;
  const initial = via === 'initial';
  if (target === state.index && !initial) {
    if (via !== 'tuner') scrollTunerTo(target, true);
    if (state.powered && via === 'button') announceSoon(); // tap again to hear what's on
    return;
  }
  const prev = station();
  state.index = target;
  const st = station();
  body.dataset.station = st.id;
  if (!BROADCAST) {
    store.set('station', st.id);
    history.replaceState(null, '', `#${st.id}`);
  }
  state.slide = null;
  state.visualFailed[st.id] = false;
  if (!initial) leaveView(prev);
  enterView(st, !initial);
  if (via !== 'tuner') scrollTunerTo(target, !initial);
  rds.reset();
  startPolling(st);
  if (state.powered) {
    if (source() === 'fm') {
      engine.staticBurst();
      playStream(st);
    } else {
      engine.setMood({ ...st.mood, id: st.id }, st.sonify(data(), Date.now()));
      if (source() === 'tracks') tracks.play(st.id, st.musicMood(data(), Date.now()));
    }
    dj.stop();
    announceSoon();
  }
  if (BROADCAST) renderBroadcastStation();
  if ($('#qr-dialog').open) renderQr();
  render();
}

function enterView(st, animate) {
  for (const v of document.querySelectorAll('.view')) v.hidden = true;
  const view = $({ iss: '#view-iss', launch: '#view-launch' }[st.view] || '#view-slides');
  view.hidden = false;
  if (animate) {
    view.classList.remove('entering');
    void view.offsetWidth;
    view.classList.add('entering');
  }
  if (st.view === 'iss' && !body.classList.contains('car')) {
    issView.enter(settings.issVideo, state.issMain, !(BROADCAST && params.get('camera') === '0'));
  }
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
  applyData(st);
  render();
  if (announcePending) announceSoon();
}

// ---------------------------------------------------------------- rendering

// RDS-style line: steps through short live facts.
const rds = {
  segments: [],
  i: 0,
  els: [$('#np-line'), $('#oa-line')],
  set(segments) {
    this.segments = segments.filter(Boolean);
    if (this.i >= this.segments.length) this.i = 0;
    this.show(false);
  },
  reset() {
    this.i = 0;
    this.show(true);
  },
  step() {
    if (this.segments.length < 2) return;
    this.i = (this.i + 1) % this.segments.length;
    this.show(true);
  },
  show(animate) {
    const text = this.segments[this.i] || '';
    for (const el of this.els) {
      if (el.textContent === text) continue;
      el.textContent = text;
      if (animate) {
        el.classList.remove('swap');
        void el.offsetWidth;
        el.classList.add('swap');
      }
    }
  },
};
setInterval(() => rds.step(), 3200);

function tickerSegments(st) {
  const segs = st.ticker(data(), Date.now(), state.slide).split(' · ');
  const t = source() === 'tracks' && state.powered ? state.nowPlaying : null;
  return t ? [`♪ ${t.title} · ${t.artist}`, ...segs] : segs;
}

function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function hasVisual(st, d) {
  if (state.visualFailed[st.id]) return false;
  if (st.view === 'iss') return true;
  if (st.view === 'launch') return !!st.next(d, Date.now());
  return !!state.slide;
}

function renderNowPlaying() {
  const st = station();
  for (const [sel, val] of [
    ['#np-freq', st.freq],
    ['#np-unit', st.unit],
    ['#np-name', st.name],
    ['#splash-freq', st.freq],
    ['#splash-name', st.name],
    ['#sheet-eyebrow', `${st.freq} ${st.unit}`.trim()],
    ['#sheet-name', st.name],
  ]) {
    $(sel).textContent = val;
  }
  document.querySelectorAll('.tuner-mark').forEach((m, i) => m.setAttribute('aria-current', i === state.index));
  document.querySelectorAll('.preset').forEach((p, i) => p.setAttribute('aria-current', i === state.index));
  $('#tuner').setAttribute('aria-valuenow', state.index + 1);
  $('#tuner').setAttribute('aria-valuetext', `${st.name}, ${st.freq} ${st.unit}`);
  const play = $('#play');
  play.setAttribute('aria-pressed', state.powered);
  play.setAttribute('aria-label', state.powered ? 'Pause' : 'Tune in');
  document.querySelectorAll('[data-source]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.source === state.source));
  $('#dj-toggle').checked = state.djOn;
  $('#volume').value = state.volume;
  $('.iss-swap span').textContent = state.issMain === 'camera' ? 'Map' : 'Camera';
}

function renderSheet() {
  const st = station();
  const d = data();
  const now = Date.now();
  const status = state.status[st.id];
  const el = $('#status');
  el.className = `status ${status === 'error' ? 'lost' : status === 'ok' ? '' : 'loading'}`;
  el.replaceChildren(document.createElement('i'));
  el.append(
    status === 'ok'
      ? `Live · updated ${ago(state.updatedAt[st.id])}`
      : status === 'error'
        ? `No signal · retrying (${state.errors[st.id]})`
        : 'Acquiring signal…',
  );

  const rows = st.telemetry(d, now, state.slide);
  const cards = $('#cards');
  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'cards-empty';
    empty.textContent = status === 'error' ? 'Telemetry is out of range right now.' : 'Waiting for the first readings…';
    cards.replaceChildren(empty);
  } else {
    cards.replaceChildren(
      ...rows.map(([k, v]) => {
        const card = document.createElement('dl');
        card.className = `card${String(v).length > 17 ? ' wide' : ''}`;
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = k;
        dd.textContent = v;
        card.append(dt, dd);
        return card;
      }),
    );
  }
  $('#sound-text').textContent = st.sound;
  $('#about-text').textContent = st.about;
  $('#on-screen').textContent = state.slide?.caption ? `On screen: ${state.slide.caption}` : '';
  renderMusicNote(st);
}

function renderMusicNote(st = station()) {
  const el = $('#music-note');
  const t = state.nowPlaying;
  if (source() === 'tracks' && t && state.powered) {
    const link = (href, text) => Object.assign(document.createElement('a'), { href, textContent: text, target: '_blank', rel: 'noopener' });
    el.replaceChildren(`♪ “${t.title}” · ${t.artist} · `, link(t.licenseUrl, t.license), ' · ', link(t.sourceUrl, 'source'));
  } else if (source() === 'tracks') {
    el.textContent = 'Free-licensed music picked for this station, changing with the live data. Everyone tuned in hears the same track at the same moment.';
  } else if (source() === 'fm') {
    el.textContent = state.streamNote || `SomaFM · ${SOMA_CHANNELS[st.soma]} · listener-supported radio`;
  } else {
    el.textContent = 'Composed live from this station’s data. Everyone tuned in hears the same notes at the same moment.';
  }
}

function renderLog() {
  $('#log-block').hidden = !state.log.length;
  $('#log').replaceChildren(
    ...state.log.map(({ at, text }) => {
      const li = document.createElement('li');
      const time = document.createElement('time');
      time.textContent = new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      li.append(time, text);
      return li;
    }),
  );
}

function renderSignal() {
  const st = station();
  const d = data();
  const status = state.status[st.id];
  const visual = hasVisual(st, d);
  body.classList.toggle('has-visual', visual);
  const el = $('#signal');
  let text = '';
  let lost = false;
  if (state.visualFailed[st.id]) {
    text = `${st.name}’s images aren’t loading · retrying`;
    lost = true;
  } else if (status === 'error' && !st.hasSignal(d)) {
    text = `No signal from ${st.name} · retrying`;
    lost = true;
  } else if (!visual || (status !== 'ok' && !st.hasSignal(d))) {
    text = 'Acquiring signal…';
  }
  el.hidden = !text;
  el.classList.toggle('lost', lost);
  el.querySelector('.signal-text').textContent = text;
}

function render() {
  const st = station();
  const d = data();
  renderNowPlaying();
  rds.set(tickerSegments(st));
  renderSheet();
  renderSignal();
  if (st.view === 'iss') issView.update(d, st);
  if (st.view === 'launch') launchView.update(st, d, Date.now());
  if (BROADCAST) {
    renderBroadcastTicker(!tickerHasData);
    const t = state.nowPlaying;
    $('#oa-credit').textContent =
      source() === 'tracks' && t ? `♪ “${t.title}” · ${t.artist} · ${t.license}` : '♪ Composed live from this station’s data';
  }
  updateMediaSession();
}

// Once a second: countdowns, clocks, "updated N s ago".
setInterval(() => {
  const st = station();
  renderSheet();
  if (st.view === 'launch') launchView.update(st, data(), Date.now());
  if (BROADCAST) broadcastTick();
}, 1000);

// Live data shapes the sound: the composition (or, under station music, its
// wind and blips and the music's tone), and which playlist mood plays.
function applyData(st = station()) {
  if (!engineOn()) return;
  engine.setData(st.sonify(data(), Date.now()));
  if (source() === 'tracks') tracks.setMood(st.musicMood(data(), Date.now()));
}

// Time-driven changes (Mars local time, launch countdown) every 30 s.
setInterval(() => applyData(), 30e3);

// Oscilloscope and the play button's glow follow the real output.
function frame() {
  for (const s of scopes) if (s.canvas.offsetParent) s.draw(state.powered);
  $('#play').style.setProperty('--level', Math.min(0.6, scopes[0].level * 2).toFixed(3));
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- audio

async function powerOn() {
  if (state.powered) return;
  state.powered = true;
  tracks.unlock();
  const st = station();
  engine.setVolume(state.volume);
  stream.setVolume(state.volume);
  try {
    await startMusic(st);
  } catch (e) {
    console.warn(e);
  }
  engine.setVolume(state.volume);
  setupMediaSession();
  restartBulletins();
  announceSoon();
  render();
}

function powerOff() {
  if (!state.powered) return;
  state.powered = false;
  engine.suspend();
  stream.stop();
  tracks.stop();
  dj.stop();
  clearInterval(bulletinTimer);
  render();
}

const togglePower = () => (state.powered ? powerOff() : powerOn());

// Start whichever music source is selected, for the current station.
async function startMusic(st = station()) {
  const src = source();
  if (src === 'fm') {
    tracks.stop();
    engine.stop();
    await engine.prepare($('#engine-out'));
    engine.staticBurst();
    playStream(st);
    return;
  }
  stream.stop();
  engine.setTexture(src === 'tracks');
  engine.setMood({ ...st.mood, id: st.id }, st.sonify(data(), Date.now()));
  await engine.start($('#engine-out'));
  if (src === 'tracks') tracks.play(st.id, st.musicMood(data(), Date.now()));
  else tracks.stop();
}

async function playStream(st) {
  state.streamNote = `Connecting to SomaFM ${SOMA_CHANNELS[st.soma]}…`;
  renderSheet();
  try {
    const name = await stream.play(st.soma);
    if (!name) return; // superseded by another tune
    state.streamNote = `SomaFM · ${name} · listener-supported radio`;
  } catch (e) {
    state.streamNote = '';
    console.warn(e);
    if (state.source === 'fm' && station() === st) {
      toast(`SomaFM isn’t reachable. Switched to ${tracks.ready ? 'station music' : 'live composition'}.`, 4000);
      setSource(tracks.ready ? 'tracks' : 'gen');
    }
  }
  renderSheet();
}

function setSource(src) {
  if (src === state.source) return;
  tracks.unlock();
  state.source = src;
  if (!BROADCAST) store.set('source', src);
  if (state.powered) {
    engine.staticBurst();
    startMusic();
  }
  render();
}

function setVolume(v) {
  state.volume = v;
  store.set('volume', v);
  engine.setVolume(v);
  stream.setVolume(v);
}

// ---------------------------------------------------------------- DJ

let announceTimer = null;
let announcePending = false;
let bulletinTimer = null;

function say(text) {
  if (!state.djOn || !text) return;
  dj.say(text);
  state.log.unshift({ at: Date.now(), text });
  state.log.length = Math.min(state.log.length, 6);
  renderLog();
}

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
  say(station().intro(data(), Date.now()));
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
  say(n % 3 === 2 ? `${line} You’re listening to ${st.name}, on Space Music.` : line);
}

function setDJ(on) {
  state.djOn = on;
  dj.enabled = on;
  if (!BROADCAST) store.set('dj', on);
  if (!on) dj.stop();
  else announceSoon();
  render();
}

// ---------------------------------------------------------------- OS media controls

let mediaKey = '';
let mediaAt = 0;

function setupMediaSession() {
  if (!('mediaSession' in navigator) || setupMediaSession.done) return;
  setupMediaSession.done = true;
  const handlers = {
    play: powerOn,
    pause: powerOff,
    stop: powerOff,
    // Headset, lock-screen and steering-wheel next/previous change station.
    nexttrack: () => tune(state.index + 1),
    previoustrack: () => tune(state.index - 1),
  };
  for (const [action, fn] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, fn);
    } catch {
      /* unsupported action */
    }
  }
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
  const st = station();
  navigator.mediaSession.playbackState = state.powered ? 'playing' : 'paused';
  const t = source() === 'tracks' && state.powered ? state.nowPlaying : null;
  // With station music, show the track (as music apps do) and the station under it.
  const title = t ? t.title : `${st.name} · ${st.freq} ${st.unit}`.trim();
  const line = t ? `${t.artist} · ${st.name}` : tickerSegments(st).slice(0, 3).join(' · ');
  const key = `${title}|${line}`;
  // Lock screens and car displays redraw slowly; don't flood them.
  if (key === mediaKey || (Date.now() - mediaAt < 15e3 && key.startsWith(`${title}|`))) return;
  mediaKey = key;
  mediaAt = Date.now();
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: line,
    album: 'Space Music · live from the solar system',
    artwork: [{ src: new URL(`art/${st.id}.png`, location.href).href, sizes: '512x512', type: 'image/png' }],
  });
}

// ---------------------------------------------------------------- sheet, splash, panels

function openSheet(open) {
  const sheet = $('#sheet');
  sheet.classList.toggle('open', open);
  sheet.style.removeProperty('--drag');
  $('#scrim').hidden = !open;
  $('#details-btn').setAttribute('aria-expanded', open);
  if (open) renderSheet();
}

{
  const head = $('.sheet-head');
  let drag = null;
  head.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    drag = { y: e.clientY, dy: 0 };
    head.setPointerCapture(e.pointerId);
    $('#sheet').classList.add('dragging');
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    $('#sheet').style.setProperty('--drag', `${drag.dy}px`);
  });
  const end = () => {
    if (!drag) return;
    const close = drag.dy > 90;
    drag = null;
    $('#sheet').classList.remove('dragging');
    if (close) openSheet(false);
    else $('#sheet').style.removeProperty('--drag');
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}

function dismissSplash(listen) {
  $('#splash').classList.add('gone');
  if (listen) powerOn();
  setTimeout(() => ($('#splash').hidden = true), 700);
}

function renderQr() {
  const url = joinUrl();
  $('#qr-code').innerHTML = qrSvg(url, { label: `QR code for ${url}` });
  $('#qr-name').textContent = `${station().name} · ${station().freq} ${station().unit}`.trim();
  $('#qr-url').textContent = prettyUrl(url);
  $('#qr-dialog .orb').dataset.station = station().id;
}

async function share() {
  const st = station();
  const url = joinUrl(st);
  const text = `I’m listening to ${st.name} on Space Music: ${st.tagline}. Tune in with me; we’ll hear the same music.`;
  if (navigator.share) {
    try {
      await navigator.share({ title: `${st.name} · Space Music`, text, url });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  copyLink(url);
}

async function copyLink(url = joinUrl()) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied. Anyone who opens it hears what you hear.');
  } catch {
    toast(prettyUrl(url), 5000);
  }
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
  if (document.visibilityState === 'visible' && (body.classList.contains('car') || body.classList.contains('tv') || BROADCAST)) {
    keepAwake(true);
  }
});

function setCar(on) {
  const was = body.classList.contains('car');
  body.classList.toggle('car', on);
  if (on) setTV(false);
  starfield.paused = on;
  store.set('car', on);
  keepAwake(on);
  // Car mode hides the view, so don't keep streaming the ISS video behind it.
  if (station().view === 'iss' && on !== was) {
    if (on) issView.leave();
    else issView.enter(settings.issVideo, state.issMain);
  }
  if (on) openSheet(false);
  render();
}

let enteredFullscreen = false;

function setTV(on) {
  if (body.classList.contains('tv') === on) return;
  body.classList.toggle('tv', on);
  if (on) {
    openSheet(false);
    wake();
    document.documentElement
      .requestFullscreen?.()
      .then(() => (enteredFullscreen = true))
      .catch(() => {});
    toast('TV mode · move the pointer or tap to show controls');
  } else if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  keepAwake(on);
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && enteredFullscreen) {
    enteredFullscreen = false;
    setTV(false);
  }
});

// In TV mode the chrome hides itself after a few idle seconds.
let idleTimer = null;
function wake() {
  body.classList.add('ui-awake');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => body.classList.remove('ui-awake'), 3500);
}
for (const ev of ['pointermove', 'pointerdown', 'keydown']) addEventListener(ev, wake, { passive: true });

// ---------------------------------------------------------------- broadcast (YouTube, Twitch, TikTok, Instagram)

const schedule = (() => {
  const ids = (params.get('stations') || '').split(',').map(indexOf).filter((i) => i >= 0);
  const list = ids.length ? ids : STATIONS.map((_, i) => i);
  const minutes = Number(params.get('rotate') ?? (hashIndex() >= 0 ? 0 : 10));
  return { list, period: minutes * 60e3 };
})();

// The schedule is read off the wall clock, so every broadcaster and viewer agrees.
function scheduledIndex(now = Date.now()) {
  return schedule.list[Math.floor(now / schedule.period) % schedule.list.length];
}

function renderBroadcastStation() {
  const st = station();
  $('#oa-freq').textContent = st.freq;
  $('#oa-unit').textContent = st.unit;
  $('#oa-tagline').textContent = st.tagline;
  $('#oa-name').textContent = st.name;
  const url = joinUrl(st);
  $('#oa-qr').innerHTML = qrSvg(url, { margin: 2, label: `QR code for ${url}` });
  $('#oa-url').textContent = prettyUrl(url);
  renderBroadcastTicker(true);
}

let tickerAt = 0;
let tickerHasData = false;
function renderBroadcastTicker(force) {
  if (!force && Date.now() - tickerAt < 20e3) return;
  tickerAt = Date.now();
  const st = station();
  const rows = st.telemetry(data(), Date.now(), state.slide);
  tickerHasData = rows.length > 0;
  const items = rows.length ? rows : [[st.name, st.tagline]];
  const track = $('#oa-ticker');
  track.replaceChildren(
    ...[...items, ['Tune in', prettyUrl(joinUrl(st))], ['Music', 'composed live from this data']].map(([k, v]) => {
      const span = document.createElement('span');
      const b = document.createElement('b');
      b.textContent = k;
      span.append(b, v);
      return span;
    }),
  );
  track.style.setProperty('--ticker-dur', `${Math.max(25, track.scrollWidth / 70)}s`);
}

function broadcastTick() {
  const now = Date.now();
  $('#oa-clock').textContent = `${new Date(now).toISOString().slice(11, 16)} UTC`;
  const next = $('#oa-next');
  if (schedule.period > 0 && schedule.list.length > 1) {
    const due = scheduledIndex(now);
    if (due !== state.index) tune(due, { via: 'schedule' });
    const left = schedule.period - (now % schedule.period);
    const upcoming = STATIONS[scheduledIndex(now + left + 1000)];
    const m = Math.floor(left / 60e3);
    const s = String(Math.floor((left % 60e3) / 1000)).padStart(2, '0');
    next.innerHTML = 'Up next · <b></b> · in ';
    next.querySelector('b').textContent = upcoming.name;
    next.append(`${m}:${s}`);
    next.hidden = false;
  } else next.hidden = true;
}

async function startBroadcast() {
  body.classList.add('broadcast');
  $('#splash').hidden = true;
  keepAwake(true);
  await powerOn();
  // Streaming software (OBS) allows autoplay; a normal browser tab may not.
  setTimeout(() => {
    if (engine.ctx?.state !== 'running') {
      const btn = $('#oa-start');
      btn.hidden = false;
      btn.addEventListener(
        'click',
        async () => {
          await engine.prepare($('#engine-out'));
          btn.hidden = true;
        },
        { once: true },
      );
    }
  }, 1200);
}

// ---------------------------------------------------------------- menu and settings

const menu = $('#menu');
const qrDialog = $('#qr-dialog');
let installPrompt = null;

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  menu.querySelector('[data-action=install]').hidden = false;
});

function fillVoices() {
  const select = $('#settings-form').voice;
  select.replaceChildren(new Option('Automatic', ''));
  for (const v of dj.voices()) select.append(new Option(`${v.name} (${v.lang})`, v.name));
  select.value = settings.voice;
  select.disabled = !dj.synth;
}

function renderCredits() {
  const list = $('#music-credits');
  if (!tracks.catalog?.tracks?.length || list.childElementCount) return;
  list.replaceChildren(
    ...tracks.catalog.tracks.map((t) => {
      const li = document.createElement('li');
      li.append(`${creditLine(t)}. Changes: ${t.changes}. `);
      li.append(Object.assign(document.createElement('a'), { href: t.sourceUrl, textContent: 'Source', target: '_blank', rel: 'noopener' }));
      return li;
    }),
  );
}

function openMenu() {
  renderCredits();
  const f = $('#settings-form');
  f.nasaKey.value = settings.nasaKey;
  f.issVideo.value = settings.issVideo;
  f.djEvery.value = String(settings.djEvery);
  fillVoices();
  menu.showModal();
}

function openQr() {
  renderQr();
  if (menu.open) menu.close();
  qrDialog.showModal();
}

dj.synth?.addEventListener?.('voiceschanged', () => menu.open && fillVoices());

$('#settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
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
  menu.close();
  toast('Settings saved');
});

// ---------------------------------------------------------------- input

function bindControls() {
  $('#play').addEventListener('click', togglePower);
  $('#prev').addEventListener('click', () => tune(state.index - 1));
  $('#next').addEventListener('click', () => tune(state.index + 1));
  $('#tune-in').addEventListener('click', () => dismissSplash(true));
  $('#look-only').addEventListener('click', () => dismissSplash(false));
  $('#np-art').addEventListener('click', () => openSheet(!$('#sheet').classList.contains('open')));
  $('#details-btn').addEventListener('click', () => openSheet(true));
  $('#sheet-close').addEventListener('click', () => openSheet(false));
  $('#scrim').addEventListener('click', () => openSheet(false));
  $('#share-btn').addEventListener('click', share);
  $('#menu-btn').addEventListener('click', openMenu);
  $('#car-exit').addEventListener('click', () => setCar(false));
  $('#dj-toggle').addEventListener('change', (e) => setDJ(e.target.checked));
  $('#volume').addEventListener('input', (e) => setVolume(Number(e.target.value)));
  $('#live-pill').addEventListener('click', () => toast(`Everyone on ${station().name} hears the same music, right now.`));
  for (const b of document.querySelectorAll('[data-source]')) b.addEventListener('click', () => setSource(b.dataset.source));
  for (const d of [menu, qrDialog]) {
    d.addEventListener('click', (e) => {
      if (e.target === d || e.target.closest('[data-close]')) d.close();
    });
  }
  document.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'share') share();
    else if (action === 'qr') openQr();
    else if (action === 'copy') copyLink();
    else if (action === 'tv') {
      menu.close();
      setTV(true);
    } else if (action === 'car') {
      menu.close();
      setCar(true);
    } else if (action === 'install' && installPrompt) {
      installPrompt.prompt();
      installPrompt = null;
      menu.querySelector('[data-action=install]').hidden = true;
    } else if (action === 'broadcast') {
      menu.close();
    }
  });
  $('.iss-swap').addEventListener('click', () => {
    state.issMain = state.issMain === 'camera' ? 'map' : 'camera';
    store.set('issMain', state.issMain);
    issView.setMain(state.issMain);
    render();
  });

  addEventListener('hashchange', () => {
    const i = hashIndex();
    if (i >= 0 && i !== state.index) tune(i, { via: 'button' });
  });

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || menu.open || qrDialog.open || BROADCAST) return;
    if (e.target.closest('input, select, textarea')) return;
    const onButton = e.target.closest('button');
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= String(N)) tune(Number(k) - 1);
    else if (k === 'arrowright') tune(state.index + 1);
    else if (k === 'arrowleft') tune(state.index - 1);
    else if (k === ' ' && !onButton) {
      e.preventDefault();
      if (!$('#splash').hidden && !$('#splash').classList.contains('gone')) dismissSplash(true);
      else togglePower();
    } else if (k === 'i') openSheet(!$('#sheet').classList.contains('open'));
    else if (k === 'm') setSource({ tracks: 'gen', gen: 'fm', fm: 'tracks' }[state.source] || 'tracks');
    else if (k === 'd') setDJ(!state.djOn);
    else if (k === 't') setTV(!body.classList.contains('tv'));
    else if (k === 'c') setCar(!body.classList.contains('car'));
    else if (k === 's') share();
    else if (k === 'escape') {
      if ($('#sheet').classList.contains('open')) openSheet(false);
      else if (body.classList.contains('car')) setCar(false);
      else setTV(false);
    }
  });
}

// Keep layout offsets in sync with the real size of the chrome.
function measureLayout() {
  const root = document.documentElement.style;
  const player = $('#player').getBoundingClientRect();
  const top = $('#topbar').getBoundingClientRect();
  if (player.height) root.setProperty('--player-h', `${Math.ceil(innerHeight - player.top)}px`);
  if (top.height) root.setProperty('--top-h', `${Math.ceil(top.bottom)}px`);
  measureMark();
  scrollTunerTo(state.index, false);
}
new ResizeObserver(measureLayout).observe($('#player'));
addEventListener('resize', measureLayout);

// ---------------------------------------------------------------- boot

buildTuner();
bindControls();
// Station music becomes available once its catalog loads (it's built at publish time).
tracks.load().then((ok) => {
  if (ok && state.powered && state.source === 'tracks') startMusic();
  render();
});
body.dataset.station = station().id;
if (BROADCAST) {
  if (schedule.period > 0 && hashIndex() < 0) state.index = scheduledIndex();
  body.classList.add('broadcast');
}
if (!BROADCAST && store.get('car', false)) setCar(true);
tune(state.index, { via: 'initial' });
$('#splash-eyebrow').textContent = hashIndex() >= 0 && !BROADCAST ? 'You’re invited to tune in' : 'Now on air';
if (BROADCAST) {
  renderBroadcastStation();
  startBroadcast();
}
measureLayout();
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Exposed for debugging and the smoke test.
window.spaceMusic = { state, engine, tracks, stream, dj, tune, powerOn, powerOff, setSource, STATIONS };
