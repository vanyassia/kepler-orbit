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
 * Гринвичское среднее звёздное время S — формула (11), docs/formulas.md.
 *
 * Звёздное время — угол между направлением на точку весеннего равноденствия ♈
 * (ось x АГЭСК) и плоскостью гринвичского меридиана (ось x_г ГСК).
 * Используется выражение МАС-1982 (Aoki et al., 1982):
 *
 *   S = 67310,54841 с + (876600·3600 + 8640184,812866)·T + 0,093104·T² − 6,2·10⁻⁶·T³,
 *   T = (JD − 2 451 545,0) / 36525 — юлианские столетия от эпохи J2000.0.
 *
 * Результат в секундах времени переводится в угол: 1 с = 15″ = 1/240°.
 * В пределах учебной модели принимаем UT1 ≈ UTC (|UT1 − UTC| < 0,9 с, ошибка < 0,004°).
 *
 * @param timeMs момент времени, мс Unix (UTC).
 * @returns S, рад, в диапазоне [0, 2π).
 */
export function greenwichSiderealTime(timeMs: number): number {
  const T = (julianDate(timeMs) - JD_J2000) / 36525;
  const seconds =
    67310.54841 + (876600 * 3600 + 8640184.812866) * T + 0.093104 * T * T - 6.2e-6 * T * T * T;
  return wrap2Pi((seconds / 240) * DEG);
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
