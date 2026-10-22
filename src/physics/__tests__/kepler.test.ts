import { describe, expect, it } from 'vitest';
import { DEG, MU, TWO_PI } from '../constants';
import {
  focalParameter,
  meanAnomalyAt,
  meanMotionFromRevPerDay,
  orbitalPeriod,
  radiusFromEccentric,
  radiusFromTrue,
  semiMajorAxis,
  solveKepler,
  trueAnomalyFromEccentric,
} from '../kepler';
import { meanAnomalyFromTrue } from '../propagate';

describe('Большая полуось и период — формулы (1)–(3)', () => {
  it('МКС: N = 15,4897 об/сут → a ≈ 6796 км, T ≈ 93 мин', () => {
    const n = meanMotionFromRevPerDay(15.48967427);
    const a = semiMajorAxis(n);
    expect(a).toBeGreaterThan(6790);
    expect(a).toBeLessThan(6800);
    expect(orbitalPeriod(a) / 60).toBeCloseTo(92.97, 1);
  });

  it('Геостационарная орбита: N = 1,0027379 об/сут (звёздные сутки) → a = 42 164 км', () => {
    const a = semiMajorAxis(meanMotionFromRevPerDay(1.00273781191));
    expect(a).toBeCloseTo(42164.17, 0);
  });

  it('T = 2π/n — период обратен среднему движению', () => {
    for (const N of [0.5, 1, 2.006, 14.2, 16]) {
      const n = meanMotionFromRevPerDay(N);
      expect(orbitalPeriod(semiMajorAxis(n))).toBeCloseTo(86400 / N, 6);
    }
  });

  it('Третий закон Кеплера: n²a³ = μ', () => {
    const n = meanMotionFromRevPerDay(2.0059);
    const a = semiMajorAxis(n);
    expect((n * n * a ** 3) / MU).toBeCloseTo(1, 12);
  });

  it('p = a(1 − e²)', () => {
    expect(focalParameter(26560, 0.68)).toBeCloseTo(26560 * (1 - 0.68 ** 2), 9);
  });
});

describe('Средняя аномалия — формула (4)', () => {
  it('приводится к [0, 2π) и растёт линейно', () => {
    const n = 0.001;
    expect(meanAnomalyAt(0, n, 1000)).toBeCloseTo(1, 12);
    expect(meanAnomalyAt(6, n, 1000)).toBeCloseTo(7 - TWO_PI, 12);
    expect(meanAnomalyAt(0.5, n, -1000)).toBeCloseTo(TWO_PI - 0.5, 12);
  });
});

describe('Уравнение Кеплера E − e·sin E = M — формула (5)', () => {
  it('контрольный пример Vallado (Example 2-1): M = 235,4°, e = 0,4 → E = 220,512074768°', () => {
    const { E } = solveKepler(235.4 * DEG, 0.4);
    expect(E / DEG).toBeCloseTo(220.512074768, 8);
  });

  it('невязка < 1e-12 на всей сетке M ∈ [0, 2π), e ∈ [0; 0,99]', () => {
    for (const e of [0, 0.001, 0.1, 0.3, 0.5, 0.7, 0.9, 0.95, 0.99]) {
      for (let k = 0; k < 360; k++) {
        const M = k * DEG;
        const { E } = solveKepler(M, e);
        const residual = Math.abs(Math.sin((E - e * Math.sin(E) - M) / 2)); // учёт периодичности
        expect(residual).toBeLessThan(1e-12);
      }
    }
  });

  it('метод Ньютона сходится быстро: ≤ 6 итераций при e ≤ 0,7 (орбита «Молния»), ≤ 12 при e = 0,99', () => {
    const worst = (e: number) => {
      let w = 0;
      for (let k = 0; k < 3600; k++) w = Math.max(w, solveKepler(k * 0.1 * DEG, e).iterations);
      return w;
    };
    expect(worst(0.001)).toBeLessThanOrEqual(3);
    expect(worst(0.7)).toBeLessThanOrEqual(6);
    expect(worst(0.99)).toBeLessThanOrEqual(12);
  });

  it('круговая орбита: E = M', () => {
    expect(solveKepler(1.234, 0).E).toBeCloseTo(1.234, 14);
  });

  it('отказ для незамкнутых орбит (e ≥ 1)', () => {
    expect(() => solveKepler(1, 1)).toThrow(RangeError);
  });
});

describe('Истинная аномалия и радиус — формулы (6)–(7)', () => {
  it('при e = 0 ϑ = E', () => {
    for (const E of [0, 1, 2, 3, 4, 5, 6]) expect(trueAnomalyFromEccentric(E, 0)).toBeCloseTo(E, 12);
  });

  it('совпадает с записью через тангенс половинного угла tg(ϑ/2) = √((1+e)/(1−e))·tg(E/2)', () => {
    const e = 0.6;
    for (const E of [0.3, 1.2, 2.5, 3.0]) {
      const theta = trueAnomalyFromEccentric(E, e);
      expect(Math.tan(theta / 2)).toBeCloseTo(Math.sqrt((1 + e) / (1 - e)) * Math.tan(E / 2), 10);
    }
  });

  it('перицентр и апоцентр: ϑ(0) = 0, ϑ(π) = π', () => {
    expect(trueAnomalyFromEccentric(0, 0.7)).toBeCloseTo(0, 12);
    expect(trueAnomalyFromEccentric(Math.PI, 0.7)).toBeCloseTo(Math.PI, 12);
  });

  it('две формы уравнения орбиты дают один радиус: a(1 − e·cos E) = p/(1 + e·cos ϑ)', () => {
    const a = 26560;
    const e = 0.68;
    const p = focalParameter(a, e);
    for (let k = 0; k < 36; k++) {
      const E = k * 10 * DEG;
      const theta = trueAnomalyFromEccentric(E, e);
      expect(radiusFromEccentric(a, e, E)).toBeCloseTo(radiusFromTrue(p, e, theta), 6);
    }
  });

  it('обратный переход ϑ → M согласован с прямым M → E → ϑ', () => {
    const e = 0.45;
    for (let k = 0; k < 36; k++) {
      const M = k * 10 * DEG + 0.01;
      const theta = trueAnomalyFromEccentric(solveKepler(M, e).E, e);
      expect(meanAnomalyFromTrue(theta, e)).toBeCloseTo(M, 10);
    }
  });
});
