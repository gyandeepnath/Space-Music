// Small, dependency-free astronomy helpers. Everything here is computed locally,
// so the app can keep the map, the ISS marker and the Mars clock moving even when
// a network source drops out.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const EARTH_RADIUS_KM = 6371;
export const AU_KM = 149597870.7;
export const LIGHT_KM_S = 299792.458;

export const ISS_INCLINATION_DEG = 51.64;
export const ISS_PERIOD_S = 92.9 * 60;
const EARTH_ROTATION_RAD_S = (2 * Math.PI) / 86164.0905; // sidereal day

const TT_MINUS_UTC_S = 69.184; // 37 leap seconds + 32.184 s

export function julianDate(ms) {
  return ms / 86400000 + 2440587.5;
}

export function normLon(lon) {
  let x = (lon + 180) % 360;
  if (x < 0) x += 360;
  return x - 180;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Point on Earth where the Sun is directly overhead (low-precision Almanac formula,
// good to a fraction of a degree, which is plenty for a day/night terminator).
export function subsolarPoint(ms) {
  const n = julianDate(ms) - 2451545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmstHours = 18.697374558 + 24.06570982441908 * n;
  return { lat: dec * DEG, lon: normLon(ra * DEG - gmstHours * 15) };
}

function toVector(latDeg, lonDeg, r) {
  const la = latDeg * RAD;
  const lo = lonDeg * RAD;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)];
}

// True when a point at the given altitude sits inside Earth's (cylindrical) shadow.
export function isInEarthShadow(lat, lon, altKm, sun) {
  const r = toVector(lat, lon, EARTH_RADIUS_KM + altKm);
  const s = toVector(sun.lat, sun.lon, 1);
  const d = r[0] * s[0] + r[1] * s[1] + r[2] * s[2];
  if (d > 0) return false;
  const rr = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
  return rr - d * d < EARTH_RADIUS_KM * EARTH_RADIUS_KM;
}

// Circular-orbit model of the ISS ground track, anchored on one observed fix.
// Accurate to a degree or two over a single orbit, which is what the map shows.
export function issOrbitFrom(fix) {
  const inc = ISS_INCLINATION_DEG * RAD;
  const sinU = clamp(Math.sin(fix.lat * RAD) / Math.sin(inc), -1, 1);
  let u0 = Math.asin(sinU);
  if (!fix.ascending) u0 = Math.PI - u0;
  const nodeLon = fix.lon * RAD - Math.atan2(Math.cos(inc) * Math.sin(u0), Math.cos(u0));
  const motion = (2 * Math.PI) / ISS_PERIOD_S;

  // Position dtSeconds after (or before, if negative) the fix.
  return function positionAt(dtSeconds) {
    const u = u0 + motion * dtSeconds;
    const lat = Math.asin(Math.sin(inc) * Math.sin(u)) * DEG;
    const lon = nodeLon + Math.atan2(Math.cos(inc) * Math.sin(u), Math.cos(u)) - EARTH_ROTATION_RAD_S * dtSeconds;
    return { lat, lon: normLon(lon * DEG) };
  };
}

// Minutes until the ISS next crosses the day/night line, and which way.
export function nextOrbitalTerminator(fix, nowMs, stepS = 15) {
  const positionAt = issOrbitFrom(fix);
  const dt0 = (nowMs - fix.time) / 1000;
  const p0 = positionAt(dt0);
  const startShadow = isInEarthShadow(p0.lat, p0.lon, fix.alt, subsolarPoint(nowMs));
  for (let s = stepS; s <= ISS_PERIOD_S * 1.1; s += stepS) {
    const p = positionAt(dt0 + s);
    const shadow = isInEarthShadow(p.lat, p.lon, fix.alt, subsolarPoint(nowMs + s * 1000));
    if (shadow !== startShadow) {
      return { minutes: s / 60, event: shadow ? 'sunset' : 'sunrise', inShadow: startShadow };
    }
  }
  return { minutes: null, event: null, inShadow: startShadow };
}

// --- Mars ---------------------------------------------------------------------

// Mars Sol Date and Coordinated Mars Time (Allison & McEwen 2000, as used by Mars24).
export function marsSolDate(ms) {
  const jdTT = julianDate(ms) + TT_MINUS_UTC_S / 86400;
  return (jdTT - 2405522.0028779) / 1.0274912517;
}

export const JEZERO = { name: 'Jezero Crater', lonEast: 77.45, lat: 18.44 };
const PERSEVERANCE_SOL0_MSD = 52304; // landing, 18 Feb 2021, 15:53 LMST

// Mission sol and local mean solar time at Perseverance's landing site.
export function perseveranceClock(ms) {
  const local = marsSolDate(ms) + JEZERO.lonEast / 360;
  const sol = Math.floor(local) - PERSEVERANCE_SOL0_MSD;
  const hours = (local - Math.floor(local)) * 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return { sol, hours, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}

// JPL "Keplerian Elements for Approximate Positions of the Major Planets" (1800-2050).
// [a, e, I, L, longPeri, longNode] and their rates per Julian century.
const ELEMENTS = {
  earth: [
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
  ],
  mars: [
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  ],
};

function heliocentric(planet, ms) {
  const T = (julianDate(ms) + TT_MINUS_UTC_S / 86400 - 2451545.0) / 36525;
  const [base, rate] = ELEMENTS[planet];
  const [a, e, I, L, peri, node] = base.map((v, i) => v + rate[i] * T);
  const omega = (peri - node) * RAD;
  let M = ((L - peri) % 360) * RAD;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(omega), sw = Math.sin(omega);
  const cO = Math.cos(node * RAD), sO = Math.sin(node * RAD);
  const cI = Math.cos(I * RAD), sI = Math.sin(I * RAD);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

export function earthMarsDistance(ms) {
  const e = heliocentric('earth', ms);
  const m = heliocentric('mars', ms);
  const au = Math.hypot(m[0] - e[0], m[1] - e[1], m[2] - e[2]);
  const km = au * AU_KM;
  return { au, km, lightSeconds: km / LIGHT_KM_S };
}

// Rough body-of-water name for when no country is below the ISS. Only has to be
// right within the station's ±51.6° latitude band; null when unsure.
const WATERS = [
  ['the Southern Ocean', (lat) => lat <= -60],
  ['the Black Sea', (lat, lon) => lat >= 40.5 && lat <= 47 && lon >= 27.5 && lon <= 42],
  ['the Caspian Sea', (lat, lon) => lat >= 36.5 && lat <= 47.5 && lon >= 46.5 && lon <= 55],
  ['the Mediterranean', (lat, lon) => lat >= 30 && lat <= 46 && lon >= -6 && lon <= 36],
  ['the Red Sea', (lat, lon) => lat >= 12 && lat <= 30 && lon >= 32 && lon <= 44],
  ['the Persian Gulf', (lat, lon) => lat >= 23 && lat <= 30.5 && lon >= 47.5 && lon <= 57],
  ['the Gulf of Mexico', (lat, lon) => lat >= 18 && lat <= 31 && lon >= -98 && lon < -80],
  ['the Atlantic Ocean', (lat, lon) => (lat >= 10 && lon >= -80 && lon <= 20) || (lat < 10 && lon >= -65 && lon <= 20)],
  ['the Indian Ocean', (lat, lon) => (lon > 20 && lon <= 100 && lat < 25) || (lon > 100 && lon < 135 && lat < -10)],
  ['the Pacific Ocean', (lat, lon) => lon >= 100 || lon <= -65],
];

export function roughOceanName(lat, lon) {
  return WATERS.find(([, test]) => test(lat, lon))?.[0] ?? null;
}
