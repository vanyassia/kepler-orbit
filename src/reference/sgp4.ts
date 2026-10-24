/**
 * Эталонная модель — SGP4 (библиотека satellite.js, реализация Vallado и др., 2006).
 *
 * SGP4 — та модель, под которую CelesTrak публикует средние элементы: она учитывает
 * сжатие Земли (J2–J4), сопротивление атмосферы (BSTAR) и, для высоких орбит, Луну и Солнце.
 * В приложении используется только для сравнения с нашей моделью задачи двух тел.
 *
 * SGP4 выдаёт координаты в системе TEME (истинный экватор, среднее равноденствие).
 * Для сравнения TEME отождествляется с АГЭСК — расхождение осей (прецессия-нутация
 * за несколько десятилетий от J2000) много меньше различий самих моделей.
 * Подспутниковая точка считается теми же формулами (11)–(14), что и для нашей модели.
 */
import type { SatRec } from 'satellite.js';
import { json2satrec, propagate as sgp4Propagate, twoline2satrec } from './satelliteLib';
import type { SatelliteRecord } from '../data/celestrak';
import { greenwichToGeo, inertialToGreenwich } from '../physics/frames';
import type { Vec3 } from '../physics/math';
import { greenwichSiderealTime } from '../physics/time';

export interface ReferenceState {
  timeMs: number;
  /** Положение и скорость в TEME ≈ АГЭСК, км и км/с. */
  eci: Vec3;
  vEci: Vec3;
  /** Подспутниковая точка (рад) и высота над шаром (км) — как в нашей модели. */
  lat: number;
  lon: number;
  h: number;
}

/** Модель SGP4 для спутника, или null, если для неё нет исходных данных. */
export function createReference(rec: SatelliteRecord): SatRec | null {
  try {
    let satrec: SatRec | null = null;
    if (rec.omm) satrec = json2satrec(rec.omm as unknown as Parameters<typeof json2satrec>[0]);
    else if (rec.tle) satrec = twoline2satrec(rec.tle[0], rec.tle[1]);
    return satrec && satrec.error === 0 ? satrec : null;
  } catch {
    return null;
  }
}

/** Состояние КА по SGP4 в момент t; null — SGP4 не смог рассчитать (например, КА сошёл с орбиты). */
export function referenceState(satrec: SatRec, timeMs: number): ReferenceState | null {
  const pv = sgp4Propagate(satrec, new Date(timeMs));
  if (!pv || !pv.position || typeof pv.position === 'boolean') return null;
  const eci = { x: pv.position.x, y: pv.position.y, z: pv.position.z };
  const v = pv.velocity as Vec3;
  const geo = greenwichToGeo(inertialToGreenwich(eci, greenwichSiderealTime(timeMs)));
  return { timeMs, eci, vEci: { x: v.x, y: v.y, z: v.z }, lat: geo.lat, lon: geo.lon, h: geo.h };
}
