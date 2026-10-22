/**
 * Видимое положение Солнца — формула (15), docs/formulas.md.
 *
 * Нужна только для изображения освещённости (терминатор на карте, освещение глобуса);
 * на движение КА Солнце в модели не влияет.
 *
 * Используется упрощённый алгоритм «Астрономического ежегодника»
 * (Astronomical Almanac, раздел C), точность ≈ 0,01° в 1950–2050 гг.:
 *
 *   n = JD − 2 451 545,0
 *   L = 280,460° + 0,9856474°·n               — средняя долгота Солнца
 *   g = 357,528° + 0,9856003°·n               — средняя аномалия Солнца
 *   λ☉ = L + 1,915°·sin g + 0,020°·sin 2g      — эклиптическая долгота
 *   ε = 23,439° − 0,0000004°·n                — наклон эклиптики к экватору
 *   α☉ = atan2(cos ε·sin λ☉, cos λ☉),  δ☉ = arcsin(sin ε·sin λ☉).
 */
import { DEG, JD_J2000 } from './constants';
import type { Vec3 } from './math';
import { wrap2Pi, wrapPi } from './math';
import { greenwichSiderealTime, julianDate } from './time';

export interface SunPosition {
  /** Прямое восхождение α☉, рад, [0, 2π). */
  ra: number;
  /** Склонение δ☉, рад. */
  dec: number;
  /** Эклиптическая долгота λ☉, рад. */
  eclipticLon: number;
  /** Расстояние до Солнца, а. е. */
  distanceAu: number;
}

export function sunPosition(timeMs: number): SunPosition {
  const n = julianDate(timeMs) - JD_J2000;
  const L = (280.46 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const distanceAu = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return { ra: wrap2Pi(ra), dec, eclipticLon: wrap2Pi(lambda), distanceAu };
}

/** Единичный вектор направления на Солнце в АГЭСК. */
export function sunDirectionInertial(timeMs: number): Vec3 {
  const { ra, dec } = sunPosition(timeMs);
  const cd = Math.cos(dec);
  return { x: cd * Math.cos(ra), y: cd * Math.sin(ra), z: Math.sin(dec) };
}

/**
 * Подсолнечная точка (Солнце в зените):
 *
 *   φ☉ = δ☉,   λ☉ = α☉ − S.
 *
 * @returns широта и долгота, рад.
 */
export function subsolarPoint(timeMs: number): { lat: number; lon: number } {
  const { ra, dec } = sunPosition(timeMs);
  return { lat: dec, lon: wrapPi(ra - greenwichSiderealTime(timeMs)) };
}

/**
 * Синус высоты Солнца над горизонтом в точке (φ, λ):
 *
 *   sin h☉ = sin φ·sin φ☉ + cos φ·cos φ☉·cos(λ − λ☉).
 *
 * h☉ > 0 — день, h☉ < 0 — ночь; h☉ = 0 — терминатор.
 */
export function sunElevationSin(lat: number, lon: number, sub: { lat: number; lon: number }): number {
  return Math.sin(lat) * Math.sin(sub.lat) + Math.cos(lat) * Math.cos(sub.lat) * Math.cos(lon - sub.lon);
}
