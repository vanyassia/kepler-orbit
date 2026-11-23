import { describe, expect, it } from 'vitest';
import { SURFACE_CREDIT, surfaceCredit, VENUS_CLOUDS, VENUS_CLOUDS_CREDIT } from '../assets';
import { VENUS_CLOUD_PERIOD_MS, venusCloudShift } from '../globe3d/shaders';

describe('Облачный слой Венеры', () => {
  it('сдвиг супервращения делает полный оборот на запад за 4 земных суток', () => {
    expect(venusCloudShift(0)).toBe(0);
    expect(venusCloudShift(VENUS_CLOUD_PERIOD_MS / 4)).toBeCloseTo(0.25, 10);
    expect(venusCloudShift(VENUS_CLOUD_PERIOD_MS / 2)).toBeCloseTo(0.5, 10);
    expect(venusCloudShift(VENUS_CLOUD_PERIOD_MS)).toBeCloseTo(0, 10);
    expect(venusCloudShift(VENUS_CLOUD_PERIOD_MS * 3.75)).toBeCloseTo(0.75, 10);
  });

  it('сдвиг остаётся в полуинтервале [0, 1) и для дат до 1970 года', () => {
    expect(venusCloudShift(-VENUS_CLOUD_PERIOD_MS / 4)).toBeCloseTo(0.75, 10);
    expect(Object.is(venusCloudShift(-VENUS_CLOUD_PERIOD_MS), 0)).toBe(true);
    for (const t of [-1e12, -1000, 0, 1000, 1.7e12]) {
      const s = venusCloudShift(t);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
  });

  it('подпись источника для Венеры меняется при включении облачного слоя, а для других тел остаётся прежней', () => {
    expect(surfaceCredit('venus', false)).toBe(SURFACE_CREDIT.venus);
    expect(surfaceCredit('venus', true)).toBe(VENUS_CLOUDS_CREDIT);
    expect(surfaceCredit('venus', true)).not.toContain('Magellan');
    for (const body of ['earth', 'moon', 'mars', 'saturn'] as const) {
      expect(surfaceCredit(body, false)).toBe(SURFACE_CREDIT[body]);
      expect(surfaceCredit(body, true)).toBe(SURFACE_CREDIT[body]);
    }
  });

  it('список текстур облаков Венеры указывает на подготовленные WebP-файлы', () => {
    expect(VENUS_CLOUDS.length).toBeGreaterThanOrEqual(1);
    for (const url of VENUS_CLOUDS) {
      expect(url).toMatch(/venus_clouds_(2k|4k)\.webp$/);
    }
  });
});
