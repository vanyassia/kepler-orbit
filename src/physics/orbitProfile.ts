/**
 * Графики за виток: высота h, скорость V, широта φ и истинная аномалия ν
 * от перицентра до следующего перицентра (M от 0 до 2π).
 *
 * Новых формул здесь нет: каждая точка — тот же расчёт propagate (шаги 5 листка)
 * в нужный момент времени. Точки берутся равномерно по эксцентрической аномалии E:
 * у перицентра, где аппарат летит быстрее всего и величины меняются резче, они гуще.
 */
import { TWO_PI } from './constants';
import type { PreparedOrbit } from './propagate';
import { propagate } from './propagate';

export interface ProfilePoint {
  timeMs: number;
  /** Высота над шаром, км. */
  h: number;
  /** Скорость, км/с. */
  V: number;
  /** Широта подспутниковой точки, рад. */
  lat: number;
  /** Истинная аномалия ν, рад, от 0 до 2π. */
  theta: number;
}

export interface OrbitProfile {
  /** Прохождение перицентра в начале витка, мс. */
  startMs: number;
  /** Прохождение апоцентра (середина витка по времени), мс. */
  apoMs: number;
  /** Следующее прохождение перицентра, мс. */
  endMs: number;
  points: ProfilePoint[];
}

/**
 * Момент прохождения перицентра в начале витка, на котором аппарат находится в момент t:
 * M = M₀ + n·Δt = 2π·k  ⇒  t_π = t₀ + (2π·k − M₀)/n,  k = ⌊(M₀ + n·Δt)/2π⌋.
 * Пока аппарат на одном витке, ответ один и тот же — графики не пересчитываются на каждом кадре.
 */
export function perigeeBefore(orbit: PreparedOrbit, timeMs: number): number {
  const dt = (timeMs - orbit.epochMs) / 1000;
  const k = Math.floor((orbit.M0 + orbit.n * dt) / TWO_PI);
  const t = orbit.epochMs + ((TWO_PI * k - orbit.M0) / orbit.n) * 1000;
  // Защита от погрешности округления на самой границе витка
  return t > timeMs ? t - orbit.T * 1000 : t;
}

/** Точки графиков за виток, начинающийся с перицентра startMs. */
export function orbitProfile(orbit: PreparedOrbit, startMs: number, samples = 240): OrbitProfile {
  const e = orbit.e;
  const points: ProfilePoint[] = [];
  for (let k = 0; k <= samples; k++) {
    const E = (k / samples) * TWO_PI;
    const M = E - e * Math.sin(E); // уравнение Кеплера (5): от E к M
    const timeMs = startMs + (M / orbit.n) * 1000;
    const s = propagate(orbit, timeMs);
    // На последней точке ν снова 0 по модулю 2π — рисуем её как 2π, чтобы линия не падала вниз
    const theta = k === samples ? TWO_PI : k === 0 ? 0 : s.theta;
    points.push({ timeMs, h: s.h, V: s.V, lat: s.lat, theta });
  }
  return { startMs, apoMs: startMs + orbit.T * 500, endMs: startMs + orbit.T * 1000, points };
}

/** Значения графиков в произвольный момент витка — линейно между соседними точками. */
export function profileAt(profile: OrbitProfile, timeMs: number): ProfilePoint {
  const pts = profile.points;
  if (timeMs <= pts[0].timeMs) return pts[0];
  let lo = 0;
  let hi = pts.length - 1;
  if (timeMs >= pts[hi].timeMs) return pts[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].timeMs <= timeMs) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const f = (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
  const mix = (x: number, y: number) => x + (y - x) * f;
  return { timeMs, h: mix(a.h, b.h), V: mix(a.V, b.V), lat: mix(a.lat, b.lat), theta: mix(a.theta, b.theta) };
}
