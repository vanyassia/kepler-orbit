import { DEG, JD_J2000, JD_UNIX_EPOCH, SECONDS_PER_DAY } from './constants';
import { wrap2Pi } from './math';

/**
 * Юлианская дата по моменту времени UTC.
 *
 * JD = t_Unix / 86400 + 2 440 587,5,
 * где t_Unix — число секунд от 1970-01-01 00:00 UTC.
 *
 * @param timeMs момент времени, миллисекунды Unix (как Date.getTime()).
 */
export function julianDate(timeMs: number): number {
  return timeMs / 1000 / SECONDS_PER_DAY + JD_UNIX_EPOCH;
}

/**
 * Юлианская дата 1 января (0 ч UTC) года year — по алгоритму Мееса для григорианского календаря.
 * Пример: 1 января 2026 г. → 2 461 041,5.
 */
export function julianDateJan1(year: number): number {
  const y = year - 1;
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * 14) + 1 + B - 1524.5;
}

/**
 * Шаг 4 листка. Юлианская дата эпохи TLE по году и номеру дня с дробной частью:
 *
 *   JD = JD₁ янв + (день − 1).
 *
 * Пример: «26299,20906838» → 2 461 041,5 + 298,20906838 = 2 461 339,70906838.
 */
export function julianDateFromTleEpoch(year: number, dayOfYear: number): number {
  return julianDateJan1(year) + (dayOfYear - 1);
}

/**
 * Шаг 4 листка. Угол поворота Земли (гринвичское звёздное время) S:
 *
 *   S = 280,46062° + 360,98564737°·(JD − 2 451 545,0)  (mod 360°).
 *
 * S — угол между направлением на точку весеннего равноденствия ♈ (от неё отсчитывается Ω)
 * и гринвичским меридианом. В пределах учебной модели принимаем UT1 ≈ UTC.
 *
 * @param timeMs момент времени, мс Unix (UTC).
 * @returns S, рад, в диапазоне [0, 2π).
 */
export function greenwichSiderealTime(timeMs: number): number {
  const deg = 280.46062 + 360.98564737 * (julianDate(timeMs) - JD_J2000);
  return wrap2Pi((deg % 360) * DEG);
}

/**
 * Разбор строки эпохи CelesTrak/OMM («2026-10-21T01:08:59.469792», время UTC без суффикса Z).
 * Стандартный Date.parse не гарантирует поддержку микросекунд, поэтому разбираем вручную
 * и сохраняем дробную часть миллисекунд.
 */
export function parseEpochUtc(epoch: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z?$/.exec(epoch.trim());
  if (!m) throw new Error(`Неверный формат эпохи: ${epoch}`);
  const [, y, mo, d, h, mi, s, frac = '0'] = m;
  const ms = Number(`0.${frac}`) * 1000;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) + ms;
}
