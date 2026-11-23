/**
 * Центральные тела: Земля, Луна, Марс, Венера, Сатурн — формулы (18)–(20), docs/formulas.md.
 *
 * Для каждого тела модель одна и та же — задача двух тел с его гравитационным параметром μ.
 * Различаются:
 *  - инерциальная система: для Земли — АГЭСК (ось x на ♈); для остальных тел — система
 *    «экватор тела и узел» (IAU): ось z — северный полюс тела, ось x — восходящий узел
 *    экватора тела на экваторе ICRF (в этой системе выдаёт элементы JPL Horizons);
 *  - угол поворота тела: для Земли — звёздное время S, для остальных — угол W
 *    нулевого меридиана, отсчитываемый от того же узла (рекомендации IAU 2009, PCK00010);
 *    у Венеры вращение обратное (Ẇ < 0);
 *  - направление на Солнце (только для освещения).
 */
import { DEG, JD_J2000, MU, OMEGA_EARTH, R_EARTH } from './constants';
import { solveKepler } from './kepler';
import type { Vec3 } from './math';
import { wrap2Pi, wrapPi } from './math';
import { sunDirectionInertial } from './sun';
import { greenwichToInertial, inertialToGreenwich } from './frames';
import { greenwichSiderealTime, julianDate } from './time';

export type BodyId = 'earth' | 'moon' | 'mars' | 'venus' | 'saturn';

export interface CentralBody {
  id: BodyId;
  /** Название в именительном и предложном падеже: «Луна», «на Луне». */
  name: string;
  nameLocative: string;
  /** Гравитационный параметр μ, км³/с². */
  mu: number;
  /** Опорный радиус для расчёта высоты, км. У Сатурна — экваториальный. */
  radius: number;
  /** Угол поворота тела (S для Земли, W для Луны и Марса), рад. */
  rotationAngle: (timeMs: number) => number;
  /**
   * Шаг 5.7 листка: поворот тела за время от эпохи t₀ до t, рад.
   * Для Земли Δ = ω_З · t; для Луны и Марса — приращение угла W (у Луны есть малые колебания).
   */
  turn: (epochMs: number, timeMs: number) => number;
  /** Поворот на S или W (у Марса — ещё формула (20)): инерциальная система тела → система, вращающаяся с телом. */
  toFixed: (v: Vec3, timeMs: number) => Vec3;
  /** Обратный переход: вращающаяся система → инерциальная. */
  toInertial: (v: Vec3, timeMs: number) => Vec3;
  /** Единичный вектор на Солнце в инерциальной системе тела. */
  sunDirection: (timeMs: number) => Vec3;
  /** Обозначение угла поворота в формулах. */
  rotationSymbol: 'S' | 'W';
}

/**
 * TDB − UTC, с: 32,184 с (TT − TAI) + 37 високосных секунд. Формулы IAU для Луны и Марса записаны
 * во времени TDB; без поправки Марс повёрнут на 69 с назад — подспутниковые точки сдвинуты на 0,28°
 * к востоку (найдено по Фобосу и Деймосу). Звёздное время Земли по листку считается по UT — его это не касается.
 */
const TDB_MINUS_UTC_SEC = 69.184;

/** Дни от J2000.0 в шкале TDB. */
const days = (t: number) => julianDate(t) - JD_J2000 + TDB_MINUS_UTC_SEC / 86400;

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
 * Ориентация Венеры по IAU 2009/2015: α₀ = 272,76°, δ₀ = 67,16°, W = 160,20° − 1,4813688°·d.
 * Венера вращается в обратную сторону (с востока на запад), поэтому скорость вращения Ẇ отрицательна.
 */
export function venusOrientation(timeMs: number): { alpha0: number; delta0: number; W: number } {
  const d = days(timeMs);
  return {
    alpha0: 272.76 * DEG,
    delta0: 67.16 * DEG,
    W: wrap2Pi((160.2 - 1.4813688 * d) * DEG),
  };
}

/**
 * Формула (19). Гелиоцентрическое положение планеты по приближённым элементам орбиты
 * (Standish, JPL «Approximate Positions of the Planets»), в ICRF, а. е.
 * Решается то же уравнение Кеплера (5), что и для спутников.
 */
