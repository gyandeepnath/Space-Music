// Equirectangular world map for the ISS station: coastlines, a live day/night
// terminator, the predicted ground track and the station's horizon footprint.

import { subsolarPoint, issOrbitFrom, ISS_PERIOD_S } from './astro.js';

const COLORS = {
  ocean: '#06101f',
  land: '#16304a',
  coast: '#3d6b8f',
  grid: 'rgba(120, 170, 220, 0.09)',
  night: 'rgba(0, 3, 12, 0.55)',
  past: 'rgba(255, 179, 71, 0.35)',
  future: 'rgba(255, 179, 71, 0.9)',
  iss: '#ffd38a',
};

const HORIZON_DEG = 20.4; // ground radius visible from ~420 km

export class WorldMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rings = null;
    this.base = null;
    fetch('data/land.json')
      .then((r) => r.json())
      .then((d) => {
        this.rings = d.rings;
        this.base = null;
      })
      .catch(() => {
        /* graticule-only map */
      });
    new ResizeObserver(() => (this.base = null)).observe(canvas);
  }

  size() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.base = null;
    }
    return { w, h, dpr };
  }

  // Fit a 2:1 map inside the canvas, centred.
  frame(w, h) {
    const mw = Math.min(w, h * 2);
    const mh = mw / 2;
    return { x0: (w - mw) / 2, y0: (h - mh) / 2, mw, mh };
  }

  xy(lat, lon, f) {
    return [f.x0 + ((lon + 180) / 360) * f.mw, f.y0 + ((90 - lat) / 180) * f.mh];
  }

  renderBase(w, h, f) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = COLORS.ocean;
    g.fillRect(f.x0, f.y0, f.mw, f.mh);
    g.strokeStyle = COLORS.grid;
    g.lineWidth = 1;
    g.beginPath();
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = this.xy(0, lon, f);
      g.moveTo(x, f.y0);
      g.lineTo(x, f.y0 + f.mh);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const [, y] = this.xy(lat, 0, f);
      g.moveTo(f.x0, y);
      g.lineTo(f.x0 + f.mw, y);
    }
    g.stroke();
    if (this.rings) {
      g.save();
      g.beginPath();
      g.rect(f.x0, f.y0, f.mw, f.mh);
      g.clip();
      g.fillStyle = COLORS.land;
      g.strokeStyle = COLORS.coast;
      g.lineWidth = Math.max(0.6, f.mw / 1400);
      // Rings are unwrapped across the antimeridian; draw each one shifted by
      // ±360° as well so the wrapped parts land on the map.
      for (const shift of [-360, 0, 360]) {
        g.beginPath();
        for (const r of this.rings) {
          for (let i = 0; i < r.length; i += 2) {
            const [x, y] = this.xy(r[i + 1], r[i] + shift, f);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.closePath();
        }
        g.fill();
        g.stroke();
      }
      g.restore();
    }
    this.base = c;
  }

  drawNight(g, f, now) {
    const sun = subsolarPoint(now);
    const tanDec = Math.tan((Math.abs(sun.lat) < 0.1 ? 0.1 : sun.lat) * (Math.PI / 180));
    g.fillStyle = COLORS.night;
    g.beginPath();
    for (let lon = -180; lon <= 180; lon += 2) {
      const lat = (Math.atan(-Math.cos((lon - sun.lon) * (Math.PI / 180)) / tanDec) * 180) / Math.PI;
      const [x, y] = this.xy(lat, lon, f);
      if (lon === -180) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    // Night wraps the pole that is tilted away from the Sun.
    const pole = sun.lat > 0 ? -90 : 90;
    g.lineTo(...this.xy(pole, 180, f));
    g.lineTo(...this.xy(pole, -180, f));
    g.closePath();
    g.fill();
  }

  polyline(g, f, points) {
    g.beginPath();
    let prev = null;
    for (const p of points) {
      const [x, y] = this.xy(p.lat, p.lon, f);
      if (!prev || Math.abs(p.lon - prev.lon) > 180) g.moveTo(x, y);
      else g.lineTo(x, y);
      prev = p;
    }
    g.stroke();
  }

  draw(fix, now = Date.now()) {
    const { w, h, dpr } = this.size();
    const f = this.frame(w, h);
    if (!this.base) this.renderBase(w, h, f);
    const g = this.ctx;
    g.clearRect(0, 0, w, h);
    g.drawImage(this.base, 0, 0);
    this.drawNight(g, f, now);
    if (!fix) return;

    let pos = { lat: fix.lat, lon: fix.lon };
    if (fix.directionKnown) {
      const at = issOrbitFrom(fix);
      const dt0 = (now - fix.time) / 1000;
      pos = at(dt0);
      const past = [];
      const future = [];
      for (let s = -ISS_PERIOD_S / 2; s <= 0; s += 30) past.push(at(dt0 + s));
      for (let s = 0; s <= ISS_PERIOD_S; s += 30) future.push(at(dt0 + s));
      g.lineWidth = 1.5 * dpr;
      g.setLineDash([4 * dpr, 4 * dpr]);
      g.strokeStyle = COLORS.past;
      this.polyline(g, f, past);
      g.setLineDash([]);
      g.strokeStyle = COLORS.future;
      this.polyline(g, f, future);
    }

    // Horizon footprint (an ellipse is a fine approximation in this projection).
    const [x, y] = this.xy(pos.lat, pos.lon, f);
    const ry = (HORIZON_DEG / 180) * f.mh;
    const rx = (HORIZON_DEG / Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180)) / 360) * f.mw;
    g.strokeStyle = 'rgba(255, 211, 138, 0.35)';
    g.fillStyle = 'rgba(255, 211, 138, 0.06)';
    g.lineWidth = dpr;
    for (const shift of [-f.mw, 0, f.mw]) {
      g.beginPath();
      g.ellipse(x + shift, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }

    const glow = g.createRadialGradient(x, y, 0, x, y, 18 * dpr);
    glow.addColorStop(0, 'rgba(255, 211, 138, 0.9)');
    glow.addColorStop(1, 'rgba(255, 211, 138, 0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y, 18 * dpr, 0, Math.PI * 2);
    g.fill();
    // Tiny ISS glyph: truss and solar arrays.
    g.fillStyle = COLORS.iss;
    g.fillRect(x - 9 * dpr, y - 1 * dpr, 18 * dpr, 2 * dpr);
    g.fillRect(x - 9 * dpr, y - 5 * dpr, 4 * dpr, 10 * dpr);
    g.fillRect(x + 5 * dpr, y - 5 * dpr, 4 * dpr, 10 * dpr);
    g.fillRect(x - 1.5 * dpr, y - 3 * dpr, 3 * dpr, 6 * dpr);
  }
}
