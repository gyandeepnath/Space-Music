import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subsolarPoint,
  issOrbitFrom,
  isInEarthShadow,
  nextOrbitalTerminator,
  perseveranceClock,
  earthMarsDistance,
  normLon,
  roughOceanName,
  ISS_PERIOD_S,
} from '../js/astro.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: expected ${expected} ± ${tol}, got ${actual}`);

test('normLon wraps into [-180, 180)', () => {
  assert.equal(normLon(190), -170);
  assert.equal(normLon(-190), 170);
  assert.equal(normLon(540), -180);
  assert.equal(normLon(45), 45);
});

test('subsolar point sits on the equator at the March equinox and the tropic in June', () => {
  const equinox = subsolarPoint(Date.UTC(2026, 2, 20, 14, 46));
  near(equinox.lat, 0, 0.1, 'equinox latitude');
  // 14:46 UTC puts the Sun roughly over 40°W (plus the equation of time).
  near(equinox.lon, -41.5 + 1.9, 1.5, 'equinox longitude');

  const solstice = subsolarPoint(Date.UTC(2026, 5, 21, 12, 0));
  near(solstice.lat, 23.44, 0.1, 'June solstice latitude');
  near(solstice.lon, 0, 1.5, 'noon UTC longitude');
});

test('ISS orbit model returns to the fix after one period (less Earth rotation)', () => {
  const fix = { lat: 20, lon: 30, ascending: true };
  const at = issOrbitFrom(fix);
  const now = at(0);
  near(now.lat, 20, 1e-9, 'latitude at fix');
  near(now.lon, 30, 1e-9, 'longitude at fix');
  const later = at(ISS_PERIOD_S);
  near(later.lat, 20, 1e-6, 'latitude one orbit later');
  // The Earth turns ~23.3° under the station each orbit.
  near(normLon(30 - later.lon), 23.3, 0.3, 'westward shift per orbit');
  // Never exceeds the orbital inclination.
  for (let t = 0; t < ISS_PERIOD_S; t += 60) assert.ok(Math.abs(at(t).lat) <= 51.65);
});

test('ascending and descending fixes head in opposite latitude directions', () => {
  const up = issOrbitFrom({ lat: 10, lon: 0, ascending: true });
  const down = issOrbitFrom({ lat: 10, lon: 0, ascending: false });
  assert.ok(up(60).lat > 10);
  assert.ok(down(60).lat < 10);
});

test('Earth shadow: sub-solar point is lit, anti-solar point at ISS altitude is dark', () => {
  const sun = { lat: 0, lon: 0 };
  assert.equal(isInEarthShadow(0, 0, 420, sun), false);
  assert.equal(isInEarthShadow(0, 180, 420, sun), true);
  // Just past the terminator the station is still in sunlight thanks to its altitude.
  assert.equal(isInEarthShadow(0, 100, 420, sun), false);
});

test('ISS sees an orbital sunrise or sunset within one orbit', () => {
  const now = Date.UTC(2026, 9, 28, 12, 0);
  const result = nextOrbitalTerminator({ lat: 0, lon: 0, alt: 420, ascending: true, time: now }, now);
  assert.ok(result.minutes > 0 && result.minutes < ISS_PERIOD_S / 60);
  assert.ok(['sunrise', 'sunset'].includes(result.event));
});

test('Perseverance clock matches the landing (sol 0, 15:53 LMST) and sol 1000', () => {
  const landing = perseveranceClock(Date.UTC(2021, 1, 18, 20, 44));
  assert.equal(landing.sol, 0);
  near(landing.hours, 15.88, 0.1, 'landing LMST');
  assert.equal(perseveranceClock(Date.UTC(2023, 11, 13, 0, 0)).sol, 1000);
});

test('Earth–Mars distance matches the Jan 2025 close approach and stays physical', () => {
  const close = earthMarsDistance(Date.UTC(2025, 0, 12));
  near(close.au, 0.642, 0.01, 'close approach distance (AU)');
  const d = earthMarsDistance(Date.UTC(2026, 9, 28));
  assert.ok(d.au > 0.37 && d.au < 2.68);
  near(close.lightSeconds, (0.642 * 149597870.7) / 299792.458, 6, 'light time');
});

test('rough ocean names', () => {
  assert.equal(roughOceanName(0, -150), 'the Pacific Ocean');
  assert.equal(roughOceanName(30, -40), 'the Atlantic Ocean');
  assert.equal(roughOceanName(-20, 75), 'the Indian Ocean');
  assert.equal(roughOceanName(36, 18), 'the Mediterranean');
  assert.equal(roughOceanName(42, 50.5), 'the Caspian Sea');
  assert.equal(roughOceanName(43, 34), 'the Black Sea');
  // Inland, with no country reported: don't guess.
  assert.equal(roughOceanName(45, 70), null);
});
