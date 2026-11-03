/**
 * Схема элементов орбиты на глобусе: дуги углов Ω, i, ω, ν (или u) в физической системе (x, y, z),
 * той же, что у формулы (9). Перевод в оси сцены — axisToScene.
 *
 *   направление узла          N = (cos Ω, sin Ω, 0);
 *   точка орбиты на угле u    P(u) = cos u · N + sin u · (−sin Ω cos i, cos Ω cos i, sin i);
 *   наклонение i — угол между касательной к экватору E = (−sin Ω, cos Ω, 0)
 *   и касательной к орбите в восходящем узле T = cos i · E + sin i · z.
 */
import { TWO_PI } from '../../physics/constants';
import type { Vec3 } from '../../physics/math';

export interface PlaneAngles {
  /** Долгота восходящего узла Ω, наклонение i, рад. */
  raan: number;
  i: number;
}

/** Точка плоскости орбиты на расстоянии r от центра и угле u от восходящего узла. */
export function inOrbitPlane(o: PlaneAngles, u: number, r: number): Vec3 {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cO = Math.cos(o.raan);
  const sO = Math.sin(o.raan);
  const ci = Math.cos(o.i);
  return { x: r * (cu * cO - su * sO * ci), y: r * (cu * sO + su * cO * ci), z: r * su * Math.sin(o.i) };
}

/** Угол в [0, 2π): дуги идут по ходу отсчёта угла. */
const span = (a: number) => ((a % TWO_PI) + TWO_PI) % TWO_PI;

/** Число точек дуги: не реже чем через 3°, но не меньше 8. */
const steps = (angle: number) => Math.max(8, Math.ceil(angle / (3 * (Math.PI / 180))));

/** Дуга в плоскости экватора от оси x до угла to (долгота узла Ω). */
export function equatorArc(to: number, r: number): Vec3[] {
  const a = span(to);
  const n = steps(a);
  return Array.from({ length: n + 1 }, (_, k) => {
    const f = (a * k) / n;
    return { x: r * Math.cos(f), y: r * Math.sin(f), z: 0 };
  });
}

/** Дуга в плоскости орбиты от угла from до угла from + length (оба — от восходящего узла). */
export function orbitArc(o: PlaneAngles, from: number, length: number, r: number): Vec3[] {
  const a = span(length);
  const n = steps(a);
  return Array.from({ length: n + 1 }, (_, k) => inOrbitPlane(o, from + (a * k) / n, r));
}

/** Касательные в восходящем узле: к экватору E и к орбите T (по ходу движения). */
export function nodeTangents(o: PlaneAngles): { E: Vec3; T: Vec3 } {
  const cO = Math.cos(o.raan);
  const sO = Math.sin(o.raan);
  const ci = Math.cos(o.i);
  return { E: { x: -sO, y: cO, z: 0 }, T: { x: -sO * ci, y: cO * ci, z: Math.sin(o.i) } };
}

/** Дуга наклонения с центром в узле node радиуса a: от касательной к экватору до касательной к орбите. */
export function inclinationArc(o: PlaneAngles, node: Vec3, a: number): Vec3[] {
  const { E } = nodeTangents(o);
  const n = steps(o.i);
  return Array.from({ length: n + 1 }, (_, k) => {
    const f = (o.i * k) / n;
    const c = a * Math.cos(f);
    const s = a * Math.sin(f);
    return { x: node.x + c * E.x, y: node.y + c * E.y, z: node.z + s };
  });
}

/** Середина ломаной (по номеру точки) — место для подписи. */
export const midpoint = <T,>(pts: readonly T[]): T => pts[Math.floor(pts.length / 2)];
