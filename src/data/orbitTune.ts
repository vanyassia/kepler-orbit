/**
 * Изменение орбиты на ходу (ползунки «Изменить орбиту» в боковой панели).
 *
 * Меняются только входные элементы — модель расчёта та же. Высота перицентра hп и эксцентриситет e
 * переводятся в элементы листка так же, как у своих спутников (src/data/custom.ts):
 *   r_π = R + hп,  a = r_π / (1 − e),  T = 2π·√(a³/μ),  N = 86400 / T.
 * Перицентр при изменении e остаётся на месте — орбита «вытягивается» вверх, в сторону апоцентра.
 */
import type { BodyId } from '../physics/bodies';
import { BODIES } from '../physics/bodies';
import { SECONDS_PER_DAY } from '../physics/constants';
import { periodFromRevPerDay, semiMajorAxis, meanMotionFromRevPerDay } from '../physics/kepler';
import type { OrbitalElements } from '../physics/propagate';
import { periodOf } from './custom';

export interface OrbitShape {
  /** Высоты перицентра и апоцентра, км. */
  hPeri: number;
  hApo: number;
  e: number;
  inclinationDeg: number;
  /** Период, с. */
  T: number;
}

export interface TunePatch {
  hPeri?: number;
  e?: number;
  inclinationDeg?: number;
}

/** Пределы ползунка высоты перицентра, км (шкала логарифмическая: низкие орбиты не сжимаются в точку). */
export const TUNE_HEIGHT: Record<BodyId, { min: number; max: number }> = {
  earth: { min: 150, max: 400_000 },
  moon: { min: 10, max: 50_000 },
  mars: { min: 50, max: 25_000 },
};

/** Самая вытянутая орбита на ползунке. */
export const E_MAX = 0.9;
/** Апоцентр не дальше — как и у своих спутников (validateCustom). */
export const APO_MAX = 1_000_000;

export function shapeOf(el: OrbitalElements): OrbitShape {
  const body = BODIES[el.body ?? 'earth'];
  const a = semiMajorAxis(meanMotionFromRevPerDay(el.meanMotion), body.mu);
  const e = el.eccentricity;
  return {
    hPeri: a * (1 - e) - body.radius,
    hApo: a * (1 + e) - body.radius,
    e,
    inclinationDeg: el.inclinationDeg,
    T: periodFromRevPerDay(el.meanMotion),
  };
}

/** Наибольший эксцентриситет при данной высоте перицентра: апоцентр не дальше APO_MAX. */
export function maxEccentricity(hPeri: number, R: number): number {
  const rp = R + hPeri;
  const ra = R + APO_MAX;
  return Math.max(0, Math.min(E_MAX, (ra - rp) / (ra + rp)));
}

/** Новые элементы орбиты: остальные элементы (Ω, ω, M₀, эпоха) не меняются. */
export function tuneElements(el: OrbitalElements, patch: TunePatch): OrbitalElements {
  const body = BODIES[el.body ?? 'earth'];
  const cur = shapeOf(el);
  const hPeri = Math.max(1, patch.hPeri ?? cur.hPeri);
  const e = Math.min(Math.max(0, patch.e ?? cur.e), maxEccentricity(hPeri, body.radius));
  const inclinationDeg = Math.min(180, Math.max(0, patch.inclinationDeg ?? cur.inclinationDeg));
  const a = (body.radius + hPeri) / (1 - e);
  return { ...el, eccentricity: e, inclinationDeg, meanMotion: SECONDS_PER_DAY / periodOf(a, body.mu) };
}

/** Логарифмическая шкала: положение ползунка 0…1 ↔ высота между min и max. */
export function heightFromSlider(pos: number, min: number, max: number): number {
  return min * (max / min) ** Math.min(1, Math.max(0, pos));
}

export function sliderFromHeight(h: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, Math.log(h / min) / Math.log(max / min)));
}

/** Круглая высота для ползунка: до 1000 км — с точностью 1 км, до 10 000 — 10 км, дальше — 100 км. */
export function niceHeight(h: number): number {
  const step = h < 1000 ? 1 : h < 10_000 ? 10 : 100;
  return Math.round(h / step) * step;
}
