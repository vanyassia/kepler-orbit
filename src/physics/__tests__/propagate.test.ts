import { describe, expect, it } from 'vitest';
import { DEG, MU, RAD } from '../constants';
import { cross, norm } from '../math';
import type { OrbitalElements } from '../propagate';
import { ascendingNodeTimes, orbitEllipse, prepareOrbit, propagate, subPointAt } from '../propagate';
import { groundTrack, splitAtAntimeridian } from '../groundTrack';

/** МКС, CelesTrak, эпоха 2026-10-21T01:08:59.469792 */
const ISS: OrbitalElements = {
  name: 'ISS (ZARYA)',
  noradId: 25544,
  epochMs: Date.UTC(2026, 9, 21, 1, 8, 59) + 469.792,
  meanMotion: 15.48967427,
  eccentricity: 0.00067597,
  inclinationDeg: 51.6327,
  raanDeg: 37.2623,
  argPerigeeDeg: 289.5321,
  meanAnomalyDeg: 70.4938,
};

/** Меридиан-10 — орбита типа «Молния» */
const MERIDIAN: OrbitalElements = {
  name: 'MERIDIAN 10',
  noradId: 52145,
  epochMs: Date.UTC(2026, 9, 20, 14, 9, 48),
  meanMotion: 2.00590596,
  eccentricity: 0.68209506,
  inclinationDeg: 62.6997,
  raanDeg: 120,
  argPerigeeDeg: 270,
  meanAnomalyDeg: 0,
};

/** Электро-Л №3 — геостационарный */
const ELEKTRO: OrbitalElements = {
  name: 'ELEKTRO-L 3',
  noradId: 44903,
  epochMs: Date.UTC(2026, 9, 9, 14, 12, 21),
  meanMotion: 1.00273781,
  eccentricity: 0.0003,
  inclinationDeg: 0.05,
  raanDeg: 80,
  argPerigeeDeg: 200,
  meanAnomalyDeg: 160,
};

describe('Полное состояние КА', () => {
  it('МКС: высота 410–430 км, скорость ≈ 7,66 км/с', () => {
    const orbit = prepareOrbit(ISS);
    for (let k = 0; k < 100; k++) {
      const s = propagate(orbit, ISS.epochMs + k * 60_000);
      expect(s.h).toBeGreaterThan(405);
      expect(s.h).toBeLessThan(435);
      expect(s.V).toBeCloseTo(7.66, 1);
    }
  });

  it('на эпоху M = M₀', () => {
    const s = propagate(prepareOrbit(ISS), ISS.epochMs);
    expect(s.M / DEG).toBeCloseTo(ISS.meanAnomalyDeg, 9);
    expect(s.dt).toBe(0);
  });

  it('через период КА возвращается в ту же точку АГЭСК (орбита неподвижна в инерциальном пространстве)', () => {
    const orbit = prepareOrbit(MERIDIAN);
    const a = propagate(orbit, MERIDIAN.epochMs + 3_600_000);
    const b = propagate(orbit, MERIDIAN.epochMs + 3_600_000 + orbit.T * 1000);
    expect(b.eci.x).toBeCloseTo(a.eci.x, 3);
    expect(b.eci.y).toBeCloseTo(a.eci.y, 3);
    expect(b.eci.z).toBeCloseTo(a.eci.z, 3);
    expect(b.revolution - a.revolution).toBe(1);
  });

  it('интегралы движения постоянны на сильно вытянутой орбите (энергия и момент)', () => {
    const orbit = prepareOrbit(MERIDIAN);
    const h0 = Math.sqrt(MU * orbit.p);
    for (let k = 0; k < 48; k++) {
      const s = propagate(orbit, MERIDIAN.epochMs + k * 900_000);
      expect(s.V ** 2 / 2 - MU / s.r).toBeCloseTo(-MU / (2 * orbit.a), 8);
      expect(norm(cross(s.eci, s.vEci))).toBeCloseTo(h0, 5);
    }
  });

  it('Меридиан: перигей ≈ 1 600 км, апогей ≈ 38 800 км, T ≈ 12 ч', () => {
    const o = prepareOrbit(MERIDIAN);
    expect(o.T / 3600).toBeCloseTo(11.96, 1);
    expect(o.hPerigee).toBeGreaterThan(1000);
    expect(o.hPerigee).toBeLessThan(2500);
    expect(o.hApogee).toBeGreaterThan(38000);
    expect(o.hApogee).toBeLessThan(40000);
  });

  it('геостационарный КА почти неподвижен над экватором (|Δλ| < 0,5° за сутки)', () => {
    const orbit = prepareOrbit(ELEKTRO);
    const s0 = propagate(orbit, ELEKTRO.epochMs);
    for (let k = 1; k <= 24; k++) {
      const s = propagate(orbit, ELEKTRO.epochMs + k * 3_600_000);
      expect(Math.abs(s.lat * RAD)).toBeLessThan(0.1);
      expect(Math.abs(Math.sin((s.lon - s0.lon) / 2)) * 2 * RAD).toBeLessThan(0.5);
    }
  });

  it('широта подспутниковой точки МКС за сутки достигает ±i, но не превышает', () => {
    const orbit = prepareOrbit(ISS);
    let maxLat = 0;
    for (let k = 0; k < 1440; k++) maxLat = Math.max(maxLat, Math.abs(propagate(orbit, ISS.epochMs + k * 60_000).lat * RAD));
    expect(maxLat).toBeLessThanOrEqual(ISS.inclinationDeg + 1e-9);
    expect(maxLat).toBeGreaterThan(ISS.inclinationDeg - 0.1);
  });

  it('межвитковый сдвиг трассы МКС ≈ ω_З·T ≈ 23,3° к западу', () => {
    const orbit = prepareOrbit(ISS);
    const [t1, t2] = ascendingNodeTimes(orbit, ISS.epochMs, ISS.epochMs + 2 * orbit.T * 1000);
    const l1 = propagate(orbit, t1).lon * RAD;
    const l2 = propagate(orbit, t2).lon * RAD;
    const shift = ((l2 - l1 + 540) % 360) - 180;
    expect(shift).toBeCloseTo(-23.3, 0);
  });
});

