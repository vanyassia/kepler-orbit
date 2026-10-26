import { describe, expect, it } from 'vitest';
import { REGIONS } from '../regions';

describe('Регионы Луны и Марса (справочник USGS, названия IAU)', () => {
  it('у Земли регионов нет, у Луны и Марса — десятки', () => {
    expect(REGIONS.earth).toHaveLength(0);
    expect(REGIONS.moon.length).toBeGreaterThan(50);
    expect(REGIONS.mars.length).toBeGreaterThan(50);
  });

  it('координаты и размеры корректны, у каждого — русская подпись', () => {
    for (const r of [...REGIONS.moon, ...REGIONS.mars]) {
      expect(Math.abs(r.lat)).toBeLessThanOrEqual(90);
      expect(r.lon).toBeGreaterThanOrEqual(-180);
      expect(r.lon).toBeLessThanOrEqual(180);
      expect(r.diameterKm).toBeGreaterThan(100);
      expect(r.title).toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('контрольные объекты: Море Дождей и Гора Олимп на своих местах', () => {
    const imbrium = REGIONS.moon.find((r) => r.name === 'Mare Imbrium')!;
    expect(imbrium.title).toBe('Море Дождей');
    // Значения справочника USGS: 34,72° с. ш., 14,91° з. д., диаметр 1146 км
    expect(imbrium.lat).toBeCloseTo(34.72, 1);
    expect(imbrium.lon).toBeCloseTo(-14.91, 1);
    expect(imbrium.diameterKm).toBe(1146);
    const olympus = REGIONS.mars.find((r) => r.name === 'Olympus Mons')!;
    expect(olympus.title).toBe('Гора Олимп');
    expect(olympus.lat).toBeCloseTo(18.65, 1);
    expect(olympus.lon).toBeCloseTo(-133.8, 1);
  });
});
