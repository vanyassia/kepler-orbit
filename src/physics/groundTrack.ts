/**
 * Трасса полёта — геометрическое место подспутниковых точек — и зона радиовидимости.
 * Формула (16), docs/formulas.md.
 */
import { R_EARTH, RAD } from './constants';
import type { PreparedOrbit } from './propagate';
import { propagate } from './propagate';

/** Точка трассы (для вывода — в градусах). */
export interface TrackPoint {
  timeMs: number;
  /** Широта, °. */
  lat: number;
  /** Долгота, °, [−180, 180). */
  lon: number;
  /** Высота, км. */
  h: number;
}

/**
 * Шаг построения трассы: T/720 (полградуса средней аномалии), но не меньше 5 с и не больше 120 с.
 */
export function trackStepSeconds(orbit: PreparedOrbit): number {
  return Math.min(120, Math.max(5, orbit.T / 720));
}

/** Трасса на интервале [t1, t2]: последовательность подспутниковых точек. */
export function groundTrack(orbit: PreparedOrbit, t1Ms: number, t2Ms: number, stepSec = trackStepSeconds(orbit)): TrackPoint[] {
  const pts: TrackPoint[] = [];
  const stepMs = stepSec * 1000;
  for (let t = t1Ms; t < t2Ms; t += stepMs) pts.push(toTrackPoint(orbit, t));
  pts.push(toTrackPoint(orbit, t2Ms));
  return pts;
}

function toTrackPoint(orbit: PreparedOrbit, t: number): TrackPoint {
  const s = propagate(orbit, t);
  return { timeMs: t, lat: s.lat * RAD, lon: s.lon * RAD, h: s.h };
}

/**
 * Разбиение трассы на непрерывные участки при переходе через линию перемены дат (±180°).
 * Точка пересечения находится линейной интерполяцией и добавляется в оба участка,
 * чтобы линия на карте доходила до края.
 */
export function splitAtAntimeridian(points: TrackPoint[]): TrackPoint[][] {
  if (points.length === 0) return [];
  const segments: TrackPoint[][] = [[points[0]]];
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1];
    const b = points[k];
    const dLon = b.lon - a.lon;
    if (Math.abs(dLon) > 180) {
      // Переход через ±180°: «разворачиваем» b к a и ищем пересечение с краем
      const edge = dLon < 0 ? 180 : -180; // a у восточного края → b за ним
      const bLonUnwrapped = b.lon + (dLon < 0 ? 360 : -360);
      const f = (edge - a.lon) / (bLonUnwrapped - a.lon);
      const cross = {
        timeMs: a.timeMs + f * (b.timeMs - a.timeMs),
        lat: a.lat + f * (b.lat - a.lat),
        h: a.h + f * (b.h - a.h),
      };
      segments[segments.length - 1].push({ ...cross, lon: edge });
      segments.push([{ ...cross, lon: -edge }, b]);
    } else {
      segments[segments.length - 1].push(b);
    }
  }
  return segments;
}

/**
 * Формула (16). Центральный угол зоны радиовидимости КА на высоте h
 * при минимальном угле места ε (ε = 0 — видимость до горизонта):
 *
 *   β = arccos(R_З·cos ε / (R_З + h)) − ε.
 *
 * Зона видимости на поверхности — сферический круг радиуса β с центром в подспутниковой точке.
 *
 * @returns β, рад.
 */
export function visibilityAngle(h: number, minElevation = 0, R = R_EARTH): number {
  return Math.acos((R * Math.cos(minElevation)) / (R + h)) - minElevation;
}