describe('Восходящие узлы', () => {
  it('в моменты узлов u = 0 и z = 0, интервал равен периоду', () => {
    const orbit = prepareOrbit(ISS);
    const times = ascendingNodeTimes(orbit, ISS.epochMs, ISS.epochMs + 86_400_000);
    expect(times.length).toBeGreaterThanOrEqual(15);
    for (const t of times) {
      const s = propagate(orbit, t);
      expect(Math.abs(Math.sin(s.u))).toBeLessThan(1e-9);
      expect(s.vEci.z).toBeGreaterThan(0); // движение к северу
    }
    expect((times[1] - times[0]) / 1000).toBeCloseTo(orbit.T, 6);
  });
});

describe('Эллипс орбиты', () => {
  it('замкнут, лежит между r_π и r_α', () => {
    const orbit = prepareOrbit(MERIDIAN);
    const pts = orbitEllipse(orbit, 128);
    expect(norm(pts[0])).toBeCloseTo(orbit.rPerigee, 6);
    expect(pts[128].x).toBeCloseTo(pts[0].x, 6);
    for (const p of pts) {
      expect(norm(p)).toBeGreaterThanOrEqual(orbit.rPerigee - 1e-6);
      expect(norm(p)).toBeLessThanOrEqual(orbit.rApogee + 1e-6);
    }
  });
});

describe('Трасса: разрыв на линии перемены дат', () => {
  it('разрыв на ±180°: каждый участок непрерывен, края доходят до ±180°', () => {
    const orbit = prepareOrbit(ISS);
    const pts = groundTrack(orbit, ISS.epochMs, ISS.epochMs + 3 * orbit.T * 1000);
    const segs = splitAtAntimeridian(pts);
    expect(segs.length).toBeGreaterThanOrEqual(3);
    for (const seg of segs) {
      for (let k = 1; k < seg.length; k++) expect(Math.abs(seg[k].lon - seg[k - 1].lon)).toBeLessThan(10);
    }
    for (let k = 0; k < segs.length - 1; k++) {
      expect(Math.abs(segs[k][segs[k].length - 1].lon)).toBe(180);
      expect(Math.abs(segs[k + 1][0].lon)).toBe(180);
    }
  });

  it('искусственный пример перехода 179° → −179°: точка пересечения на широте посередине', () => {
    const segs = splitAtAntimeridian([
      { timeMs: 0, lat: 10, lon: 179, h: 400 },
      { timeMs: 2, lat: 12, lon: -179, h: 400 },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0][1]).toMatchObject({ lon: 180, lat: 11, timeMs: 1 });
    expect(segs[1][0]).toMatchObject({ lon: -180, lat: 11 });
  });
});

describe('Лёгкий расчёт подспутниковой точки', () => {
  const base = { name: 't', noradId: 1, epochMs: Date.UTC(2026, 9, 31), inclinationDeg: 63.4, raanDeg: 120, argPerigeeDeg: 270, meanAnomalyDeg: 40 };
  const cases: [string, OrbitalElements][] = [
    ['круговая орбита Земли', { ...base, meanMotion: 15.5, eccentricity: 0.0007 }],
    ['орбита «Молния»', { ...base, meanMotion: 2.006, eccentricity: 0.68 }],
    ['полярная орбита Луны', { ...base, body: 'moon', meanMotion: 12.3, eccentricity: 0.01 }],
    ['орбита Марса (другой полюс)', { ...base, body: 'mars', meanMotion: 12.9, eccentricity: 0.3 }],
  ];
  it.each(cases)('%s: совпадает с полным расчётом', (_name, el) => {
    const orbit = prepareOrbit(el);
    for (let k = -50; k <= 50; k++) {
      const t = el.epochMs + k * 731_000;
      const full = propagate(orbit, t);
      const light = subPointAt(orbit, t);
      expect(light.lat).toBe(full.lat);
      expect(light.lon).toBe(full.lon);
      expect(light.h).toBe(full.h);
    }
  });
});
