/**
 * Пролёты над точкой: когда подспутниковая точка ближе всего подходит к выбранному месту.
 *
 * Модель не меняется: идём по той же трассе (subPointAt — шаги листка) и ищем моменты,
 * когда расстояние по поверхности тела от подспутниковой точки до места проходит через минимум.
 *   1. Трасса просматривается с шагом T/360 (не меньше 5 с и не больше 60 с).
 *   2. Точка сетки, где расстояние меньше, чем у обеих соседних, — грубый минимум.
 *   3. Минимум уточняется методом золотого сечения между соседними точками сетки (до 0,05 с).
 * Расстояние — по дуге большого круга: d = R·σ, где σ — центральный угол между точками
 * (формула гаверсинусов, точна и для малых углов).
 */
import { DEG, RAD } from './constants';
import type { PreparedOrbit } from './propagate';
import { propagate, subPointAt } from './propagate';

/** Место на поверхности, градусы. */
export interface GeoTarget {
  lat: number;
  lon: number;
}

export interface Pass {
  /** Момент наибольшего сближения, мс Unix (UTC). */
  timeMs: number;
  /** Наименьшее расстояние от подспутниковой точки до места по поверхности тела, км. */
  distanceKm: number;
  /** Номер витка от эпохи (как в боковой панели и в выгрузке). */
  revolution: number;
  /** Подспутниковая точка в этот момент: широта и долгота, °; высота, км. */
  lat: number;
  lon: number;
  h: number;
  /** Спутник идёт на север (широта растёт). */
  northbound: boolean;
}

export interface PassSearch {
  /** Пролёты ближе заданного расстояния, по времени. */
  passes: Pass[];
  /** Самое близкое сближение за весь интервал (даже если оно дальше заданного расстояния); null — минимумов нет. */
  closest: Pass | null;
  /** Список обрезан по числу пролётов: за интервал их больше. */
  truncated: boolean;
}

export interface PassOptions {
  /** Показывать пролёты не дальше стольких километров. */
  maxDistanceKm: number;
  /** Сколько пролётов вернуть (по умолчанию 50). */
  maxCount?: number;
}

/** Предел числа точек просмотра: при большем интервале шаг растёт. */
const MAX_SAMPLES = 120_000;

/** Центральный угол между двумя точками сферы, рад (формула гаверсинусов). Аргументы в радианах. */
export function centralAngle(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const s1 = Math.sin((lat2 - lat1) / 2);
  const s2 = Math.sin((lon2 - lon1) / 2);
  const a = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Шаг просмотра трассы, с: T/360, не меньше 5 с и не больше 60 с. */
export function passStepSeconds(orbit: PreparedOrbit): number {
  return Math.min(60, Math.max(5, orbit.T / 360));
}

/**
 * Все пролёты над местом target на интервале [fromMs, toMs].
 * Пролёт — местный минимум расстояния от подспутниковой точки до места.
 */
export function findPasses(orbit: PreparedOrbit, target: GeoTarget, fromMs: number, toMs: number, opts: PassOptions): PassSearch {
  const R = orbit.body.radius;
  const tLat = target.lat * DEG;
  const tLon = target.lon * DEG;
  const dist = (t: number) => {
    const p = subPointAt(orbit, t);
    return centralAngle(p.lat, p.lon, tLat, tLon);
  };
  const maxCount = opts.maxCount ?? 50;
  const stepMs = Math.max(passStepSeconds(orbit) * 1000, (toMs - fromMs) / MAX_SAMPLES);

  const found: Pass[] = [];
  let closest: Pass | null = null;
  let truncated = false;
  // Скользящее окно из трёх соседних точек сетки: (ta, da) — (tb, db) — (tc, dc)
  let ta = fromMs - stepMs;
  let da = dist(ta);
  let tb = fromMs;
  let db = dist(tb);
  for (let tc = fromMs + stepMs; tb < toMs; tc += stepMs) {
    const dc = dist(tc);
    // Порог 1e-9 рад (≈ 6 мм): у неподвижной подспутниковой точки шум округления не считается минимумом
    if (db < da - 1e-9 && db <= dc) {
      const t = goldenMin(dist, ta, tc);
      if (t >= fromMs && t <= toMs) {
        const pass = makePass(orbit, t, dist(t) * R);
        if (!closest || pass.distanceKm < closest.distanceKm) closest = pass;
        if (pass.distanceKm <= opts.maxDistanceKm) {
          if (found.length < maxCount) found.push(pass);
          else truncated = true;
        }
      }
    }
    ta = tb;
    da = db;
    tb = tc;
    db = dc;
  }
  return { passes: found, closest, truncated };
}

/** Минимум унимодальной функции на [a, b] методом золотого сечения (до 0,05 с). */
function goldenMin(f: (t: number) => number, a: number, b: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a);
  let x2 = a + g * (b - a);
  let f1 = f(x1);
  let f2 = f(x2);
  while (b - a > 50) {
    if (f1 <= f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = b - g * (b - a);
      f1 = f(x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = a + g * (b - a);
      f2 = f(x2);
    }
  }
  return (a + b) / 2;
}

function makePass(orbit: PreparedOrbit, t: number, distanceKm: number): Pass {
  const s = propagate(orbit, t);
  // Направление движения по широте — по точке на секунду позже
  const next = subPointAt(orbit, t + 1000);
  return {
    timeMs: t,
    distanceKm,
    revolution: s.revolution,
    lat: s.lat * RAD,
    lon: s.lon * RAD,
    h: s.h,
    northbound: next.lat > s.lat,
  };
}

/**
 * Окружность радиуса distanceKm вокруг места на поверхности тела радиуса R (геодезический круг),
 * для отрисовки на карте: n + 1 точек [широта, долгота] в градусах, долгота в (−180°, 180°].
 * Точка на азимуте A: sin φ = sin φ₀·cos σ + cos φ₀·sin σ·cos A,
 *                     λ = λ₀ + atan2(sin A·sin σ·cos φ₀, cos σ − sin φ₀·sin φ).
 */
export function circleAround(target: GeoTarget, distanceKm: number, R: number, n = 128): [number, number][] {
  const sigma = Math.min(Math.PI, distanceKm / R);
  const lat0 = target.lat * DEG;
  const lon0 = target.lon * DEG;
  const pts: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const A = (k / n) * 2 * Math.PI;
    const sinLat = Math.sin(lat0) * Math.cos(sigma) + Math.cos(lat0) * Math.sin(sigma) * Math.cos(A);
    const lat = Math.asin(Math.max(-1, Math.min(1, sinLat)));
    const lon = lon0 + Math.atan2(Math.sin(A) * Math.sin(sigma) * Math.cos(lat0), Math.cos(sigma) - Math.sin(lat0) * sinLat);
    let lonDeg = (lon * RAD) % 360;
    if (lonDeg > 180) lonDeg -= 360;
    if (lonDeg <= -180) lonDeg += 360;
    pts.push([lat * RAD, lonDeg]);
  }
  return pts;
}
