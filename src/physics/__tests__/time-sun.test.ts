import { describe, expect, it } from 'vitest';
import { DEG } from '../constants';
import { greenwichSiderealTime, julianDate, parseEpochUtc } from '../time';
import { subsolarPoint, sunElevationSin, sunPosition } from '../sun';

describe('Юлианская дата и звёздное время — формула (11)', () => {
  it('J2000.0: 2000-01-01 12:00 UTC → JD 2 451 545,0', () => {
    expect(julianDate(Date.UTC(2000, 0, 1, 12))).toBe(2451545.0);
  });

  it('S(J2000.0) = 280,46062° (свободный член формулы листка)', () => {
    expect(greenwichSiderealTime(Date.UTC(2000, 0, 1, 12)) / DEG).toBeCloseTo(280.46062, 6);
  });

  it('контрольный пример Vallado (Example 3-5): 1992-08-20 12:14 UT1 → S = 152,578788°', () => {
    expect(greenwichSiderealTime(Date.UTC(1992, 7, 20, 12, 14)) / DEG).toBeCloseTo(152.578788, 4);
  });

  it('за звёздные сутки (86 164,09 с) S возвращается к исходному значению', () => {
    const t0 = Date.UTC(2026, 9, 22);
    const d = greenwichSiderealTime(t0 + 86164.0905 * 1000) - greenwichSiderealTime(t0);
    expect(Math.abs(Math.sin(d / 2))).toBeLessThan(1e-5);
  });

  it('разбор эпохи CelesTrak с микросекундами', () => {
    const t = parseEpochUtc('2026-10-21T01:08:59.469792');
    expect(t).toBeCloseTo(Date.UTC(2026, 9, 21, 1, 8, 59) + 469.792, 6);
    expect(() => parseEpochUtc('21.10.2026')).toThrow();
  });
});

describe('Положение Солнца — формула (15)', () => {
  it('летнее солнцестояние 2024-06-20 20:51 UTC: δ☉ = +23,44°', () => {
    expect(sunPosition(Date.UTC(2024, 5, 20, 20, 51)).dec / DEG).toBeCloseTo(23.44, 1);
  });

  it('зимнее солнцестояние 2024-12-21 09:20 UTC: δ☉ = −23,44°', () => {
    expect(sunPosition(Date.UTC(2024, 11, 21, 9, 20)).dec / DEG).toBeCloseTo(-23.44, 1);
  });

  it('весеннее равноденствие 2024-03-20 03:06 UTC: δ☉ ≈ 0°, λ☉ ≈ 0°', () => {
    const s = sunPosition(Date.UTC(2024, 2, 20, 3, 6));
    expect(Math.abs(s.dec / DEG)).toBeLessThan(0.02);
    expect(Math.abs(Math.sin(s.eclipticLon))).toBeLessThan(0.0005);
  });

  it('в полдень по Гринвичу в равноденствие подсолнечная точка около нулевого меридиана', () => {
    // Уравнение времени 2024-03-20 ≈ −7,4 мин: истинное солнечное время в Гринвиче 11:52,6,
    // Солнце ещё не дошло до меридиана и стоит восточнее на 7,4 мин · 0,25°/мин ≈ +1,85°.
    const sub = subsolarPoint(Date.UTC(2024, 2, 20, 12, 0));
    expect(sub.lon / DEG).toBeGreaterThan(1);
    expect(sub.lon / DEG).toBeLessThan(3);
  });

  it('в подсолнечной точке Солнце в зените, в антиподе — в надире', () => {
    const sub = subsolarPoint(Date.UTC(2026, 9, 22, 9));
    expect(sunElevationSin(sub.lat, sub.lon, sub)).toBeCloseTo(1, 12);
    expect(sunElevationSin(-sub.lat, sub.lon + Math.PI, sub)).toBeCloseTo(-1, 12);
  });
});
