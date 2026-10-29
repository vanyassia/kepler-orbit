/**
 * Свои спутники: орбита задаётся понятными параметрами, а не строками TLE (формат TLE — только для Земли).
 *
 *   r_π = R + h_п,  r_α = R + h_а,
 *   a = (r_π + r_α) / 2,  e = (r_α − r_π) / (r_α + r_π),
 *   T = 2π·√(a³/μ),  N = 86400 / T  (об/сут — так элементы попадают в ту же цепочку формул листка).
 *
 * Для Луны и Марса углы i, Ω отсчитываются от экватора тела (как у элементов JPL Horizons).
 */
import type { BodyId } from '../physics/bodies';
import { BODIES } from '../physics/bodies';
import { SECONDS_PER_DAY, TWO_PI } from '../physics/constants';
import type { OrbitalElements } from '../physics/propagate';
import type { SatelliteRecord } from './celestrak';

export interface CustomSatellite {
  /** Номер в приложении: от CUSTOM_ID_BASE и выше (не пересекается с NORAD и NAIF). */
  id: number;
  name: string;
  body: BodyId;
  /** Высоты перицентра и апоцентра над поверхностью, км. */
  hPeri: number;
  hApo: number;
  /** Наклонение, долгота восходящего узла, аргумент перицентра, средняя аномалия на эпоху — градусы. */
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  /** Эпоха — момент создания, мс Unix (UTC). */
  epochMs: number;
}

/** Номера своих спутников: 9 000 001, 9 000 002… — выше любого номера NORAD. */
export const CUSTOM_ID_BASE = 9_000_000;

export const isCustomId = (id: number) => id > CUSTOM_ID_BASE;

/** Большая полуось и эксцентриситет по высотам перицентра и апоцентра. */
export function shapeFromHeights(hPeri: number, hApo: number, R: number): { a: number; e: number } {
  const rp = R + hPeri;
  const ra = R + hApo;
  return { a: (rp + ra) / 2, e: (ra - rp) / (ra + rp) };
}

/** Период T, с, по большой полуоси (третий закон Кеплера). */
export const periodOf = (a: number, mu: number) => TWO_PI * Math.sqrt((a * a * a) / mu);

export function customToElements(c: CustomSatellite): OrbitalElements {
  const body = BODIES[c.body];
  const { a, e } = shapeFromHeights(c.hPeri, c.hApo, body.radius);
  return {
    name: c.name,
    noradId: c.id,
    body: c.body,
    epochMs: c.epochMs,
    meanMotion: SECONDS_PER_DAY / periodOf(a, body.mu),
    eccentricity: e,
    inclinationDeg: c.inclinationDeg,
    raanDeg: c.raanDeg,
    argPerigeeDeg: c.argPerigeeDeg,
    meanAnomalyDeg: c.meanAnomalyDeg,
  };
}

export function customToRecord(c: CustomSatellite): SatelliteRecord {
  return { elements: customToElements(c), source: 'custom', fetchedAt: c.epochMs };
}

/** Проверка введённых значений; возвращает сообщения по полям (пусто — всё верно). */
export function validateCustom(c: Omit<CustomSatellite, 'id' | 'epochMs'>): Partial<Record<keyof CustomSatellite, string>> {
  const err: Partial<Record<keyof CustomSatellite, string>> = {};
  const finite = (v: number) => Number.isFinite(v);
  if (!c.name.trim()) err.name = 'Введите название';
  if (!finite(c.hPeri) || c.hPeri < 1) err.hPeri = 'Перицентр выше поверхности: не меньше 1 км';
  if (!finite(c.hApo)) err.hApo = 'Введите число';
  else if (finite(c.hPeri) && c.hApo < c.hPeri) err.hApo = 'Апоцентр не ниже перицентра';
  else if (c.hApo > 1_000_000) err.hApo = 'Не больше 1 000 000 км';
  if (!finite(c.inclinationDeg) || c.inclinationDeg < 0 || c.inclinationDeg > 180) err.inclinationDeg = 'От 0 до 180°';
  for (const k of ['raanDeg', 'argPerigeeDeg', 'meanAnomalyDeg'] as const) if (!finite(c[k])) err[k] = 'Введите число';
  return err;
}

/** Угол в диапазон [0, 360). */
export const wrapDeg = (deg: number) => ((deg % 360) + 360) % 360;

/** Пример для каждого тела — круговая полярная орбита, как у картографических аппаратов. */
export const CUSTOM_DEFAULTS: Record<BodyId, { hPeri: number; hApo: number; inclinationDeg: number }> = {
  earth: { hPeri: 500, hApo: 500, inclinationDeg: 97.4 },
  moon: { hPeri: 100, hApo: 100, inclinationDeg: 90 },
  mars: { hPeri: 300, hApo: 300, inclinationDeg: 93 },
};
