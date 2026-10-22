/**
 * Переход из АГЭСК во вращающуюся гринвичскую систему координат (ГСК)
 * и вычисление географических координат подспутниковой точки.
 * Формулы (12)–(14), docs/formulas.md.
 *
 * ГСК: начало в центре Земли, ось z — ось вращения Земли, ось x_г лежит
 * в плоскости гринвичского меридиана, система вращается вместе с Землёй.
 */
import { R_EARTH } from './constants';
import type { Vec3 } from './math';
import { wrapPi } from './math';

/**
 * Формула (12). Поворот АГЭСК → ГСК вокруг оси z на угол звёздного времени S:
 *
 *   x_г =  x·cos S + y·sin S,
 *   y_г = −x·sin S + y·cos S,
 *   z_г =  z.
 */
export function inertialToGreenwich(v: Vec3, S: number): Vec3 {
  const c = Math.cos(S);
  const s = Math.sin(S);
  return { x: v.x * c + v.y * s, y: -v.x * s + v.y * c, z: v.z };
}

/** Обратный поворот ГСК → АГЭСК (на угол −S). */
export function greenwichToInertial(v: Vec3, S: number): Vec3 {
  const c = Math.cos(S);
  const s = Math.sin(S);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

/** Географические координаты подспутниковой точки. */
export interface GeoPoint {
  /** Широта φ, рад, [−π/2, π/2]. */
  lat: number;
  /** Долгота λ, рад, [−π, π), восточная — положительная. */
  lon: number;
  /** Высота над поверхностью шара h, км. */
  h: number;
}

/**
 * Формулы (13)–(14). Широта, долгота и высота по координатам в ГСК:
 *
 *   φ = arcsin(z_г / r),   λ = arctg(y_г / x_г) (с учётом квадранта),   h = r − R_З.
 *
 * Для шарообразной Земли геоцентрическая широта совпадает с географической.
 */
export function greenwichToGeo(v: Vec3, R = R_EARTH): GeoPoint {
  const r = Math.hypot(v.x, v.y, v.z);
  return {
    lat: Math.asin(v.z / r),
    lon: wrapPi(Math.atan2(v.y, v.x)),
    h: r - R,
  };
}

/** Обратная задача: точка с широтой φ, долготой λ и высотой h → координаты в ГСК, км. */
export function geoToGreenwich(lat: number, lon: number, h = 0, R = R_EARTH): Vec3 {
  const r = R + h;
  const cl = Math.cos(lat);
  return { x: r * cl * Math.cos(lon), y: r * cl * Math.sin(lon), z: r * Math.sin(lat) };
}
