import { TWO_PI } from './constants';

/** Трёхмерный вектор (км или км/с). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Приведение угла к диапазону [0, 2π). */
export function wrap2Pi(angle: number): number {
  const a = angle % TWO_PI;
  return a < 0 ? a + TWO_PI : a;
}

/** Приведение угла к диапазону [−π, π). */
export function wrapPi(angle: number): number {
  return wrap2Pi(angle + Math.PI) - Math.PI;
}

/** Приведение угла в градусах к диапазону [−180°, 180°). */
export function wrap180(deg: number): number {
  const a = (deg + 180) % 360;
  return (a < 0 ? a + 360 : a) - 180;
}

export function norm(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z);
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
