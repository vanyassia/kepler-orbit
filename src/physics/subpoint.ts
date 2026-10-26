/**
 * Подспутниковая точка по листку «Трасса спутника» (шаги 5.5–5.8): сферический треугольник
 * «восходящий узел — точка под спутником — основание её меридиана на экваторе».
 *
 * Стороны треугольника: u — путь по орбите от узла, φ — широта (дуга меридиана),
 * ab — путь по экватору от узла до меридиана точки. Угол при узле равен наклонению i,
 * угол при основании меридиана — прямой.
 */
import { wrapPi } from './math';

/**
 * Шаг 5.5. Широта:
 *
 *   sin φ = sin u · sin i.
 *
 * @param u аргумент широты, рад.
 * @param i наклонение, рад.
 * @returns φ, рад.
 */
export function latitudeFromArgument(u: number, i: number): number {
  return Math.asin(Math.sin(u) * Math.sin(i));
}

/**
 * Шаг 5.6. Путь по экватору от восходящего узла до меридиана подспутниковой точки:
 *
 *   ab = atan2(cos i · sin u, cos u).
 *
 * atan2 сразу даёт правильную четверть (ab идёт вместе с u от 0 до 360°).
 *
 * @returns ab, рад, в диапазоне (−π, π].
 */
export function equatorPath(u: number, i: number): number {
  return Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u));
}

/**
 * Шаг 4. Долгота восходящего узла на эпоху — относительно Гринвича, а не звёзд:
 *
 *   λ_Ω = Ω − S.
 *
 * @param raan долгота восходящего узла Ω (от точки ♈), рад.
 * @param S угол поворота Земли на эпоху, рад.
 */
export function nodeLongitude(raan: number, S: number): number {
  return wrapPi(raan - S);
}

/**
 * Шаг 5.8. Долгота подспутниковой точки:
 *
 *   λ = λ_Ω + ab − ω_З · t,
 *
 * где ω_З · t — поворот Земли за время t после эпохи (шаг 5.7).
 *
 * @returns λ, рад, в диапазоне [−π, π).
 */
export function subSatelliteLongitude(lambdaNode: number, ab: number, turn: number): number {
  return wrapPi(lambdaNode + ab - turn);
}
