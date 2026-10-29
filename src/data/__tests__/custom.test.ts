import { describe, expect, it } from 'vitest';
import { BODIES } from '../../physics/bodies';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { RAD } from '../../physics/constants';
import type { CustomSatellite } from '../custom';
import { customToElements, shapeFromHeights, validateCustom } from '../custom';

const base: CustomSatellite = {
  id: 9_000_001,
  name: 'Мой спутник',
  body: 'moon',
  hPeri: 100,
  hApo: 100,
  inclinationDeg: 90,
  raanDeg: 0,
  argPerigeeDeg: 0,
  meanAnomalyDeg: 0,
  epochMs: Date.UTC(2026, 9, 29),
};

describe('Свой спутник: элементы по высотам перицентра и апоцентра', () => {
  it('круговая орбита: a = R + h, e = 0', () => {
    const { a, e } = shapeFromHeights(100, 100, BODIES.moon.radius);
    expect(a).toBeCloseTo(1837.4, 6);
    expect(e).toBe(0);
  });

  it('эллипс: e = (r_α − r_π)/(r_α + r_π)', () => {
    const { a, e } = shapeFromHeights(300, 10_000, BODIES.mars.radius);
    expect(a).toBeCloseTo(3389.5 + 5150, 6);
    expect(e).toBeCloseTo(9700 / (2 * (3389.5 + 5150)), 12);
  });

  it('модель восстанавливает заданные высоты и наклонение (Луна, 100 км, полярная)', () => {
    const orbit = prepareOrbit(customToElements(base));
    expect(orbit.hPerigee).toBeCloseTo(100, 6);
    expect(orbit.hApogee).toBeCloseTo(100, 6);
    // Период низкой лунной орбиты ≈ 118 мин
    expect(orbit.T / 60).toBeCloseTo(117.7, 0);
    let maxLat = 0;
    for (let k = 0; k < 200; k++) maxLat = Math.max(maxLat, Math.abs(propagate(orbit, base.epochMs + k * 60_000).lat * RAD));
    expect(maxLat).toBeGreaterThan(89);
  });

  it('проверка ввода: апоцентр ниже перицентра и наклонение вне 0…180° — ошибки', () => {
    const err = validateCustom({ ...base, hPeri: 500, hApo: 200, inclinationDeg: 200 });
    expect(err.hApo).toBeTruthy();
    expect(err.inclinationDeg).toBeTruthy();
    expect(Object.keys(validateCustom(base))).toHaveLength(0);
  });
});
