/**
 * Пролёты над точкой: поиск минимумов расстояния по трассе модели листка.
 */
import { describe, expect, it } from 'vitest';
import { DEG, RAD } from '../constants';
import type { OrbitalElements } from '../propagate';
import { prepareOrbit, propagate, subPointAt } from '../propagate';
import { centralAngle, circleAround, findPasses } from '../passes';

// МКС из контрольного примера листка
const ISS: OrbitalElements = {
  name: 'ISS (ZARYA)',
  noradId: 25544,
  epochMs: Date.UTC(2026, 9, 26, 5, 1, 3, 508),
  meanMotion: 15.49059765,
  eccentricity: 0.000692,
  inclinationDeg: 51.6337,
  raanDeg: 11.7282,
  argPerigeeDeg: 310.9581,
  meanAnomalyDeg: 49.0809,
};
const orbit = prepareOrbit(ISS);
const R = orbit.body.radius;
const MOSCOW = { lat: 55.7558, lon: 37.6173 };
const DAY = 86_400_000;

/** Расстояние от подспутниковой точки до места, км. */
const distKm = (t: number, target: { lat: number; lon: number }) => {
  const p = subPointAt(orbit, t);
  return centralAngle(p.lat, p.lon, target.lat * DEG, target.lon * DEG) * R;
};

describe('Центральный угол', () => {
  it('градус по экватору — R·π/180', () => {
    expect(centralAngle(0, 0, 0, 1 * DEG) * R).toBeCloseTo((R * Math.PI) / 180, 6);
  });
  it('Москва — Санкт-Петербург ≈ 634 км', () => {
    const d = centralAngle(55.7558 * DEG, 37.6173 * DEG, 59.9343 * DEG, 30.3351 * DEG) * 6371;
    expect(d).toBeGreaterThan(630);
    expect(d).toBeLessThan(638);
  });
  it('через линию перемены дат — коротким путём', () => {
    expect(centralAngle(0, 179.5 * DEG, 0, -179.5 * DEG) * RAD).toBeCloseTo(1, 9);
  });
});

describe('Поиск пролётов', () => {
  const from = ISS.epochMs;
  const to = from + DAY;
  const all = findPasses(orbit, MOSCOW, from, to, { maxDistanceKm: 1e9, maxCount: 1000 });

  it('найденный момент — настоящий минимум: перебор по секунде рядом не находит ближе', () => {
    expect(all.passes.length).toBeGreaterThan(10);
    for (const p of all.passes) {
      let best = Infinity;
      for (let t = p.timeMs - 120_000; t <= p.timeMs + 120_000; t += 1000) best = Math.min(best, distKm(t, MOSCOW));
      expect(p.distanceKm).toBeLessThanOrEqual(best + 0.01);
      expect(p.distanceKm).toBeCloseTo(distKm(p.timeMs, MOSCOW), 6);
    }
  });

  it('пролёты по порядку времени, внутри интервала, номер витка — как в propagate', () => {
    for (let k = 0; k < all.passes.length; k++) {
      const p = all.passes[k];
      expect(p.timeMs).toBeGreaterThanOrEqual(from);
      expect(p.timeMs).toBeLessThanOrEqual(to);
      if (k > 0) expect(p.timeMs).toBeGreaterThan(all.passes[k - 1].timeMs);
      expect(p.revolution).toBe(propagate(orbit, p.timeMs).revolution);
    }
  });

  it('за сутки не больше двух сближений на виток и не меньше одного', () => {
    const revs = DAY / 1000 / orbit.T;
    expect(all.passes.length).toBeGreaterThanOrEqual(Math.floor(revs) - 1);
    expect(all.passes.length).toBeLessThanOrEqual(2 * Math.ceil(revs) + 1);
  });

  it('фильтр по расстоянию и самое близкое сближение', () => {
    const near = findPasses(orbit, MOSCOW, from, to, { maxDistanceKm: 1000 });
    expect(near.passes.length).toBeGreaterThan(0);
    expect(near.passes.every((p) => p.distanceKm <= 1000)).toBe(true);
    expect(near.passes.length).toBe(all.passes.filter((p) => p.distanceKm <= 1000).length);
    const minAll = Math.min(...all.passes.map((p) => p.distanceKm));
    expect(near.closest!.distanceKm).toBeCloseTo(minAll, 6);
  });

  it('место прямо на трассе — пролёт точно в этот момент, расстояние ≈ 0', () => {
    const t0 = from + 0.37 * DAY;
    const p = subPointAt(orbit, t0);
    const target = { lat: p.lat * RAD, lon: p.lon * RAD };
    const res = findPasses(orbit, target, t0 - 3_600_000, t0 + 3_600_000, { maxDistanceKm: 1 });
    expect(res.passes).toHaveLength(1);
    expect(Math.abs(res.passes[0].timeMs - t0)).toBeLessThan(500);
    expect(res.passes[0].distanceKm).toBeLessThan(0.1);
  });

  it('направление: на восходящей ветви — на север', () => {
    const t0 = from + 0.2 * DAY;
    const s = propagate(orbit, t0);
    const res = findPasses(orbit, { lat: s.lat * RAD, lon: s.lon * RAD }, t0 - 600_000, t0 + 600_000, { maxDistanceKm: 1 });
    expect(res.passes[0].northbound).toBe(Math.cos(s.u) > 0);
  });

  it('место выше наклонения (Северный полюс) — ни одного пролёта ближе 1000 км, но есть самое близкое', () => {
    const res = findPasses(orbit, { lat: 90, lon: 0 }, from, to, { maxDistanceKm: 1000 });
    expect(res.passes).toHaveLength(0);
    // Ближе всего — на широте наклонения: (90° − 51,6°) по дуге
    expect(res.closest!.distanceKm).toBeCloseTo((90 - ISS.inclinationDeg) * DEG * R, -1);
  });

  it('предел числа пролётов', () => {
    const res = findPasses(orbit, MOSCOW, from, to, { maxDistanceKm: 1e9, maxCount: 3 });
    expect(res.passes).toHaveLength(3);
    expect(res.truncated).toBe(true);
  });
});

describe('Круг поиска на карте', () => {
  it('все точки на заданном расстоянии от центра', () => {
    for (const c of [MOSCOW, { lat: -10, lon: 179.5 }, { lat: 80, lon: 0 }]) {
      const pts = circleAround(c, 1000, R, 64);
      expect(pts).toHaveLength(65);
      for (const [lat, lon] of pts) {
        expect(lon).toBeGreaterThan(-180);
        expect(lon).toBeLessThanOrEqual(180);
        expect(centralAngle(lat * DEG, lon * DEG, c.lat * DEG, c.lon * DEG) * R).toBeCloseTo(1000, 6);
      }
    }
  });
});

describe('Неподвижная подспутниковая точка', () => {
  it('у экваториальной круговой орбиты с периодом в звёздные сутки шум не даёт ложных пролётов', () => {
    const geo = prepareOrbit({ ...ISS, meanMotion: 1.00273790935, eccentricity: 0, inclinationDeg: 0, argPerigeeDeg: 0 });
    const res = findPasses(geo, { lat: 0, lon: 0 }, ISS.epochMs, ISS.epochMs + 3 * DAY, { maxDistanceKm: 1e9 });
    expect(res.passes.length).toBeLessThanOrEqual(3);
  });
});
