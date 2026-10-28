// Visual layers: a crossfading slideshow for image stations, the ISS camera
// and map, the launch countdown, and the oscilloscope that draws the music.

import { countdown } from './stations.js';

const NASA_YOUTUBE_CHANNEL = 'UCLA_DiR1FfKNvjuUpBHmylQ';

// Crossfading slideshow locked to the wall clock: frame = floor(now / interval),
// so everyone on the same station sees the same picture at the same time.
export class Slideshow {
  constructor(root) {
    this.root = root;
    this.layers = [...root.querySelectorAll('.slide')];
    this.caption = root.querySelector('.caption');
    this.items = [];
    this.index = -1;
    this.active = 0;
    this.token = 0;
    this.key = null;
    this.failed = new Set();
  }

  show({ items, fit, interval }, { onSlide, onFail } = {}) {
    const key = items.map((i) => i.src).join('|');
    this.onSlide = onSlide;
    this.onFail = onFail;
    if (key === this.key) return;
    this.key = key;
    this.items = items;
    this.interval = interval;
    this.failed.clear();
    this.root.dataset.fit = fit;
    this.index = -1;
    if (items.length) this.sync();
  }

  current() {
    return this.items[this.index] || null;
  }

  sync() {
    clearTimeout(this.timer);
    clearTimeout(this.preloadTimer);
    if (!this.items.length) return;
    const now = Date.now();
    const slot = Math.floor(now / this.interval);
    this.load(slot % this.items.length);
    const wait = this.interval - (now % this.interval);
    this.timer = setTimeout(() => this.sync(), wait + 20);
    // Warm the cache so the next frame can land on the beat.
    const next = this.items[(slot + 1) % this.items.length];
    this.preloadTimer = setTimeout(() => (new Image().src = next.src), Math.max(0, wait - 4000));
  }

  load(index) {
    if (this.failed.size >= this.items.length) return;
    let i = index;
    while (this.failed.has(i)) i = (i + 1) % this.items.length;
    if (i === this.index && this.layers[this.active].classList.contains('on')) return;
    const item = this.items[i];
    const img = this.layers[1 - this.active];
    const token = ++this.token;
    let triedFallback = false;
    img.onload = () => {
      if (token !== this.token) return;
      this.index = i;
      this.layers[this.active].classList.remove('on');
      img.classList.add('on');
      this.active = 1 - this.active;
      this.caption.textContent = item.caption || '';
      this.onSlide?.(item);
    };
    img.onerror = () => {
      if (token !== this.token) return;
      if (item.fallback && !triedFallback) {
        triedFallback = true;
        img.src = item.fallback;
        return;
      }
      this.failed.add(i);
      if (this.failed.size >= this.items.length) this.onFail?.();
      else this.load((i + 1) % this.items.length);
    };
    img.alt = item.caption || '';
    img.src = item.src;
  }

  stop() {
    clearTimeout(this.timer);
    clearTimeout(this.preloadTimer);
    this.token++;
    this.key = null;
    this.items = [];
    this.index = -1;
    for (const l of this.layers) l.classList.remove('on');
    this.caption.textContent = '';
  }
}

export function youtubeEmbed(setting = '') {
  const params = 'autoplay=1&mute=1&controls=0&playsinline=1&rel=0';
  const s = setting.trim();
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|live\/)([\w-]{11})/);
  const id = m ? m[1] : /^[\w-]{11}$/.test(s) ? s : null;
  if (id) return `https://www.youtube.com/embed/${id}?${params}`;
  return `https://www.youtube.com/embed/live_stream?channel=${NASA_YOUTUBE_CHANNEL}&${params}`;
}

export class IssView {
  constructor(root, map) {
    this.root = root;
    this.map = map;
    this.frame = root.querySelector('iframe');
    this.shade = root.querySelector('.iss-shadow');
    this.fix = null;
  }

