// Station playlists of recorded music (CC BY, CC0 and public domain, listed in
// music/catalog.json). Like the live composition, playback is scheduled by the
// clock: everyone tuned to the same station and mood hears the same track at
// the same second. Live data picks the mood (e.g. ISS daylight vs shadow).

import { hashString } from './engine.js';

export async function loadCatalog(url = 'music/catalog.json') {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const catalog = await res.json();
    catalog.byId = Object.fromEntries((catalog.tracks || []).map((t) => [t.id, t]));
    return catalog;
  } catch {
    return null;
  }
}

const playable = (t) => t && t.file && t.duration > 0;

// Tracks for a station's mood, falling back to its default list, then to
// everything the station has.
export function playlistFor(catalog, stationId, mood) {
  if (!catalog) return [];
  const lists = catalog.stations?.[stationId] || {};
  const pick = (ids) => (ids || []).map((id) => catalog.byId[id]).filter(playable);
  for (const ids of [lists[mood], lists.default]) {
    const list = pick(ids);
    if (list.length) return list;
  }
  return pick([...new Set(Object.values(lists).flat())]);
}

// Where the clock says a playlist is at wall-clock second `wall`. Each
// station/mood gets its own offset so stations don't all change track together.
export function positionAt(list, wall, salt) {
  const total = list.reduce((s, t) => s + t.duration, 0);
  if (!total) return null;
  let t = (((wall + (hashString(salt) % 3600)) % total) + total) % total;
  for (let i = 0; i < list.length; i++) {
    if (t < list[i].duration) return { index: i, track: list[i], offset: t, remaining: list[i].duration - t };
    t -= list[i].duration;
  }
  return { index: 0, track: list[0], offset: 0, remaining: list[0].duration };
}

// 0.1 s of silence, used to unlock the decks on iOS.
const SILENCE = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NwwAAAAAAAAAAAAEluZm8AAAAPAAAABgAAAykAWlpaWlpaWlpaWlpaWlpaWnt7e3t7e3t7e3t7e3t7e3t7nJycnJycnJycnJycnJycnL29vb29vb29vb29vb29vb293t7e3t7e3t7e3t7e3t7e3t7/////////////////////AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQCowAAAAAAAAMpso+sIAAAAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NCxKMAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//NAxKQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80LEowAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';

export function creditLine(t) {
  return t.credit || `“${t.title}” by ${t.artist} · ${t.license}`;
}

// Two decks for crossfades, routed through the music engine's graph so the
// DJ can duck them, live data can shade them, and the oscilloscope sees them.
export class TrackPlayer {
  constructor(engine, { onTrack } = {}) {
    this.engine = engine;
    this.onTrack = onTrack;
    this.catalog = null;
    this.decks = [0, 1].map(() => {
      const el = new Audio();
      el.preload = 'auto';
      el.addEventListener('ended', () => this.playing && this.sync());
      return { el, gain: null };
    });
    this.active = 0;
    this.current = null;
    this.playing = false;
    this.timer = null;
  }

  // iOS only lets a media element play later if it first played during a tap,
  // so call this synchronously from the tap that starts the music.
  unlock() {
    for (const d of this.decks) {
      if (d.unlocked) continue;
      d.unlocked = true;
      d.el.src = SILENCE;
      d.el.play().then(() => d.el.pause(), () => {});
    }
  }

  get ready() {
    return !!this.catalog?.tracks?.some(playable);
  }

  async load() {
    this.catalog = await loadCatalog();
    return this.ready;
  }

  connect() {
    const ctx = this.engine.ctx;
    if (!ctx || this.decks[0].gain) return;
    for (const d of this.decks) {
      const src = ctx.createMediaElementSource(d.el);
      d.gain = ctx.createGain();
      d.gain.gain.value = 0;
      src.connect(d.gain).connect(this.engine.trackInput);
    }
  }

  play(stationId, mood) {
    this.connect();
    const changed = stationId !== this.station || mood !== this.mood || !this.playing;
    this.station = stationId;
    this.mood = mood;
    this.playing = true;
    if (changed) this.sync(stationId !== this.lastStation ? 2.2 : 4);
    this.lastStation = stationId;
    return this.ready;
  }

  setMood(mood) {
    if (!this.playing || mood === this.mood) return;
    this.mood = mood;
    this.sync(6); // a slow crossfade: orbital sunrise shouldn't feel like a jump cut
  }

  stop() {
    this.playing = false;
    clearTimeout(this.timer);
    for (const d of this.decks) this.fade(d, 0, 0.8, true);
    this.current = null;
  }

  now() {
    return Date.now() / 1000;
  }

  fade(deck, to, seconds, pauseAfter = false) {
    const ctx = this.engine.ctx;
    if (!deck.gain || !ctx) return;
    const g = deck.gain.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + seconds);
    if (pauseAfter) {
      const el = deck.el;
      setTimeout(() => {
        if (deck.gain.gain.value < 0.01 && deck !== this.decks[this.active]) el.pause();
        if (!this.playing) el.pause();
      }, seconds * 1000 + 100);
    }
  }

  // Bring the decks in line with what the clock says should be playing.
  sync(crossfade = 2.5) {
    clearTimeout(this.timer);
    if (!this.playing) return;
    const list = playlistFor(this.catalog, this.station, this.mood);
    const pos = positionAt(list, this.now(), `${this.station}:${this.mood}`);
    if (!pos) {
      this.onTrack?.(null);
      return;
    }
    const deck = this.decks[this.active];
    const sameTrack = this.current?.track.id === pos.track.id && deck.el.src.endsWith(encodeURI(pos.track.file));
    if (sameTrack) {
      this.current = pos;
      // Correct drift only when it's noticeable.
      if (!deck.el.paused && Math.abs(deck.el.currentTime - pos.offset) > 2.5) deck.el.currentTime = pos.offset;
    } else {
      this.start(pos, crossfade);
    }
    // Check again just before the track ends, and every 20 s for drift.
    this.timer = setTimeout(() => this.sync(), Math.max(0.5, Math.min(pos.remaining - 0.4, 20)) * 1000);
  }

  start(pos, crossfade) {
    const outgoing = this.decks[this.active];
    this.active = 1 - this.active;
    const deck = this.decks[this.active];
    const el = deck.el;
    const startedAt = this.now();
    el.src = pos.track.file;
    const seek = () => {
      el.currentTime = pos.offset + (this.now() - startedAt);
    };
    el.addEventListener('loadedmetadata', seek, { once: true });
    el.play().catch(() => {});
    this.fade(deck, 1, crossfade);
    this.fade(outgoing, 0, crossfade, true);
    this.current = pos;
    this.onTrack?.(pos.track);
  }
}
