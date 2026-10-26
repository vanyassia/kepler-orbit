/**
 * Связь систем координат модели с осями сцены three.js.
 *
 * Сцена построена в АГЭСК, единица длины — радиус Земли R_З.
 * В three.js ось Y направлена вверх, поэтому оси переставлены (поворот, правая тройка сохраняется):
 *   X_сцены =  x,   Y_сцены = z,   Z_сцены = −y.
 *
 * Земля — группа, повёрнутая вокруг Y_сцены (оси мира) на угол S; внутри неё координаты — ГСК
 * с той же перестановкой осей. Текстура сферы three.js ложится так, что нулевой меридиан
 * совпадает с +X, а 90° в. д. — с −Z, т. е. с осью y_г ГСК.
 */
import { Vector3 } from 'three';
import { DEG, R_EARTH } from '../../physics/constants';
import type { Vec3 } from '../../physics/math';

/** Вектор инерциальной или вращающейся системы (км) → сцена (в радиусах центрального тела R). */
export function toScene(v: Vec3, out = new Vector3(), R = R_EARTH): Vector3 {
  return out.set(v.x / R, v.z / R, -v.y / R);
}

/** Вектор физической системы → оси сцены (без масштаба). */
export const axisToScene = (v: Vec3, out = new Vector3()): Vector3 => out.set(v.x, v.z, -v.y);

/** Географическая точка (градусы) → координаты внутри группы Земли (в радиусах Земли). */
export function geoToLocal(latDeg: number, lonDeg: number, r = 1, out = new Vector3()): Vector3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const c = Math.cos(lat);
  return out.set(r * c * Math.cos(lon), r * Math.sin(lat), -r * c * Math.sin(lon));
}

/**
 * Закрыт ли объект в точке p Землёй (шар радиуса 1) для наблюдателя в точке cam.
 * Ищем ближайшую к центру точку отрезка cam→p; если она внутри шара — точка не видна.
 */
export function occludedByEarth(p: Vector3, cam: Vector3, radius = 0.999): boolean {
  const dx = p.x - cam.x;
  const dy = p.y - cam.y;
  const dz = p.z - cam.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = Math.min(1, Math.max(0, -(cam.x * dx + cam.y * dy + cam.z * dz) / len2));
  const qx = cam.x + t * dx;
  const qy = cam.y + t * dy;
  const qz = cam.z + t * dz;
  return t > 0 && t < 1 && qx * qx + qy * qy + qz * qz < radius * radius;
}
