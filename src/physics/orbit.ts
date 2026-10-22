/**
 * Положение и скорость КА в абсолютной геоцентрической экваториальной
 * системе координат (АГЭСК). Формулы (8)–(10), docs/formulas.md.
 *
 * АГЭСК: начало в центре Земли, ось x направлена в точку весеннего
 * равноденствия ♈, ось z — к северному полюсу мира, ось y дополняет до правой тройки.
 */
import { MU } from './constants';
import type { Vec3 } from './math';
import { wrap2Pi } from './math';

/**
 * Формула (8). Аргумент широты — угол в плоскости орбиты от восходящего узла до КА:
 *
 *   u = ω + ϑ.
 */
export function argumentOfLatitude(omega: number, theta: number): number {
  return wrap2Pi(omega + theta);
}

/**
 * Единичный вектор радиального направления e_r (направляющие косинусы радиус-вектора).
 * Получается последовательными поворотами перифокальной системы на углы Ω, i, u.
 */
export function radialUnit(u: number, raan: number, i: number): Vec3 {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cO = Math.cos(raan);
  const sO = Math.sin(raan);
  const ci = Math.cos(i);
  return {
    x: cu * cO - su * sO * ci,
    y: cu * sO + su * cO * ci,
    z: su * Math.sin(i),
  };
}

/**
 * Единичный вектор трансверсального направления e_n (в плоскости орбиты,
 * перпендикулярно радиус-вектору, в сторону движения): e_n = ∂e_r/∂u.
 */
export function transversalUnit(u: number, raan: number, i: number): Vec3 {
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cO = Math.cos(raan);
  const sO = Math.sin(raan);
  const ci = Math.cos(i);
  return {
    x: -su * cO - cu * sO * ci,
    y: -su * sO + cu * cO * ci,
    z: cu * Math.sin(i),
  };
}

/**
 * Формула (9). Координаты КА в АГЭСК:
 *
 *   x = r(cos u·cos Ω − sin u·sin Ω·cos i),
 *   y = r(cos u·sin Ω + sin u·cos Ω·cos i),
 *   z = r·sin u·sin i.
 *
 * @param r радиус-вектор, км.
 * @param u аргумент широты, рад.
 * @param raan долгота восходящего узла Ω, рад.
 * @param i наклонение, рад.
 */
export function inertialPosition(r: number, u: number, raan: number, i: number): Vec3 {
  const e = radialUnit(u, raan, i);
  return { x: r * e.x, y: r * e.y, z: r * e.z };
}

/** Составляющие скорости КА. */
export interface VelocityComponents {
  /** Радиальная скорость V_r, км/с. */
  Vr: number;
  /** Трансверсальная скорость V_n, км/с. */
  Vn: number;
  /** Модуль скорости V, км/с. */
  V: number;
}

/**
 * Формула (10). Радиальная и трансверсальная составляющие скорости:
 *
 *   V_r = √(μ/p)·e·sin ϑ,   V_n = √(μ/p)·(1 + e·cos ϑ),   V = √(V_r² + V_n²).
 *
 * Проверка — интеграл энергии (формула Вис-вива): V² = μ(2/r − 1/a).
 */
export function velocityComponents(p: number, e: number, theta: number, mu = MU): VelocityComponents {
  const k = Math.sqrt(mu / p);
  const Vr = k * e * Math.sin(theta);
  const Vn = k * (1 + e * Math.cos(theta));
  return { Vr, Vn, V: Math.hypot(Vr, Vn) };
}

/** Вектор скорости в АГЭСК: V = V_r·e_r + V_n·e_n. */
export function inertialVelocity(Vr: number, Vn: number, u: number, raan: number, i: number): Vec3 {
  const er = radialUnit(u, raan, i);
  const en = transversalUnit(u, raan, i);
  return {
    x: Vr * er.x + Vn * en.x,
    y: Vr * er.y + Vn * en.y,
    z: Vr * er.z + Vn * en.z,
  };
}
