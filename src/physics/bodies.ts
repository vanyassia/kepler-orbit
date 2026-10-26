/**
 * Центральные тела: Земля, Луна, Марс — формулы (18)–(20), docs/formulas.md.
 *
 * Для каждого тела модель одна и та же — задача двух тел с его гравитационным параметром μ.
 * Различаются:
 *  - инерциальная система: для Земли — АГЭСК (ось x на ♈); для Луны и Марса — система
 *    «экватор тела и узел» (IAU): ось z — северный полюс тела, ось x — восходящий узел
 *    экватора тела на экваторе ICRF (в этой системе выдаёт элементы JPL Horizons);
 *  - угол поворота тела: для Земли — звёздное время S, для Луны и Марса — угол W
 *    нулевого меридиана, отсчитываемый от того же узла (рекомендации IAU 2009, PCK00010);
 *  - направление на Солнце (только для освещения).
 */
import { DEG, JD_J2000, MU, R_EARTH } from './constants';
import { solveKepler } from './kepler';
import type { Vec3 } from './math';
import { wrap2Pi } from './math';
import { sunDirectionInertial } from './sun';
import { greenwichToInertial, inertialToGreenwich } from './frames';
import { greenwichSiderealTime, julianDate } from './time';

export type BodyId = 'earth' | 'moon' | 'mars';

export interface CentralBody {
  id: BodyId;
  /** Название в именительном и предложном падеже: «Луна», «на Луне». */
  name: string;
  nameLocative: string;
  /** Гравитационный параметр μ, км³/с². */
  mu: number;
  /** Средний радиус шара, км. */
  radius: number;
  /** Угол поворота тела (S для Земли, W для Луны и Марса), рад. */
  rotationAngle: (timeMs: number) => number;
  /** Формула (12)/(20): инерциальная система тела → система, вращающаяся с телом. */
  toFixed: (v: Vec3, timeMs: number) => Vec3;
  /** Обратный переход: вращающаяся система → инерциальная. */
  toInertial: (v: Vec3, timeMs: number) => Vec3;
  /** Единичный вектор на Солнце в инерциальной системе тела. */
  sunDirection: (timeMs: number) => Vec3;
  /** Обозначение угла поворота в формулах. */
  rotationSymbol: 'S' | 'W';
}

/** Дни от J2000.0 и юлианские столетия (TDB ≈ UTC — разница 69 с несущественна для модели). */
const days = (t: number) => julianDate(t) - JD_J2000;

const unit = (ra: number, dec: number): Vec3 => ({
  x: Math.cos(dec) * Math.cos(ra),
  y: Math.cos(dec) * Math.sin(ra),
  z: Math.sin(dec),
});

/**
 * Формула (18). Переход из ICRF (экваториальной системы Земли) в систему «экватор тела и узел»
 * по прямому восхождению α₀ и склонению δ₀ северного полюса тела:
 *   e_z = (cos δ₀ cos α₀, cos δ₀ sin α₀, sin δ₀),  e_x = (−sin α₀, cos α₀, 0),  e_y = e_z × e_x.
 */
export function icrfToBodyEquator(v: Vec3, alpha0: number, delta0: number): Vec3 {
  const ez = unit(alpha0, delta0);
  const ex = { x: -Math.sin(alpha0), y: Math.cos(alpha0), z: 0 };
  const ey = { x: ez.y * ex.z - ez.z * ex.y, y: ez.z * ex.x - ez.x * ex.z, z: ez.x * ex.y - ez.y * ex.x };
  return {
    x: v.x * ex.x + v.y * ex.y + v.z * ex.z,
    y: v.x * ey.x + v.y * ey.y + v.z * ey.z,
    z: v.x * ez.x + v.y * ez.y + v.z * ez.z,
  };
}

