/**
 * Контрольный пример из листка «Трасса спутника»: МКС по TLE с эпохой 26299,20906838.
 * Листок считает вручную с округлением (π ≈ 3,14159, одно приближение E₀ без итераций),
 * поэтому допуск — сотые доли градуса.
 */
import { describe, expect, it } from 'vitest';
import { DEG, JD_UNIX_EPOCH, OMEGA_EARTH_DEG_PER_MIN, RAD } from '../constants';
import type { OrbitalElements } from '../propagate';
import { prepareOrbit, propagate } from '../propagate';
import { equatorPath, latitudeFromArgument } from '../subpoint';
import { greenwichSiderealTime, julianDateFromTleEpoch, julianDateJan1 } from '../time';

const JD = julianDateFromTleEpoch(2026, 299.20906838);
const epochMs = (JD - JD_UNIX_EPOCH) * 86_400_000;

const ISS: OrbitalElements = {
  name: 'ISS (ZARYA)',
  noradId: 25544,
  epochMs,
  meanMotion: 15.49059765,
  eccentricity: 0.000692,
  inclinationDeg: 51.6337,
  raanDeg: 11.7282,
  argPerigeeDeg: 310.9581,
  meanAnomalyDeg: 49.0809,
};

describe('Листок «Трасса спутника»: расчёт для МКС', () => {
  const orbit = prepareOrbit(ISS);

  it('шаг 1: эпоха 26.10.2026 05:01:03,5 UTC', () => {
    const d = new Date(epochMs);
    expect(d.toISOString().slice(0, 19)).toBe('2026-10-26T05:01:03');
  });

  it('шаг 2: T = 5577,58 с = 92,9596 мин, n = 3,87265 °/мин', () => {
    expect(orbit.T).toBeCloseTo(5577.58, 2);
    expect((orbit.n * RAD) * 60).toBeCloseTo(3.87265, 4);
  });

  it('шаг 2: a = 6797,62 км, h_п = 421,9 км, h_а = 431,3 км', () => {
    expect(orbit.a).toBeCloseTo(6797.62, 1);
    expect(orbit.hPerigee).toBeCloseTo(421.9, 1);
    expect(orbit.hApogee).toBeCloseTo(431.3, 1);
  });

  it('шаг 4: JD₁ янв 2026 = 2 461 041,5; JD эпохи = 2 461 339,70906838', () => {
    expect(julianDateJan1(2026)).toBe(2461041.5);
    expect(JD).toBeCloseTo(2461339.70906838, 8);
  });

  it('шаг 4: S = 109,8545°, λ_Ω = −98,1263°', () => {
    expect(greenwichSiderealTime(epochMs) * RAD).toBeCloseTo(109.8545, 3);
    expect(orbit.lambdaNode * RAD).toBeCloseTo(-98.1263, 3);
  });

  it('шаг 5.7: ω_З = 0,250684 °/мин', () => {
    expect(OMEGA_EARTH_DEG_PER_MIN).toBeCloseTo(0.250684, 5); // в листке округлено: 0,2506847…
  });

  it('момент 1 (t = 0): ν = 49,1409°, u = 0,0990°, φ = 0,08°, λ = −98,0649°', () => {
    const s = propagate(orbit, epochMs);
    expect(s.theta * RAD).toBeCloseTo(49.1409, 3);
    expect(s.u * RAD).toBeCloseTo(0.099, 3);
    expect(s.lat * RAD).toBeCloseTo(0.0776, 3);
    expect(s.ab * RAD).toBeCloseTo(0.0614, 3);
    expect(s.lon * RAD).toBeCloseTo(-98.0649, 3);
  });

  it('момент 2 (t = 30 мин): u = 116,2386°, φ = 44,69°, ab = 128,4537°, λ = 22,8069°', () => {
    const s = propagate(orbit, epochMs + 30 * 60_000);
    expect(s.u * RAD).toBeCloseTo(116.2386, 2);
    expect(s.lat * RAD).toBeCloseTo(44.69, 2);
    expect(s.ab * RAD).toBeCloseTo(128.4537, 2);
    expect(s.turn * RAD).toBeCloseTo(7.5205, 4);
    expect(s.lon * RAD).toBeCloseTo(22.8069, 2);
  });
});

describe('Сферический треугольник (шаги 5.5–5.6)', () => {
  it('на узле φ = 0 и ab = 0; в вершине (u = 90°) φ = i и ab = 90°', () => {
    const i = 51.6 * DEG;
    expect(latitudeFromArgument(0, i)).toBe(0);
    expect(equatorPath(0, i)).toBe(0);
    expect(latitudeFromArgument(90 * DEG, i) * RAD).toBeCloseTo(51.6, 10);
    expect(equatorPath(90 * DEG, i) * RAD).toBeCloseTo(90, 10);
  });

  it('пример с рисунка листка: u = 57,16°, i = 51,63° → φ ≈ 41,18°, ab ≈ 43,90°', () => {
    const i = 51.6337 * DEG;
    expect(latitudeFromArgument(57.16 * DEG, i) * RAD).toBeCloseTo(41.18, 1);
    expect(equatorPath(57.16 * DEG, i) * RAD).toBeCloseTo(43.9, 1);
  });

  it('совпадает с поворотом координат x, y, z: tg ab = cos i · tg u', () => {
    const i = 63 * DEG;
    for (let u = -3; u < 3; u += 0.37) {
      const x = Math.cos(u);
      const y = Math.sin(u) * Math.cos(i);
      expect(equatorPath(u, i)).toBeCloseTo(Math.atan2(y, x), 12);
    }
  });
});
