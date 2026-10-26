import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BODIES, icrfToBodyEquator, marsHeliocentric } from '../bodies';
import { DEG, RAD } from '../constants';
import { greenwichToGeo } from '../frames';
import { norm } from '../math';
import { prepareOrbit, propagate } from '../propagate';

interface Item {
  naifId: number;
  body: 'moon' | 'mars';
  epoch: string;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionDegPerSec: number;
  semiMajorAxisKm: number;
}
interface Check {
  naifId: number;
  body: 'moon' | 'mars';
  timeUtc: string;
  subLon: number;
  subLat: number;
  sunLon: number;
  sunLat: number;
}
const fx = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'horizons-check.json'), 'utf8')) as { elements: Item[]; checks: Check[] };

/** Долгота Horizons → восточная, градусы (−180…180]: у Марса Horizons даёт западные долготы. */
const eastLon = (lon: number, body: 'moon' | 'mars') => {
  const e = body === 'mars' ? -lon : lon;
  return ((e + 540) % 360) - 180;
};

/** Центральный угол между двумя точками сферы, градусы. */
const arc = (lat1: number, lon1: number, lat2: number, lon2: number) =>
  Math.acos(
    Math.min(1, Math.sin(lat1 * DEG) * Math.sin(lat2 * DEG) + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos((lon1 - lon2) * DEG)),
  ) * RAD;

describe('Центральные тела: проверка по JPL Horizons — формулы (18)–(20)', () => {
  for (const c of fx.checks) {
    const el = fx.elements.find((e) => e.naifId === c.naifId)!;
    const body = BODIES[c.body];
    const orbit = prepareOrbit({
      name: String(el.naifId),
      noradId: el.naifId,
      body: el.body,
      epochMs: Date.parse(el.epoch),
      meanMotion: (el.meanMotionDegPerSec * 86400) / 360,
      eccentricity: el.eccentricity,
      inclinationDeg: el.inclinationDeg,
      raanDeg: el.raanDeg,
      argPerigeeDeg: el.argPerigeeDeg,
      meanAnomalyDeg: el.meanAnomalyDeg,
    });
    const t = Date.parse(c.timeUtc);

    it(`${c.body} / NAIF ${c.naifId}: большая полуось из μ совпадает с Horizons`, () => {
      expect(Math.abs(orbit.a - el.semiMajorAxisKm) / el.semiMajorAxisKm).toBeLessThan(1e-4);
    });

    it(`${c.body} / NAIF ${c.naifId}: подспутниковая точка через 10 мин — в пределах 0,5° от Horizons`, () => {
      const s = propagate(orbit, t);
      expect(arc(s.lat * RAD, s.lon * RAD, c.subLat, eastLon(c.subLon, c.body))).toBeLessThan(0.5);
    });

    it(`${c.body}: подсолнечная точка — в пределах 0,5° от Horizons`, () => {
      const sun = greenwichToGeo(body.toFixed(body.sunDirection(t), t), 0);
      expect(arc(sun.lat * RAD, sun.lon * RAD, c.sunLat, eastLon(c.sunLon, c.body))).toBeLessThan(0.5);
    });
  }
});

describe('Вспомогательные формулы', () => {
  it('переход ICRF → экватор тела сохраняет длину, полюс тела переходит в ось z', () => {
    const a0 = 317.68 * DEG;
    const d0 = 52.89 * DEG;
    const pole = { x: Math.cos(d0) * Math.cos(a0), y: Math.cos(d0) * Math.sin(a0), z: Math.sin(d0) };
    const b = icrfToBodyEquator(pole, a0, d0);
    expect(b.z).toBeCloseTo(1, 12);
    const v = icrfToBodyEquator({ x: 1, y: 2, z: 3 }, a0, d0);
    expect(norm(v)).toBeCloseTo(Math.sqrt(14), 12);
  });

  it('переходы во вращающуюся систему и обратно взаимно обратны (для всех тел)', () => {
    const v = { x: 1200, y: -3400, z: 2100 };
    for (const b of Object.values(BODIES)) {
      const back = b.toInertial(b.toFixed(v, Date.UTC(2026, 9, 26)), Date.UTC(2026, 9, 26));
      expect(back.x).toBeCloseTo(v.x, 8);
      expect(back.y).toBeCloseTo(v.y, 8);
      expect(back.z).toBeCloseTo(v.z, 8);
    }
  });

  it('расстояние Марс — Солнце — между перигелием 1,381 и афелием 1,666 а. е.', () => {
    for (let k = 0; k < 24; k++) {
      const r = norm(marsHeliocentric(Date.UTC(2026, k, 1)));
      expect(r).toBeGreaterThan(1.38);
      expect(r).toBeLessThan(1.667);
    }
  });
});