/** Обратный переход: система «экватор тела и узел» → ICRF. */
export function bodyEquatorToIcrf(v: Vec3, alpha0: number, delta0: number): Vec3 {
  const ez = unit(alpha0, delta0);
  const ex = { x: -Math.sin(alpha0), y: Math.cos(alpha0), z: 0 };
  const ey = { x: ez.y * ex.z - ez.z * ex.y, y: ez.z * ex.x - ez.x * ex.z, z: ez.x * ex.y - ez.y * ex.x };
  return {
    x: v.x * ex.x + v.y * ey.x + v.z * ez.x,
    y: v.x * ex.y + v.y * ey.y + v.z * ez.y,
    z: v.x * ex.z + v.y * ey.z + v.z * ez.z,
  };
}

/** Ориентация Луны по IAU 2009 (главные члены): α₀, δ₀, W в радианах. */
export function moonOrientation(timeMs: number): { alpha0: number; delta0: number; W: number } {
  const d = days(timeMs);
  const T = d / 36525;
  const E1 = (125.045 - 0.0529921 * d) * DEG;
  const E2 = (250.089 - 0.1059842 * d) * DEG;
  const E3 = (260.008 + 13.0120009 * d) * DEG;
  const E4 = (176.625 + 13.3407154 * d) * DEG;
  const alpha0 = 269.9949 + 0.0031 * T - 3.8787 * Math.sin(E1) - 0.1204 * Math.sin(E2) + 0.07 * Math.sin(E3) - 0.0172 * Math.sin(E4);
  const delta0 = 66.5392 + 0.013 * T + 1.5419 * Math.cos(E1) + 0.0239 * Math.cos(E2) - 0.0278 * Math.cos(E3) + 0.0068 * Math.cos(E4);
  const W =
    38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.561 * Math.sin(E1) + 0.1208 * Math.sin(E2) - 0.0642 * Math.sin(E3) + 0.0158 * Math.sin(E4);
  return { alpha0: alpha0 * DEG, delta0: delta0 * DEG, W: wrap2Pi(W * DEG) };
}

/** Ориентация Марса по IAU 2009: α₀ = 317,68143° − 0,1061°T, δ₀ = 52,8865° − 0,0609°T, W = 176,63° + 350,89198226°·d. */
export function marsOrientation(timeMs: number): { alpha0: number; delta0: number; W: number } {
  const d = days(timeMs);
  const T = d / 36525;
  return {
    alpha0: (317.68143 - 0.1061 * T) * DEG,
    delta0: (52.8865 - 0.0609 * T) * DEG,
    W: wrap2Pi((176.63 + 350.89198226 * d) * DEG),
  };
}

/**
 * Полюс Марса по IAU 2015 — относительно него JPL Horizons выдаёт элементы орбит
 * («IAU_MARS body equator and node of date»), тогда как вращение (W) и подспутниковые точки
 * Horizons считает по IAU 2009. Поэтому для Марса переход во вращающуюся систему включает
 * поворот между двумя полюсами (≈ 1,5°) — формула (20). Проверено по Horizons (bodies.test.ts).
 */
export function marsPole2015(timeMs: number): { alpha0: number; delta0: number } {
  const T = days(timeMs) / 36525;
  return { alpha0: (317.269202 - 0.10927547 * T) * DEG, delta0: (54.432516 - 0.05827105 * T) * DEG };
}

/**
 * Формула (19). Гелиоцентрическое положение Марса по приближённым элементам орбиты
 * (Standish, JPL «Approximate Positions of the Planets», 1800–2050 гг.), в ICRF, а. е.
 * Решается то же уравнение Кеплера (5), что и для спутников.
 */
