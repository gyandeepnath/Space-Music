import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MusicEngine, stepPlan, chordPlan, melodyDegree } from '../js/engine.js';

const mood = { id: 'iss', root: 'D', scale: 'lydian', bpm: 66, chordBeats: 16, progression: [0, 4, 5, 3] };

function listener() {
  const e = new MusicEngine();
  e.setMood(mood); // no audio context in Node: this only sets up the composition
  return e;
}

test('a listener who joins mid-chord hears the same melody as one who was already there', () => {
  const spc = mood.chordBeats * 2;
  const chord = 123456789; // somewhere in 2026, in chord slots since the epoch
  const first = chord * spc;

  const longTime = listener();
  const sequential = [];
  for (let k = first; k < first + spc; k++) sequential.push(longTime.melodyAt(k));

  for (const joinAt of [first + 1, first + 9, first + spc - 1]) {
    const newcomer = listener();
    const joined = [];
    for (let k = joinAt; k < first + spc; k++) joined.push(newcomer.melodyAt(k));
    assert.deepEqual(joined, sequential.slice(joinAt - first), `joined at step ${joinAt - first}`);
  }
});

test('every random choice is a function of (station, slot) only', () => {
  assert.deepEqual(stepPlan(42, 1e9), stepPlan(42, 1e9));
  assert.deepEqual(chordPlan(42, 7), chordPlan(42, 7));
  assert.notDeepEqual(stepPlan(42, 1e9), stepPlan(43, 1e9));
  assert.notDeepEqual(stepPlan(42, 1e9), stepPlan(42, 1e9 + 1));
});

test('stations get different pieces, and the melody stays in range of its chord', () => {
  const a = listener();
  const b = new MusicEngine();
  b.setMood({ ...mood, id: 'sun' });
  assert.notEqual(a.seed, b.seed);
  for (let k = 5000; k < 5200; k++) {
    const base = a.chordDegree(Math.floor(k / 32));
    const d = melodyDegree(a.seed, k, 32, base);
    assert.ok(d >= base && d <= base + 11);
  }
});

test('the chord progression is read off the wall-clock grid', () => {
  const e = listener();
  assert.equal(e.chordDegree(0), 0);
  assert.equal(e.chordDegree(1), 4);
  assert.equal(e.chordDegree(6), 5);
  e.setData({ degree: 2 }); // Blue Marble overrides it with Earth's longitude
  assert.equal(e.chordDegree(6), 2);
});
