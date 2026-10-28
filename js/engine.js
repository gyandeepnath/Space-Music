// Generative ambient engine (Web Audio, no samples, no libraries).
//
// A station supplies a *mood* (key, scale, tempo, timbres) and a stream of
// normalised *modulators* derived from live data. The engine turns those into
// slow pads, a sub bass, plucked "star" notes on a random walk, filtered
// noise "wind" and telemetry blips. Station changes cross through radio static.

export const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteToMidi(name, octave) {
  return 12 * (octave + 1) + NOTE_NAMES.indexOf(name);
}

export function midiToHz(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// --- Composition as a pure function of the clock -------------------------------
//
// Chords and notes sit on a grid of eighth notes counted from the Unix epoch,
// and every random choice is seeded by (station, grid slot). Anyone tuned to
// the same station computes the same music for the same moment, so a friend
// who opens your link hears the chord you're hearing, with no server involved.

export const MOVES = [-2, -1, -1, 1, 1, 2, 0, 3, -3];

export function slotRandom(seed, slot, lane) {
  return mulberry32(hashString(`${seed}:${lane}:${slot}`));
}

export function chordPlan(seed, chord) {
  const r = slotRandom(seed, chord, 'ch');
  return { seventh: r(), ninth: r() };
}

export function stepPlan(seed, step) {
  const r = slotRandom(seed, step, 'st');
  return {
    trigger: r(),
    octave: r(),
    color: r(),
    colorPick: r(),
    level: r(),
    decay: r(),
    pan: r(),
    blip: r(),
    blipNote: r(),
    blipDouble: r(),
  };
}

function walkMove(seed, step, deg, base) {
  const move = MOVES[Math.floor(slotRandom(seed, step, 'mv')() * MOVES.length)];
  return Math.max(base, Math.min(base + 11, deg + move));
}

// The melody restarts each chord from a seeded degree, then takes one seeded
// move every eighth note (sounding or not), so it can be computed for any step.
export function melodyDegree(seed, step, stepsPerChord, base) {
  const chord = Math.floor(step / stepsPerChord);
  let deg = base + 3 + Math.floor(slotRandom(seed, chord, 'm0')() * 5);
  for (let j = chord * stepsPerChord; j <= step; j++) deg = walkMove(seed, j, deg, base);
  return deg;
}

const DEFAULT_MOOD = {
  root: 'D',
  scale: 'lydian',
  bpm: 64,
  chordBeats: 16,
  progression: [0, 4, 5, 3],
  padWave: 'sawtooth',
  pluckWave: 'sine',
  density: 0.35,
  wind: 0.3,
  reverb: 0.6,
  seed: null,
};

const DEFAULT_MOD = { brightness: 0.5, energy: 0.5, tension: 0, wind: 0.3, pulse: 0.2, scale: null, degree: null };

export class MusicEngine {
  constructor() {
    this.ctx = null;
    this.mood = { ...DEFAULT_MOOD };
    this.mod = { ...DEFAULT_MOD };
    this.seed = 0;
    this.playing = false;
    this.voices = new Set();
    this.timer = null;
    this.walk = null;
    this.wallOffset = 0;
    this.holdUntil = 0;
    this.currentChord = null;
  }

  get running() {
    return this.playing && this.ctx?.state === 'running';
  }

  // Create and wake the audio graph without starting the music (the static
  // effect is still available, e.g. while SomaFM is playing). Must run inside
  // a user gesture the first time. `element` (optional) is an <audio> element
  // to play the mix through, which lets the OS treat the page as a media
  // player (lock screen, Bluetooth and car head-unit controls).
  async prepare(element) {
    this.wakeToken = (this.wakeToken || 0) + 1; // cancels a pending suspend()
    if (!this.ctx) this.build(element);
    if (this.ctx.state !== 'running') await this.ctx.resume();
    if (this.element?.paused) {
      try {
        await this.element.play();
      } catch {
        this.useDirectOutput();
      }
    }
  }

  async start(element) {
    await this.prepare(element);
    if (this.playing) return;
    this.playing = true;
    this.cue(0.1);
    this.applyContinuous(true);
    this.ramp(this.fade.gain, 1, 2.5);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 100);
  }

  // Fade the music out; the graph stays up for static and a quick restart.
  stop() {
    if (!this.ctx) return;
    this.playing = false;
    this.ramp(this.fade.gain, 0, 0.6);
    this.releaseVoices(0.6);
    this.ramp(this.staticGain.gain, 0, 0.1);
  }

  // Power off: stop everything and let the device sleep.
  suspend() {
    this.stop();
    const token = this.wakeToken;
    setTimeout(() => {
      if (token !== this.wakeToken || !this.ctx) return;
      this.ctx.suspend();
      this.element?.pause();
    }, 800);
  }

  build(element) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    this.ctx = ctx;

    this.out = ctx.createGain();
    this.out.gain.value = 0.8;
    this.duckGain = ctx.createGain();
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.05;
    comp.release.value = 0.4;

    this.bus = ctx.createGain();
    this.dry = ctx.createGain();
    this.dry.gain.value = 0.75;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.6;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(5.5, 2.4);

    this.bus.connect(this.dry).connect(comp);
    this.bus.connect(reverb).connect(this.wet).connect(comp);
    // Trim subsonic rumble the sawtooth pads and noise would otherwise add.
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'highpass';
    rumble.frequency.value = 32;
    comp.connect(rumble).connect(this.fade).connect(this.duckGain).connect(this.out);
    this.out.connect(this.analyser);

    // Pads run through one lowpass with a very slow LFO on the cutoff.
    this.padBus = ctx.createGain();
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.Q.value = 0.8;
    this.padFilter.frequency.value = 900;
    this.padBus.connect(this.padFilter).connect(this.bus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.035;
    this.lfoDepth = ctx.createGain();
    this.lfoDepth.gain.value = 300;
    lfo.connect(this.lfoDepth).connect(this.padFilter.frequency);
    lfo.start();

    // Plucks get a filtered feedback delay before joining the bus.
    this.pluckBus = ctx.createGain();
    this.delay = ctx.createDelay(3);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 2400;
    this.pluckBus.connect(this.bus);
    this.pluckBus.connect(this.delay).connect(delayTone).connect(feedback).connect(this.delay);
    delayTone.connect(this.bus);

    // Wind: looping noise through a wandering band-pass.
    this.noise = this.noiseBuffer(3);
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 3;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.bus);
    wind.start();

    // Radio static for tuning between stations; bypasses the music fade.
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    this.staticFilter = ctx.createBiquadFilter();
    this.staticFilter.type = 'bandpass';
    this.staticFilter.frequency.value = 1800;
    this.staticFilter.Q.value = 0.6;
    this.staticGain = ctx.createGain();
    this.staticGain.gain.value = 0;
    hiss.connect(this.staticFilter).connect(this.staticGain).connect(this.duckGain);
    hiss.start();

    if (element && 'srcObject' in element && ctx.createMediaStreamDestination) {
      const dest = ctx.createMediaStreamDestination();
      this.out.connect(dest);
      element.srcObject = dest.stream;
      this.element = element;
    } else {
      this.out.connect(ctx.destination);
    }
  }

  useDirectOutput() {
    if (!this.element) return;
    this.element.srcObject = null;
    this.element = null;
    this.out.connect(this.ctx.destination);
  }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** decay;
    }
    return buf;
  }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  ramp(param, value, seconds) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.setTargetAtTime(value, now, Math.max(0.01, seconds / 3));
  }

  setVolume(v) {
    if (this.out) this.ramp(this.out.gain, v, 0.2);
  }

  duck(on) {
    if (this.duckGain) this.ramp(this.duckGain.gain, on ? 0.28 : 1, on ? 0.4 : 1.5);
  }

  // Continuous static level while the dial is between stations (0..1).
  setStatic(level) {
    if (!this.ctx) return;
    this.ramp(this.staticGain.gain, level * 0.22, 0.08);
    this.ramp(this.staticFilter.frequency, 900 + level * 2500, 0.2);
  }

  staticBurst(seconds = 1.1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const g = this.staticGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.2, now + 0.08);
    g.setValueAtTime(0.2, now + seconds * 0.6);
    g.linearRampToValueAtTime(0, now + seconds);
    const f = this.staticFilter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(3200, now);
    f.exponentialRampToValueAtTime(700, now + seconds);
    // A faint heterodyne whistle, like an AM dial.
    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.frequency.setValueAtTime(1900, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + seconds * 0.8);
    og.gain.setValueAtTime(0, now);
    og.gain.linearRampToValueAtTime(0.025, now + 0.15);
    og.gain.linearRampToValueAtTime(0, now + seconds * 0.8);
    osc.connect(og).connect(this.duckGain);
    osc.start(now);
    osc.stop(now + seconds);
  }

  // Switch to a station's mood, crossing through static. `mood.id` names the
  // station; it seeds the composition so every listener gets the same piece.
  setMood(mood, mod = {}) {
    this.mood = { ...DEFAULT_MOOD, ...mood };
    this.mod = { ...DEFAULT_MOD, ...mod };
    this.seed = hashString(`${this.mood.id ?? 'station'}:${this.mood.seed ?? ''}`);
    this.walk = null;
    if (!this.ctx || !this.playing) return;
    this.staticBurst();
    this.releaseVoices(0.5);
    const now = this.ctx.currentTime;
    const f = this.fade.gain;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.linearRampToValueAtTime(0, now + 0.4);
    f.setValueAtTime(0, now + 0.8);
    f.linearRampToValueAtTime(1, now + 3.5);
    this.cue(0.8);
    this.applyContinuous(true);
  }

  // Live-data modulators, all 0..1 (plus optional scale / chord degree overrides).
  setData(mod) {
    Object.assign(this.mod, mod);
    if (this.running) this.applyContinuous(false);
  }

  get bpm() {
    return this.mood.bpm;
  }

  get stepSec() {
    return 30 / this.mood.bpm; // eighth notes
  }

  get stepsPerChord() {
    return this.mood.chordBeats * 2;
  }

  get scale() {
    return SCALES[this.mod.scale || this.mood.scale] || SCALES.lydian;
  }

  rootMidi() {
    return noteToMidi(this.mood.root, 3);
  }

  scaleNote(degree) {
    const s = this.scale;
    const oct = Math.floor(degree / s.length);
    const idx = ((degree % s.length) + s.length) % s.length;
    return this.rootMidi() + s[idx] + 12 * oct;
  }

  chordDegree(chord) {
    const p = this.mood.progression;
    return this.mod.degree ?? p[((chord % p.length) + p.length) % p.length];
  }

  // Map wall-clock seconds onto the audio clock, using the moment samples
  // actually leave the speakers when the browser can tell us.
  syncClock() {
    const ts = this.ctx.getOutputTimestamp?.();
    this.wallOffset =
      ts && ts.performanceTime > 0 && ts.contextTime > 0
        ? (performance.timeOrigin + ts.performanceTime) / 1000 - ts.contextTime
        : Date.now() / 1000 - this.ctx.currentTime;
  }

  // Line the scheduler up with the wall-clock grid, starting `delay` s from now.
  // A listener arriving mid-chord joins that chord rather than waiting for the next.
  cue(delay) {
    this.syncClock();
    const startWall = this.ctx.currentTime + this.wallOffset + delay;
    this.holdUntil = startWall;
    this.nextStep = Math.ceil(startWall / this.stepSec);
    this.nextChord = Math.floor(this.nextStep / this.stepsPerChord);
    this.walk = null;
  }

  applyContinuous(immediate) {
    const t = immediate ? 0.5 : 4;
    const b = this.mod.brightness;
    const cutoff = 260 + 2600 * b ** 1.5;
    this.ramp(this.padFilter.frequency, cutoff, t);
    this.ramp(this.lfoDepth.gain, cutoff * 0.45, t);
    this.ramp(this.windGain.gain, 0.015 + 0.2 * this.mood.wind * (0.4 + this.mod.wind), t);
    this.ramp(this.wet.gain, 0.35 + 0.5 * this.mood.reverb, t);
    this.delay.delayTime.setTargetAtTime((0.75 * 60) / this.bpm, this.ctx.currentTime, 1);
  }

  tick() {
    if (!this.running) return;
    this.syncClock();
    const nowWall = this.ctx.currentTime + this.wallOffset;
    const aheadWall = nowWall + 0.35;
    const step = this.stepSec;
    const chordSec = step * this.stepsPerChord;
    while (this.nextChord * chordSec < aheadWall) {
      const c = this.nextChord++;
      const startWall = Math.max(c * chordSec, this.holdUntil, nowWall);
      const endWall = (c + 1) * chordSec;
      this.playChord(c, startWall - this.wallOffset, endWall - this.wallOffset, chordSec);
    }
    while (this.nextStep * step < aheadWall) {
      const k = this.nextStep++;
      const wall = k * step;
      // Skip notes we're already late for (e.g. after the tab was throttled).
      if (wall >= nowWall - 0.02) this.playStep(k, wall - this.wallOffset);
    }
    // Let the wind wander.
    if (Math.random() < 0.05) {
      const f = 180 + Math.random() * (500 + 1400 * this.mod.wind);
      this.windFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 2.5);
      this.windFilter.Q.setTargetAtTime(1.5 + Math.random() * 6, this.ctx.currentTime, 2.5);
    }
  }

  track(nodes, gain, end) {
    const voice = { nodes, gain };
    this.voices.add(voice);
    nodes[0].onended = () => this.voices.delete(voice);
    for (const n of nodes) n.stop(end);
  }

  releaseVoices(seconds) {
    const now = this.ctx.currentTime;
    for (const v of this.voices) {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.setTargetAtTime(0, now, seconds / 4);
      for (const n of v.nodes) {
        try {
          n.stop(now + seconds + 0.1);
        } catch {
          /* already stopped */
        }
      }
    }
  }

  // Chord `c` sounds from t0 (its slot start, or later when joining) to t1.
  playChord(c, t0, t1, len) {
    const degree = this.chordDegree(c);
    this.currentChord = { index: c, degree };
    const plan = chordPlan(this.seed, c);
    const degrees = [degree, degree + 2, degree + 4];
    if (plan.seventh < 0.45 + 0.4 * this.mod.tension) degrees.push(degree + 6);
    if (this.mod.brightness > 0.6 && plan.ninth < 0.4) degrees.push(degree + 8);

    const detune = 5 + 14 * this.mod.tension;
    for (const d of degrees) {
      let midi = this.scaleNote(d);
      while (midi > 70) midi -= 12;
      this.padVoice(midiToHz(midi), t0, t1, len, this.mood.padWave, detune, 0.045);
    }
    this.padVoice(midiToHz(this.scaleNote(degree) - 12), t0, t1, len, 'sine', 0, 0.13);
  }

  padVoice(freq, t0, t1, len, wave, detune, level) {
    const releaseStart = t1 - len * 0.15;
    if (releaseStart - t0 < 0.4) return; // too late to join this chord; the next is close
    const ctx = this.ctx;
    const g = ctx.createGain();
    const attack = Math.min(len * 0.35, (releaseStart - t0) * 0.8);
    const end = t1 + len * 0.55; // overlaps the next chord's swell
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(level, t0 + attack);
    g.gain.setValueAtTime(level, releaseStart);
    g.gain.linearRampToValueAtTime(0, end);
    g.connect(this.padBus);
    const oscs = (detune ? [-detune, detune] : [0]).map((cents) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(g);
      o.start(t0);
      return o;
    });
    this.track(oscs, g, end);
  }

  melodyAt(k) {
    const spc = this.stepsPerChord;
    const c = Math.floor(k / spc);
    const base = this.chordDegree(c);
    const w = this.walk;
    const deg =
      w && w.k === k - 1 && w.c === c && w.base === base
        ? walkMove(this.seed, k, w.deg, base)
        : melodyDegree(this.seed, k, spc, base);
    this.walk = { k, c, base, deg };
    return deg;
  }

  playStep(k, t) {
    const { density, pluckWave } = this.mood;
    const { energy, tension, brightness, pulse } = this.mod;
    const p = stepPlan(this.seed, k);
    const strong = k % 4 === 0 ? 1 : k % 2 === 0 ? 0.7 : 0.45;
    const deg = this.melodyAt(k);
    if (p.trigger < density * (0.45 + energy) * strong) {
      let midi = this.scaleNote(deg) + 12;
      if (brightness > 0.55 && p.octave < 0.25) midi += 12;
      // Under tension, sometimes reach for a note outside the scale.
      if (p.color < tension * 0.25) midi += p.colorPick < 0.5 ? 1 : 6;
      this.pluck(midiToHz(midi), t, pluckWave, 0.11 + 0.05 * p.level, 1.4 + 2.6 * p.decay, p.pan * 1.4 - 0.7);
    }
    if (p.blip < pulse * 0.18) {
      const midi = this.scaleNote(14 + Math.floor(p.blipNote * 5)) + 12;
      this.blip(midiToHz(midi), t);
      if (p.blipDouble < 0.4) this.blip(midiToHz(midi), t + 0.12);
    }
  }

  pluck(freq, t, wave, level, decay, panPos) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = panPos;
      g.connect(pan).connect(this.pluckBus);
    } else {
      g.connect(this.pluckBus);
    }
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const bell = ctx.createOscillator();
    bell.frequency.value = freq * 2.76; // inharmonic partial, a little glassy
    const bellGain = ctx.createGain();
    bellGain.gain.value = 0.12;
    o.connect(g);
    bell.connect(bellGain).connect(g);
    o.start(t);
    bell.start(t);
    this.track([o, bell], g, t + decay + 0.05);
  }

  blip(freq, t) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.022, t + 0.004);
    g.gain.setValueAtTime(0.022, t + 0.045);
    g.gain.linearRampToValueAtTime(0, t + 0.06);
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    o.connect(hp).connect(g).connect(this.pluckBus);
    o.start(t);
    this.track([o], g, t + 0.08);
  }

  // RMS output level, 0..~1.
  level() {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    return Math.sqrt(sum / buf.length);
  }

  // Current output waveform (for the oscilloscope), or null before audio starts.
  waveform(into) {
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(into);
    return into;
  }
}
