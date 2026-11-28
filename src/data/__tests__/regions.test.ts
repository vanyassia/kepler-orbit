import { describe, expect, it } from 'vitest';
import { REGIONS } from '../regions';

describe('Регионы Луны, Марса и Венеры (справочник USGS, названия IAU)', () => {
  it('у Земли регионов нет, у Луны, Марса и Венеры — десятки', () => {
    expect(REGIONS.earth).toHaveLength(0);
    expect(REGIONS.moon.length).toBeGreaterThan(50);
    expect(REGIONS.mars.length).toBeGreaterThan(50);
    expect(REGIONS.venus.length).toBeGreaterThan(50);
    expect(REGIONS.mercury.length).toBeGreaterThan(20);
  });

  it('координаты и размеры корректны, у каждого — русская подпись', () => {
    for (const r of [...REGIONS.moon, ...REGIONS.mars, ...REGIONS.venus]) {
      expect(Math.abs(r.lat)).toBeLessThanOrEqual(90);
      expect(r.lon).toBeGreaterThanOrEqual(-180);
      expect(r.lon).toBeLessThanOrEqual(180);
      expect(r.diameterKm).toBeGreaterThan(100);
      expect(r.title).toMatch(/[А-Яа-яЁё]/);
    }
  });

  it('контрольные объекты: Море Дождей, Гора Олимп и Горы Максвелла на своих местах', () => {
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
    const maxwell = REGIONS.venus.find((r) => r.name === 'Maxwell Montes')!;
    expect(maxwell.title).toBe('Горы Максвелла');
    expect(maxwell.lat).toBeCloseTo(65.2, 1);
    expect(maxwell.lon).toBeCloseTo(3.3, 1);
  });

  it('бассейн Равнины Жары на Меркурии находится на 162° в. д.', () => {
    const caloris = REGIONS.mercury.find((r) => r.name === 'Caloris Planitia')!;
    expect(caloris.title).toBe('Равнина Жары');
    expect(caloris.lat).toBeCloseTo(31.65, 1);
    expect(caloris.lon).toBeCloseTo(161.98, 1);
  });
});
