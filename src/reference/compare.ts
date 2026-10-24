/**
 * Сравнение нашей модели (задача двух тел) с эталоном (SGP4) — формула (17), docs/formulas.md.
 *
 * Вектор расхождения Δr = r_эт − r раскладывается по орбитальным осям нашего КА:
 *   e_r = r/|r| — радиальное направление,
 *   e_b = (r × V)/|r × V| — бинормаль (нормаль к плоскости орбиты),
 *   e_τ = e_b × e_r — трансверсальное направление (вдоль движения).
 * Составляющие: Δr_r = Δr·e_r (по высоте), Δr_τ = Δr·e_τ (отставание/опережение по орбите),
 * Δr_b = Δr·e_b (уход плоскости орбиты — главным образом прецессия узла из-за J2).
 */
import { R_EARTH } from '../physics/constants';
import type { Vec3 } from '../physics/math';
import { cross, dot, norm } from '../physics/math';

export interface Deviation {
  /** Полное расхождение |Δr|, км. */
  total: number;
  /** Радиальная составляющая, км (плюс — эталон выше). */
  radial: number;
  /** Трансверсальная составляющая, км (плюс — эталон впереди по движению). */
  along: number;
  /** Бинормальная составляющая, км (поперёк плоскости орбиты). */
  cross: number;
  /** Расстояние между подспутниковыми точками по поверхности шара, км. */
  ground: number;
}

const scale = (v: Vec3, k: number): Vec3 => ({ x: v.x * k, y: v.y * k, z: v.z * k });

export function deviation(
  ours: { eci: Vec3; vEci: Vec3; lat: number; lon: number },
  ref: { eci: Vec3; lat: number; lon: number },
): Deviation {
  const d = { x: ref.eci.x - ours.eci.x, y: ref.eci.y - ours.eci.y, z: ref.eci.z - ours.eci.z };
  const er = scale(ours.eci, 1 / norm(ours.eci));
  const h = cross(ours.eci, ours.vEci);
  const eb = scale(h, 1 / norm(h));
  const et = cross(eb, er);
  // Центральный угол между подспутниковыми точками (формула гаверсинусов — устойчива для малых углов)
  const s =
    Math.sin((ref.lat - ours.lat) / 2) ** 2 + Math.cos(ours.lat) * Math.cos(ref.lat) * Math.sin((ref.lon - ours.lon) / 2) ** 2;
  return {
    total: norm(d),
    radial: dot(d, er),
    along: dot(d, et),
    cross: dot(d, eb),
    ground: 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s))),
  };
}
