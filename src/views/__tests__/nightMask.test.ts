import { describe, expect, it } from 'vitest';
import { DEG } from '../../physics/constants';
import { fillNightAlpha, MASK_H, MASK_W, smooth } from '../map2d/nightMask';

const pixels = () => new Uint8ClampedArray(MASK_W * MASK_H * 4);
const alphaAt = (a: Uint8ClampedArray, lat: number, lon: number) => {
  const r = Math.min(MASK_H - 1, Math.floor(((90 - lat) / 180) * MASK_H));
  const c = Math.min(MASK_W - 1, Math.floor(((lon + 180) / 360) * MASK_W));
  return a[(r * MASK_W + c) * 4 + 3];
};

describe('Маски освещённости карты', () => {
  const sub = { lat: -13.6 * DEG, lon: 40 * DEG };
  const dark = pixels();
  const lights = pixels();
  fillNightAlpha(dark, lights, sub);

  it('под Солнцем светло и нет огней, на обратной стороне темно и огни горят', () => {
    expect(alphaAt(dark, -13.6, 40)).toBe(0);
    expect(alphaAt(lights, -13.6, 40)).toBe(0);
    expect(alphaAt(dark, 13.6, -140)).toBe(Math.round(255 * 0.8));
    expect(alphaAt(lights, 13.6, -140)).toBe(255);
  });

  it('значения совпадают с точной формулой в пределах одного уровня из 255', () => {
    let worst = 0;
    for (let r = 0; r < MASK_H; r += 7) {
      const lat = (90 - ((r + 0.5) / MASK_H) * 180) * DEG;
      for (let c = 0; c < MASK_W; c += 11) {
        const lon = (((c + 0.5) / MASK_W) * 360 - 180) * DEG;
        const sinH = Math.sin(lat) * Math.sin(sub.lat) + Math.cos(lat) * Math.cos(sub.lat) * Math.cos(lon - sub.lon);
        const exact = 255 * 0.8 * smooth(Math.sin(-0.83 * DEG), Math.sin(-12 * DEG), sinH);
        worst = Math.max(worst, Math.abs(dark[(r * MASK_W + c) * 4 + 3] - exact));
      }
    }
    expect(worst).toBeLessThanOrEqual(1);
  });

  it('повторный пересчёт для другого положения Солнца полностью заменяет маску', () => {
    const d = pixels();
    const l = pixels();
    fillNightAlpha(d, l, sub);
    fillNightAlpha(d, l, { lat: 13.6 * DEG, lon: -140 * DEG });
    expect(alphaAt(d, 13.6, -140)).toBe(0);
    expect(alphaAt(d, -13.6, 40)).toBe(Math.round(255 * 0.8));
  });
});
