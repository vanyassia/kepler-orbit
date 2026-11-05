/**
 * Графики за виток: перицентр в начале и в конце, апоцентр посередине.
 */
import { describe, expect, it } from 'vitest';
import { TWO_PI } from '../constants';
import type { OrbitalElements } from '../propagate';
import { prepareOrbit, propagate } from '../propagate';
import { orbitProfile, perigeeBefore, profileAt } from '../orbitProfile';

// Вытянутая орбита типа «Молния»
const MOLNIYA: OrbitalElements = {
  name: 'MOLNIYA',
  noradId: 1,
  epochMs: Date.UTC(2026, 10, 1, 0, 0, 0),
  meanMotion: 2.00613,
  eccentricity: 0.68,
  inclinationDeg: 63.4,
  raanDeg: 120,
  argPerigeeDeg: 270,
  meanAnomalyDeg: 75,
};
const orbit = prepareOrbit(MOLNIYA);
const T = orbit.T * 1000;

describe('perigeeBefore', () => {
  it('даёт перицентр не позже момента и не раньше чем за период', () => {
    for (const shift of [0, 1, 3_600_000, 0.37 * T, 5.9 * T, -2.2 * T]) {
      const t = MOLNIYA.epochMs + shift;
      const tp = perigeeBefore(orbit, t);
      expect(tp).toBeLessThanOrEqual(t);
      expect(t - tp).toBeLessThan(T);
      // В перицентре средняя аномалия M = 0 (по модулю 2π)
      const M = propagate(orbit, tp + 1).M;
      expect(Math.min(M, TWO_PI - M)).toBeLessThan(1e-6);
    }
  });

  it('один и тот же на всём витке', () => {
    const tp = perigeeBefore(orbit, MOLNIYA.epochMs);
    expect(perigeeBefore(orbit, tp + 0.01 * T)).toBeCloseTo(tp, 0);
    expect(perigeeBefore(orbit, tp + 0.99 * T)).toBeCloseTo(tp, 0);
  });
});

describe('orbitProfile', () => {
  const tp = perigeeBefore(orbit, MOLNIYA.epochMs);
  const p = orbitProfile(orbit, tp, 240);

  it('начинается и кончается в перицентре, апоцентр посередине', () => {
    const first = p.points[0];
    const last = p.points[p.points.length - 1];
    const mid = p.points[120]; // E = π — апоцентр
    expect(first.h).toBeCloseTo(orbit.hPerigee, 3);
    expect(last.h).toBeCloseTo(orbit.hPerigee, 3);
    expect(mid.h).toBeCloseTo(orbit.hApogee, 3);
    expect(mid.timeMs).toBeCloseTo(p.apoMs, 0);
    expect(p.endMs - p.startMs).toBeCloseTo(T, 0);
    expect(first.theta).toBe(0);
    expect(mid.theta).toBeCloseTo(Math.PI, 9);
    expect(last.theta).toBeCloseTo(TWO_PI, 9);
  });

  it('скорость наибольшая в перицентре, наименьшая в апоцентре', () => {
    const Vs = p.points.map((q) => q.V);
    expect(p.points[0].V).toBeCloseTo(Math.max(...Vs), 9);
    expect(p.points[120].V).toBeCloseTo(Math.min(...Vs), 9);
  });

  it('ν растёт монотонно, время — тоже', () => {
    for (let k = 1; k < p.points.length; k++) {
      expect(p.points[k].theta).toBeGreaterThan(p.points[k - 1].theta);
      expect(p.points[k].timeMs).toBeGreaterThan(p.points[k - 1].timeMs);
    }
  });

  it('значение в произвольный момент близко к точному расчёту', () => {
    const t = tp + 0.31 * T;
    const a = profileAt(p, t);
    const s = propagate(orbit, t);
    expect(a.h).toBeCloseTo(s.h, -1); // в пределах нескольких км на высоте ~20 000 км
    expect(a.V).toBeCloseTo(s.V, 3);
    expect(a.lat).toBeCloseTo(s.lat, 3);
    expect(a.theta).toBeCloseTo(s.theta, 3);
  });
});
