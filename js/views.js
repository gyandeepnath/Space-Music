// Visual layers: a starfield that is always there, a crossfading slideshow
// for image stations, the ISS camera + map, and the launch countdown.

import { countdown } from './stations.js';

const NASA_YOUTUBE_CHANNEL = 'UCLA_DiR1FfKNvjuUpBHmylQ';

export class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.stars = Array.from({ length: 420 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() ** 3 * 1.6 + 0.25,
      tw: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random(),
    }));
    this.last = 0;
    const loop = (t) => {
      if (!document.hidden && t - this.last > 40) {
        this.last = t;
        this.draw(t / 1000);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  draw(t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(innerWidth * dpr);
    const h = Math.round(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const g = this.ctx;
    g.clearRect(0, 0, w, h);
    const drift = t * 0.004;
    for (const s of this.stars) {
      const x = ((s.x + drift * s.speed * 0.2) % 1) * w;
      const a = 0.45 + 0.55 * Math.sin(t * s.speed + s.tw) ** 2;
      g.globalAlpha = a;
      g.fillStyle = s.r > 1.2 ? '#ffe9c4' : '#cfe3ff';
      g.beginPath();
      g.arc(x, s.y * h, s.r * dpr, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

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
  }

  show({ items, fit, interval }, { onSlide, onFail } = {}) {
    const key = items.map((i) => i.src).join('|');
    this.onSlide = onSlide;
    this.onFail = onFail;
    if (key === this.key) return;
    this.key = key;
    this.items = items;
    this.interval = interval;
    this.failures = 0;
    this.root.dataset.fit = fit;
    this.index = -1;
    if (items.length) this.next();
  }

  current() {
    return this.items[this.index] || null;
  }

  next() {
    clearTimeout(this.timer);
    if (!this.items.length) return;
    this.index = (this.index + 1) % this.items.length;
    const item = this.items[this.index];
    const img = this.layers[1 - this.active];
    const token = ++this.token;
    let triedFallback = false;
    img.onload = () => {
      if (token !== this.token) return;
      this.failures = 0;
      this.layers[this.active].classList.remove('on');
      img.classList.add('on');
      this.active = 1 - this.active;
      this.caption.textContent = item.caption || '';
      this.onSlide?.(item);
      this.timer = setTimeout(() => this.next(), this.interval);
    };
    img.onerror = () => {
      if (token !== this.token) return;
      if (item.fallback && !triedFallback) {
        triedFallback = true;
        img.src = item.fallback;
        return;
      }
      this.failures++;
      if (this.failures >= this.items.length) {
        this.onFail?.();
        this.timer = setTimeout(() => {
          this.failures = 0;
          this.next();
        }, 60e3);
        return;
      }
      this.timer = setTimeout(() => this.next(), 250);
    };
    img.alt = item.caption || '';
    img.src = item.src;
  }

  stop() {
    clearTimeout(this.timer);
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

  enter(videoSetting, main) {
    const src = youtubeEmbed(videoSetting);
    if (this.frame.dataset.src !== src) {
      this.frame.dataset.src = src;
      this.frame.src = src;
    }
    this.setMain(main);
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
        ? `ISS is in Earth’s shadow · orbital sunrise in ${Math.round(t.minutes)} min`
        : 'ISS is in Earth’s shadow';
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
    this.el = Object.fromEntries(
      [...root.querySelectorAll('[data-launch]')].map((e) => [e.dataset.launch, e]),
    );
  }

  update(station, data, now) {
    const n = station.next(data, now);
    this.root.classList.toggle('empty', !n);
    if (!n) return;
    this.el.mission.textContent = n.mission;
    this.el.rocket.textContent = [n.rocket, n.provider].filter(Boolean).join(' · ');
    this.el.clock.textContent = countdown(n.net - now);
    this.el.meta.textContent = [n.location, n.statusName || n.status].filter(Boolean).join(' · ');
    const bg = n.image ? `url("${n.image.replace(/"/g, '%22')}")` : '';
    if (this.el.bg.style.backgroundImage !== bg) this.el.bg.style.backgroundImage = bg;
    const later = (data.launches || []).filter((l) => l !== n && l.net > now).slice(0, 4);
    this.el.later.replaceChildren(
      ...later.map((l) => {
        const li = document.createElement('li');
        li.innerHTML = `<span></span><b></b>`;
        li.firstChild.textContent = countdown(l.net - now).replace(/:\d\d$/, '');
        li.lastChild.textContent = `${l.mission} · ${l.rocket}`;
        return li;
      }),
    );
  }
}
