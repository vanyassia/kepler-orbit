/**
 * Фасад физического ядра: «начальные элементы + момент времени → полное состояние КА».
 *
 * Последовательность вычислений (docs/formulas.md):
 *   N → n (1) → a (2) → T, p (3) → M (4) → E (5) → ϑ (6) → r (7) → u (8)
 *     → x, y, z в АГЭСК (9) → V_r, V_n, V (10) → S (11) → x_г, y_г, z_г (12) → φ, λ, h (13–14).
 *
 * Этот интерфейс оставлен общим: в дальнейшем рядом можно поставить
 * второй пропагатор (например, SGP4) для сравнения трасс.
 */
import { DEG, TWO_PI } from './constants';
import type { Vec3 } from './math';
import { wrap2Pi } from './math';
import {
  focalParameter,
  meanAnomalyAt,
  meanMotionFromRevPerDay,
  orbitalPeriod,
  radiusFromEccentric,
  semiMajorAxis,
  solveKepler,
  trueAnomalyFromEccentric,
} from './kepler';
import { argumentOfLatitude, inertialPosition, inertialVelocity, velocityComponents } from './orbit';
import { greenwichToGeo, inertialToGreenwich } from './frames';
import { greenwichSiderealTime } from './time';
import { R_EARTH } from './constants';

/**
 * Начальные элементы орбиты на эпоху t₀ — ровно то, что берётся из каталога CelesTrak.
 * Углы — в градусах, как в исходных данных.
 */
export interface OrbitalElements {
  name: string;
  noradId: number;
  /** Международное обозначение (COSPAR), например «1998-067A». */
  cosparId?: string;
  /** Эпоха элементов t₀, мс Unix (UTC). */
  epochMs: number;
  /** Среднее движение N, об/сут. */
  meanMotion: number;
  /** Эксцентриситет e. */
  eccentricity: number;
  /** Наклонение i, °. */
  inclinationDeg: number;
  /** Долгота восходящего узла Ω, °. */
  raanDeg: number;
  /** Аргумент перицентра ω, °. */
  argPerigeeDeg: number;
  /** Средняя аномалия на эпоху M₀, °. */
  meanAnomalyDeg: number;
}

/** Элементы, приведённые к радианам, и производные постоянные орбиты. */
export interface PreparedOrbit {
  elements: OrbitalElements;
  epochMs: number;
  /** Среднее движение n, рад/с. */
  n: number;
  /** Большая полуось a, км. */
  a: number;
  e: number;
  /** Фокальный параметр p, км. */
  p: number;
  /** Период T, с. */
  T: number;
  /** Наклонение i, рад. */
  i: number;
  /** Долгота восходящего узла Ω, рад. */
  raan: number;
  /** Аргумент перицентра ω, рад. */
  omega: number;
  /** Средняя аномалия на эпоху M₀, рад. */
  M0: number;
  /** Радиусы перицентра и апоцентра r_π = a(1 − e), r_α = a(1 + e), км. */
  rPerigee: number;
  rApogee: number;
  /** Высоты перигея и апогея над шаром, км. */
  hPerigee: number;
  hApogee: number;
}

export function prepareOrbit(el: OrbitalElements): PreparedOrbit {
  const n = meanMotionFromRevPerDay(el.meanMotion);
  const a = semiMajorAxis(n);
  const e = el.eccentricity;
  return {
    elements: el,
    epochMs: el.epochMs,
    n,
    a,
    e,
    p: focalParameter(a, e),
    T: orbitalPeriod(a),
    i: el.inclinationDeg * DEG,
    raan: el.raanDeg * DEG,
    omega: el.argPerigeeDeg * DEG,
    M0: el.meanAnomalyDeg * DEG,
    rPerigee: a * (1 - e),
    rApogee: a * (1 + e),
    hPerigee: a * (1 - e) - R_EARTH,
    hApogee: a * (1 + e) - R_EARTH,
  };
}

