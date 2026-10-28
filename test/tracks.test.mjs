import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playlistFor, positionAt } from '../js/tracks.js';

const track = (id, duration) => ({ id, title: id, file: `music/tracks/${id}.mp3`, duration });
const catalog = {
  tracks: [track('a', 300), track('b', 200), track('c', 100), { id: 'broken', file: null, duration: 0 }],
  stations: { iss: { day: ['a', 'b'], night: ['c', 'broken'] }, earth: { default: ['b'] }, sun: { quiet: ['c'] } },
};
catalog.byId = Object.fromEntries(catalog.tracks.map((t) => [t.id, t]));

test('playlists follow the mood, fall back to the default list, then to everything', () => {
  assert.deepEqual(playlistFor(catalog, 'iss', 'day').map((t) => t.id), ['a', 'b']);
  assert.deepEqual(playlistFor(catalog, 'iss', 'night').map((t) => t.id), ['c'], 'unplayable tracks are skipped');
  assert.deepEqual(playlistFor(catalog, 'earth', 'whatever').map((t) => t.id), ['b']);
  assert.deepEqual(playlistFor(catalog, 'sun', 'storm').map((t) => t.id), ['c']);
  assert.deepEqual(playlistFor(catalog, 'mars', 'day'), []);
  assert.deepEqual(playlistFor(null, 'iss', 'day'), []);
});

test('everyone on a station hears the same track at the same second', () => {
  const list = playlistFor(catalog, 'iss', 'day');
  const wall = 1_793_200_000.25;
  const a = positionAt(list, wall, 'iss:day');
  const b = positionAt(list, wall, 'iss:day');
  assert.deepEqual(a, b);
  // A minute later, the same track has moved on by a minute (or the next one started).
  const later = positionAt(list, wall + 60, 'iss:day');
  if (later.track.id === a.track.id) assert.ok(Math.abs(later.offset - a.offset - 60) < 1e-6);
  else assert.equal(later.offset, a.offset + 60 - a.track.duration);
});

test('the schedule loops through the whole playlist and covers every track', () => {
  const list = playlistFor(catalog, 'iss', 'day');
  const seen = new Set();
  for (let t = 0; t < 500; t += 5) {
    const p = positionAt(list, 1e9 + t, 'iss:day');
    assert.ok(p.offset >= 0 && p.offset < p.track.duration);
    assert.ok(Math.abs(p.remaining - (p.track.duration - p.offset)) < 1e-6);
    seen.add(p.track.id);
  }
  assert.deepEqual([...seen].sort(), ['a', 'b']);
});

test('different stations are offset from each other', () => {
  const list = playlistFor(catalog, 'iss', 'day');
  const x = positionAt(list, 1e9, 'iss:day');
  const y = positionAt(list, 1e9, 'earth:default');
  assert.ok(x.offset !== y.offset || x.track.id !== y.track.id);
});
