/**
 * Формат OMM (Orbit Mean-Elements Message) в JSON — так CelesTrak GP API
 * отдаёт элементы орбит (FORMAT=json). Из записи берём только начальные элементы.
 */
import type { OrbitalElements } from '../physics/propagate';
import { parseEpochUtc } from '../physics/time';

export interface OmmRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  NORAD_CAT_ID: number;
  [key: string]: unknown;
}

const REQUIRED = [
  'OBJECT_NAME',
  'EPOCH',
  'MEAN_MOTION',
  'ECCENTRICITY',
  'INCLINATION',
  'RA_OF_ASC_NODE',
  'ARG_OF_PERICENTER',
  'MEAN_ANOMALY',
  'NORAD_CAT_ID',
] as const;

export function isOmmRecord(x: unknown): x is OmmRecord {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return REQUIRED.every((k) => r[k] !== undefined && r[k] !== null);
}

/** OMM → начальные элементы. Числа в CelesTrak уже десятичные градусы и об/сут. */
export function ommToElements(r: OmmRecord): OrbitalElements {
  const el: OrbitalElements = {
    name: String(r.OBJECT_NAME).trim(),
    noradId: Number(r.NORAD_CAT_ID),
    cosparId: r.OBJECT_ID ? String(r.OBJECT_ID) : undefined,
    epochMs: parseEpochUtc(String(r.EPOCH)),
    meanMotion: Number(r.MEAN_MOTION),
    eccentricity: Number(r.ECCENTRICITY),
    inclinationDeg: Number(r.INCLINATION),
    raanDeg: Number(r.RA_OF_ASC_NODE),
    argPerigeeDeg: Number(r.ARG_OF_PERICENTER),
    meanAnomalyDeg: Number(r.MEAN_ANOMALY),
  };
  validateElements(el);
  return el;
}

/** Проверка, что элементы описывают замкнутую орбиту, которую модель может рассчитать. */
export function validateElements(el: OrbitalElements): void {
  const bad = (msg: string) => {
    throw new Error(`${el.name || 'Объект'}: ${msg}`);
  };
  if (!Number.isFinite(el.epochMs)) bad('неверная эпоха');
  if (!(el.meanMotion > 0)) bad('среднее движение должно быть положительным');
  if (!(el.eccentricity >= 0 && el.eccentricity < 1)) bad(`эксцентриситет ${el.eccentricity} вне диапазона [0, 1)`);
  for (const k of ['inclinationDeg', 'raanDeg', 'argPerigeeDeg', 'meanAnomalyDeg'] as const) {
    if (!Number.isFinite(el[k])) bad(`поле ${k} не число`);
  }
}