/** Полное состояние КА в момент t (все промежуточные величины — для пояснений в UI). */
export interface SatelliteState {
  timeMs: number;
  /** t − t₀, с. */
  dt: number;
  /** Номер витка от эпохи (целая часть (M₀ + n·Δt)/2π). */
  revolution: number;
  M: number;
  E: number;
  keplerIterations: number;
  /** Истинная аномалия ϑ, рад. */
  theta: number;
  r: number;
  u: number;
  /** Положение и скорость в АГЭСК, км и км/с. */
  eci: Vec3;
  vEci: Vec3;
  Vr: number;
  Vn: number;
  V: number;
  /** Гринвичское звёздное время S, рад. */
  S: number;
  /** Положение в ГСК, км. */
  ecef: Vec3;
  /** Широта и долгота подспутниковой точки, рад; высота, км. */
  lat: number;
  lon: number;
  h: number;
}

export function propagate(orbit: PreparedOrbit, timeMs: number): SatelliteState {
  const dt = (timeMs - orbit.epochMs) / 1000;
  const revolution = Math.floor((orbit.M0 + orbit.n * dt) / TWO_PI);
  const M = meanAnomalyAt(orbit.M0, orbit.n, dt); // (4)
  const { E, iterations } = solveKepler(M, orbit.e); // (5)
  const theta = trueAnomalyFromEccentric(E, orbit.e); // (6)
  const r = radiusFromEccentric(orbit.a, orbit.e, E); // (7)
  const u = argumentOfLatitude(orbit.omega, theta); // (8)
  const eci = inertialPosition(r, u, orbit.raan, orbit.i); // (9)
  const { Vr, Vn, V } = velocityComponents(orbit.p, orbit.e, theta); // (10)
  const vEci = inertialVelocity(Vr, Vn, u, orbit.raan, orbit.i);
  const S = greenwichSiderealTime(timeMs); // (11)
  const ecef = inertialToGreenwich(eci, S); // (12)
  const { lat, lon, h } = greenwichToGeo(ecef); // (13)–(14)
  return { timeMs, dt, revolution, M, E, keplerIterations: iterations, theta, r, u, eci, vEci, Vr, Vn, V, S, ecef, lat, lon, h };
}

/**
 * Положение КА в АГЭСК при заданной истинной аномалии (без привязки ко времени).
 * Используется для построения эллипса орбиты и характерных точек.
 */
export function positionAtTrueAnomaly(orbit: PreparedOrbit, theta: number): Vec3 {
  const r = orbit.p / (1 + orbit.e * Math.cos(theta));
  return inertialPosition(r, argumentOfLatitude(orbit.omega, theta), orbit.raan, orbit.i);
}

/**
 * Замкнутый эллипс орбиты в АГЭСК (в задаче двух тел он неподвижен в инерциальном пространстве).
 * Точки равномерны по эксцентрической аномалии E — так они гуще у перицентра,
 * где КА движется быстрее и кривизна больше.
 */
export function orbitEllipse(orbit: PreparedOrbit, segments = 256): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * TWO_PI;
    pts.push(positionAtTrueAnomaly(orbit, trueAnomalyFromEccentric(E, orbit.e)));
  }
  return pts;
}

/**
 * Средняя аномалия, соответствующая истинной ϑ (обращение формул (6) и (5)):
 *   E = 2·atan2(√(1 − e)·sin(ϑ/2), √(1 + e)·cos(ϑ/2)),   M = E − e·sin E.
 */
export function meanAnomalyFromTrue(theta: number, e: number): number {
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(theta / 2), Math.sqrt(1 + e) * Math.cos(theta / 2));
  return wrap2Pi(E - e * Math.sin(E));
}

/**
 * Моменты прохождения восходящего узла (u = 0, т. е. ϑ = −ω) в интервале [t1, t2].
 * Восходящий узел — традиционное начало витка; используется для засечек на шкале времени.
 */
export function ascendingNodeTimes(orbit: PreparedOrbit, t1Ms: number, t2Ms: number): number[] {
  const Mnode = meanAnomalyFromTrue(wrap2Pi(-orbit.omega), orbit.e);
  const periodMs = orbit.T * 1000;
  // Ближайший момент M = M_узла после эпохи, затем сдвиг на целое число периодов
  const firstAfterEpoch = orbit.epochMs + (wrap2Pi(Mnode - orbit.M0) / orbit.n) * 1000;
  const k0 = Math.ceil((t1Ms - firstAfterEpoch) / periodMs);
  const times: number[] = [];
  for (let k = k0; ; k++) {
    const t = firstAfterEpoch + k * periodMs;
    if (t > t2Ms) break;
    times.push(t);
  }
  return times;
}