function planetHeliocentric(
  timeMs: number,
  el: { a: [number, number]; e: [number, number]; I: [number, number]; L: [number, number]; varpi: [number, number]; Om: [number, number] },
): Vec3 {
  const T = days(timeMs) / 36525;
  const a = el.a[0] + el.a[1] * T;
  const e = el.e[0] + el.e[1] * T;
  const I = (el.I[0] + el.I[1] * T) * DEG;
  const L = (el.L[0] + el.L[1] * T) * DEG;
  const varpi = (el.varpi[0] + el.varpi[1] * T) * DEG;
  const Om = (el.Om[0] + el.Om[1] * T) * DEG;
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

/** Гелиоцентрическое положение Марса (Standish, JPL, 1800–2050 гг.), в ICRF, а. е. */
export const marsHeliocentric = (timeMs: number): Vec3 =>
  planetHeliocentric(timeMs, {
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    varpi: [-23.94362959, 0.44441088],
    Om: [49.55953891, -0.29257343],
  });

/** Гелиоцентрическое положение Венеры (Standish, JPL, таблица 2a: 3000 г. до н. э. — 3000 г. н. э.), в ICRF, а. е. */
export const venusHeliocentric = (timeMs: number): Vec3 =>
  planetHeliocentric(timeMs, {
    a: [0.72332102, -0.00000026],
    e: [0.00676399, -0.00005107],
    I: [3.39777545, 0.00043494],
    L: [181.9797085, 58517.8156026],
    varpi: [131.76755713, 0.05679648],
    Om: [76.67261496, -0.27274174],
  });

/**
 * Поворот тела от t₀ до t по углу W: основной член — равномерное вращение ẆΔd (с целыми оборотами),
 * к нему добавляется малая неравномерная часть (у Луны — до нескольких градусов).
 */
function turnSince(W: (t: number) => number, rateDegPerDay: number, t0: number, t: number): number {
  const linear = rateDegPerDay * DEG * ((t - t0) / 86_400_000);
  return linear + wrapPi(W(t) - W(t0) - linear);
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
  turn: (t0, t) => (OMEGA_EARTH * (t - t0)) / 1000,
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
  turn: (t0, t) => turnSince((x) => moonOrientation(x).W, 13.17635815, t0, t),
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
  turn: (t0, t) => turnSince((x) => marsOrientation(x).W, 350.89198226, t0, t),
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

export const VENUS: CentralBody = {
  id: 'venus',
  name: 'Венера',
  nameLocative: 'на Венере',
  mu: 324858.592,
  radius: 6051.8,
  rotationAngle: (t) => venusOrientation(t).W,
  turn: (t0, t) => turnSince((x) => venusOrientation(x).W, -1.4813688, t0, t),
  toFixed: (v, t) => inertialToGreenwich(v, venusOrientation(t).W),
  toInertial: (v, t) => greenwichToInertial(v, venusOrientation(t).W),
  sunDirection: (t) => {
    const { alpha0, delta0 } = venusOrientation(t);
    const r = venusHeliocentric(t);
    return icrfToBodyEquator(normalize({ x: -r.x, y: -r.y, z: -r.z }), alpha0, delta0);
  },
  rotationSymbol: 'W',
};

const SATURN_ROTATION = 810.7939024;

/** Ориентация IAU System III по NAIF PCK00011. */
export function saturnOrientation(t: number) {
  const d = days(t);
  const T = d / 36525;
  return {
    alpha0: (40.589 - 0.036 * T) * DEG,
    delta0: (83.537 - 0.004 * T) * DEG,
    W: wrap2Pi((38.9 + SATURN_ROTATION * d) * DEG),
  };
}

/** Гелиоцентрическое положение Сатурна, таблица JPL на 1800–2050 гг. */
const saturnHeliocentric = (t: number) => planetHeliocentric(t, {
  a: [9.53667594, -0.00125060],
  e: [0.05386179, -0.00050991],
  I: [2.48599187, 0.00193609],
  L: [49.95424423, 1222.49362201],
  varpi: [92.59887831, -0.41897216],
  Om: [113.66242448, -0.28867794],
});

export const SATURN: CentralBody = {
  id: 'saturn',
  name: 'Сатурн',
  nameLocative: 'на Сатурне',
  mu: 37931206.23,
  radius: 60268,
  rotationAngle: (t) => saturnOrientation(t).W,
  turn: (t0, t) => SATURN_ROTATION * DEG * ((t - t0) / 86_400_000),
  toFixed: (v, t) => inertialToGreenwich(v, saturnOrientation(t).W),
  toInertial: (v, t) => greenwichToInertial(v, saturnOrientation(t).W),
  sunDirection: (t) => {
    const { alpha0, delta0 } = saturnOrientation(t);
    const r = saturnHeliocentric(t);
    return icrfToBodyEquator(normalize({ x: -r.x, y: -r.y, z: -r.z }), alpha0, delta0);
  },
  rotationSymbol: 'W',
};

export const BODIES: Record<BodyId, CentralBody> = { earth: EARTH, moon: MOON, mars: MARS, venus: VENUS, saturn: SATURN };
export const BODY_IDS = Object.keys(BODIES) as BodyId[];

export function isBodyId(value: unknown): value is BodyId {
  return typeof value === 'string' && Object.hasOwn(BODIES, value);
}

/** Звёздные сутки тела (период вращения), с — для справки в интерфейсе. */
export const ROTATION_PERIOD: Record<BodyId, number> = {
  earth: 86164.0905,
  moon: (360 / 13.17635815) * 86400,
  mars: (360 / 350.89198226) * 86400,
  venus: (360 / 1.4813688) * 86400,
  saturn: (360 / SATURN_ROTATION) * 86400,
};

