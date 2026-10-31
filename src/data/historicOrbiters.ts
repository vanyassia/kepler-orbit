/**
 * Советские спутники Марса. В JPL Horizons их нет, поэтому орбиты заданы опубликованными
 * высотами перицентра и апоцентра и наклонением. Долгота узла Ω, аргумент перицентра ω
 * и положение на орбите M₀ неизвестны и приняты равными нулю: форма орбиты настоящая,
 * а положение спутника в конкретный момент — условное.
 *
 * Марс-2, -3, -5 — данные NSSDCA; у Марса-3 источники расходятся (период от 11,5 до 12,8 суток).
 * Фобос-2 — JPL Mission and Spacecraft Library: радиусы 9671 и 9087 км от центра Марса, T = 7,6597 ч.
 */
import type { SatelliteRecord } from './celestrak';
import { customToElements } from './custom';

export interface HistoricOrbiter {
  /** Номер в приложении: настоящих номеров NAIF у этих аппаратов нет в Horizons. */
  id: number;
  title: string;
  note: string;
  cosparId: string;
  /** Эпоха — выход на эту орбиту, UTC. */
  epoch: string;
  /** Высоты перицентра и апоцентра над поверхностью, км. */
  hPeri: number;
  hApo: number;
  inclinationDeg: number;
}

export const HISTORIC_ORBITERS: HistoricOrbiter[] = [
  { id: -9711, title: 'Марс-2', note: 'Историческая орбита, СССР, 1971', cosparId: '1971-045A', epoch: '1971-11-27T00:00:00Z', hPeri: 1380, hApo: 24_940, inclinationDeg: 48.9 },
  { id: -9712, title: 'Марс-3', note: 'Историческая орбита, СССР, 1971', cosparId: '1971-049A', epoch: '1971-12-02T00:00:00Z', hPeri: 1528, hApo: 214_500, inclinationDeg: 60 },
  { id: -9741, title: 'Марс-5', note: 'Историческая орбита, СССР, 1974', cosparId: '1973-049A', epoch: '1974-02-12T15:45:00Z', hPeri: 1760, hApo: 32_586, inclinationDeg: 35.3 },
  { id: -9891, title: 'Фобос-2', note: 'Историческая орбита, СССР, 1989', cosparId: '1988-059A', epoch: '1989-03-27T00:00:00Z', hPeri: 5697.5, hApo: 6281.5, inclinationDeg: 1.0852 },
];

export function historicRecord(o: HistoricOrbiter): SatelliteRecord {
  const epochMs = Date.parse(o.epoch);
  const elements = customToElements({ ...o, name: o.title, body: 'mars', raanDeg: 0, argPerigeeDeg: 0, meanAnomalyDeg: 0, epochMs });
  return { elements: { ...elements, cosparId: o.cosparId }, source: 'historic', fetchedAt: epochMs };
}