  // `video` false shows the map only (e.g. broadcasts that shouldn't re-stream YouTube).
  enter(videoSetting, main, video = true) {
    const src = video ? youtubeEmbed(videoSetting) : 'about:blank';
    if (this.frame.dataset.src !== src) {
      this.frame.dataset.src = src;
      this.frame.src = src;
    }
    this.root.dataset.video = video ? 'on' : 'off';
    this.setMain(video ? main : 'map');
    clearInterval(this.timer);
    this.timer = setInterval(() => this.map.draw(this.fix), 250);
    this.map.draw(this.fix);
  }

  setMain(main) {
    this.root.dataset.main = main === 'map' ? 'map' : 'camera';
  }

  update(data, station) {
    this.fix = data.fix || null;
    const dark = !!data.fix && !station.isLit(data);
    this.shade.hidden = !dark;
    if (dark) {
      const t = data.terminator;
      this.shade.textContent = t?.minutes
        ? `In Earth’s shadow · orbital sunrise in ${Math.round(t.minutes)} min`
        : 'In Earth’s shadow';
    }
  }

  leave() {
    clearInterval(this.timer);
    this.frame.dataset.src = '';
    this.frame.src = 'about:blank';
  }
}

export class LaunchView {
  constructor(root) {
    this.root = root;
    this.el = Object.fromEntries([...root.querySelectorAll('[data-launch]')].map((e) => [e.dataset.launch, e]));
  }

  update(station, data, now) {
    const n = station.next(data, now);
    this.root.classList.toggle('empty', !n);
    if (!n) return;
    this.el.mission.textContent = n.mission;
    this.el.rocket.textContent = [n.rocket, n.provider].filter(Boolean).join(' · ');
    const clock = countdown(n.net - now);
    const [sign, ...rest] = clock.split(' ');
    this.el.sign.textContent = sign;
    this.el.clock.textContent = rest.join(' ');
    this.el.meta.textContent = [n.location, n.statusName || n.status].filter(Boolean).join(' · ');
    const bg = n.image ? `url("${n.image.replace(/"/g, '%22')}")` : '';
    if (this.el.bg.style.backgroundImage !== bg) this.el.bg.style.backgroundImage = bg;
    const later = (data.launches || []).filter((l) => l !== n && l.net > now).slice(0, 3);
    this.el.later.replaceChildren(
      ...later.map((l) => {
        const li = document.createElement('li');
        const when = document.createElement('span');
        const what = document.createElement('b');
        when.textContent = countdown(l.net - now).replace(/:\d\d$/, '');
        what.textContent = `${l.mission} · ${l.rocket}`;
        li.append(when, what);
        return li;
      }),
    );
  }
}

// Draws the actual output waveform of the music engine, like an oscilloscope.
export class Scope {
  constructor(canvas, source) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.source = source;
    this.buf = new Float32Array(1024);
    this.level = 0;
  }

  draw(active) {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = this.ctx;
    g.clearRect(0, 0, w, h);
    const wave = active ? this.source(this.buf) : null;
    const color = getComputedStyle(c).color;
    g.lineWidth = 1.25 * dpr;
    g.strokeStyle = color;
    g.beginPath();
    const mid = h / 2;
    let peak = 0;
    const points = 160;
    for (let i = 0; i <= points; i++) {
      const v = wave ? wave[Math.floor((i / points) * (wave.length - 1))] : 0;
      peak = Math.max(peak, Math.abs(v));
      // Fade the trace towards the edges so it reads as a signal, not a box.
      const edge = Math.sin((i / points) * Math.PI);
      const y = mid - v * h * 1.6 * edge;
      if (i === 0) g.moveTo(0, y);
      else g.lineTo((i / points) * w, y);
    }
    g.globalAlpha = wave ? 0.95 : 0.35;
    g.stroke();
    g.globalAlpha = 1;
    this.level = this.level * 0.8 + peak * 0.2;
  }
}