export function marsHeliocentric(timeMs: number): Vec3 {
  const T = days(timeMs) / 36525;
  const a = 1.52371034 + 0.00001847 * T;
  const e = 0.0933941 + 0.00007882 * T;
  const I = (1.84969142 - 0.00813131 * T) * DEG;
  const L = (-4.55343205 + 19140.30268499 * T) * DEG;
  const varpi = (-23.94362959 + 0.44441088 * T) * DEG;
  const Om = (49.55953891 - 0.29257343 * T) * DEG;
  const omega = varpi - Om;
  const { E } = solveKepler(wrap2Pi(L - varpi), e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  // Поворот из плоскости орбиты в эклиптику J2000 (те же повороты, что в формуле (9))
  const cw = Math.cos(omega);
  const sw = Math.sin(omega);
  const cO = Math.cos(Om);
  const sO = Math.sin(Om);
  const cI = Math.cos(I);
  const sI = Math.sin(I);
  const xe = (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp;
  const ye = (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp;
  const ze = sw * sI * xp + cw * sI * yp;
  // Эклиптика J2000 → экватор J2000 (наклон эклиптики 23,43928°)
  const eps = 23.43928 * DEG;
  return { x: xe, y: ye * Math.cos(eps) - ze * Math.sin(eps), z: ye * Math.sin(eps) + ze * Math.cos(eps) };
}

const normalize = (v: Vec3): Vec3 => {
  const r = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / r, y: v.y / r, z: v.z / r };
};

export const EARTH: CentralBody = {
  id: 'earth',
  name: 'Земля',
  nameLocative: 'на Земле',
  mu: MU,
  radius: R_EARTH,
  rotationAngle: greenwichSiderealTime,
  toFixed: (v, t) => inertialToGreenwich(v, greenwichSiderealTime(t)),
  toInertial: (v, t) => greenwichToInertial(v, greenwichSiderealTime(t)),
  sunDirection: sunDirectionInertial,
  rotationSymbol: 'S',
};

export const MOON: CentralBody = {
  id: 'moon',
  name: 'Луна',
  nameLocative: 'на Луне',
  mu: 4902.800066,
  radius: 1737.4,
  rotationAngle: (t) => moonOrientation(t).W,
  toFixed: (v, t) => inertialToGreenwich(v, moonOrientation(t).W),
  toInertial: (v, t) => greenwichToInertial(v, moonOrientation(t).W),
  // С Луны Солнце видно практически по тому же направлению, что и с Земли (параллакс < 0,15°)
  sunDirection: (t) => {
    const { alpha0, delta0 } = moonOrientation(t);
    return icrfToBodyEquator(sunDirectionInertial(t), alpha0, delta0);
  },
  rotationSymbol: 'W',
};

export const MARS: CentralBody = {
  id: 'mars',
  name: 'Марс',
  nameLocative: 'на Марсе',
  mu: 42828.37,
  radius: 3389.5,
  rotationAngle: (t) => marsOrientation(t).W,
  // Формула (20): система элементов (полюс IAU 2015) → ICRF → экватор IAU 2009 → поворот на W
  toFixed: (v, t) => {
    const p = marsPole2015(t);
    const m = marsOrientation(t);
    return inertialToGreenwich(icrfToBodyEquator(bodyEquatorToIcrf(v, p.alpha0, p.delta0), m.alpha0, m.delta0), m.W);
  },
  toInertial: (v, t) => {
    const p = marsPole2015(t);
    const m = marsOrientation(t);
    return icrfToBodyEquator(bodyEquatorToIcrf(greenwichToInertial(v, m.W), m.alpha0, m.delta0), p.alpha0, p.delta0);
  },
  sunDirection: (t) => {
    const { alpha0, delta0 } = marsPole2015(t);
    const r = marsHeliocentric(t);
    return icrfToBodyEquator(normalize({ x: -r.x, y: -r.y, z: -r.z }), alpha0, delta0);
  },
  rotationSymbol: 'W',
};

export const BODIES: Record<BodyId, CentralBody> = { earth: EARTH, moon: MOON, mars: MARS };

/** Звёздные сутки тела (период вращения), с — для справки в интерфейсе. */
export const ROTATION_PERIOD: Record<BodyId, number> = {
  earth: 86164.0905,
  moon: (360 / 13.17635815) * 86400,
  mars: (360 / 350.89198226) * 86400,
};

