/**
 * Исторические орбиты: аппараты, которых нет ни в CelesTrak, ни в JPL Horizons.
 * Орбита задана опубликованными высотами перицентра и апоцентра и наклонением.
 *
 * Советские спутники Марса. Долгота узла Ω, аргумент перицентра ω и положение на орбите M₀
 * неизвестны и приняты равными нулю: форма орбиты настоящая, а положение спутника в конкретный
 * момент — условное.
 *   Марс-2, -3, -5 — данные NSSDCA; у Марса-3 источники расходятся (период от 11,5 до 12,8 суток).
 *   Фобос-2 — JPL Mission and Spacecraft Library: радиусы 9671 и 9087 км от центра Марса, T = 7,6597 ч.
 *
 * Первые полёты с Байконура: Спутник-1 и Восток-1 (Гагарин). Плоскость орбиты проведена через
 * Байконур в момент старта: в эпоху аппарат над стартовым столом, на восходящей ветви, в перицентре
 * (выход на орбиту — у перицентра). Так трасса идёт от Байконура, как настоящая; выведение и спуск
 * модель не описывает. При выборе такого полёта часы переходят к моменту старта.
 *   Спутник-1 — 04.10.1957, 215 × 939 км, i = 65,1° (NSSDCA).
 *   Восток-1 — 12.04.1961, старт 9:07 мск, посадка 10:55 мск у деревни Смеловка Саратовской области;
 *   орбита 181 × 327 км, i = 64,95° (сообщение ТАСС).
 */
import type { BodyId } from '../physics/bodies';
import { BODIES } from '../physics/bodies';
import { DEG } from '../physics/constants';
import { prepareOrbit, subPointAt } from '../physics/propagate';
import type { SatelliteRecord } from './celestrak';
import { customToElements } from './custom';
import { centralAngle } from '../physics/passes';

/** Место на поверхности, градусы (северная широта и восточная долгота положительны). */
export interface Site {
  name: string;
  lat: number;
  lon: number;
}

export interface HistoricOrbiter {
  /** Номер в приложении: настоящих номеров NAIF у этих аппаратов нет в Horizons, а в CelesTrak нет старых записей. */
  id: number;
  body: BodyId;
  title: string;
  note: string;
  /** Пояснение под названием в боковой панели. */
  detail: string;
  cosparId: string;
  /** Эпоха: выход на эту орбиту, а у полёта с Байконура — момент старта, UTC. */
  epoch: string;
  /** Высоты перицентра и апоцентра над поверхностью, км. */
  hPeri: number;
  hApo: number;
  inclinationDeg: number;
  /** Место старта: орбита проходит над ним в эпоху. Без него углы Ω, ω и M₀ равны нулю. */
  launch?: Site;
  /** Место посадки: часы останавливаются, когда корабль пролетает ближе всего к нему. */
  landing?: Site;
}

export const BAIKONUR: Site = { name: 'Байконур', lat: 45.9203, lon: 63.3422 };
export const GAGARIN_LANDING: Site = { name: 'Посадка Гагарина', lat: 51.2708, lon: 45.9975 };

export const VOSTOK1_ID = -9611;
export const SPUTNIK1_ID = -9571;

const MARS_DETAIL = 'Форма орбиты по опубликованным данным. Углы Ω и ω и положение на орбите условные.';

export const HISTORIC_ORBITERS: HistoricOrbiter[] = [
  {
    id: VOSTOK1_ID,
    body: 'earth',
    title: 'Восток-1',
    note: 'Гагарин, 12.04.1961, один виток',
    detail:
      'Первый полёт человека: старт с Байконура в 9:07 мск, посадка под Саратовом в 10:55. Высоты и наклонение — по сообщению ТАСС, плоскость орбиты проведена через Байконур. Выведение и спуск модель не описывает, поэтому над местом посадки корабль оказывается раньше, в 10:38, — там часы встают на паузу.',
    cosparId: '1961-012A',
    epoch: '1961-04-12T06:07:00Z',
    hPeri: 181,
    hApo: 327,
    inclinationDeg: 64.95,
    launch: BAIKONUR,
    landing: GAGARIN_LANDING,
  },
  {
    id: SPUTNIK1_ID,
    body: 'earth',
    title: 'Спутник-1',
    note: 'Первый спутник, 04.10.1957',
    detail:
      'Первый искусственный спутник Земли: старт с Байконура 04.10.1957 в 22:28 мск, летал 92 дня. Высоты и наклонение — опубликованные для первых витков, плоскость орбиты проведена через Байконур в момент старта. Торможение в атмосфере модель не учитывает: орбита не снижается.',
    cosparId: '1957-001B',
    epoch: '1957-10-04T19:28:34Z',
    hPeri: 215,
    hApo: 939,
    inclinationDeg: 65.1,
    launch: BAIKONUR,
  },
  { id: -9711, body: 'mars', title: 'Марс-2', note: 'Историческая орбита, СССР, 1971', detail: MARS_DETAIL, cosparId: '1971-045A', epoch: '1971-11-27T00:00:00Z', hPeri: 1380, hApo: 24_940, inclinationDeg: 48.9 },
  { id: -9712, body: 'mars', title: 'Марс-3', note: 'Историческая орбита, СССР, 1971', detail: MARS_DETAIL, cosparId: '1971-049A', epoch: '1971-12-02T00:00:00Z', hPeri: 1528, hApo: 214_500, inclinationDeg: 60 },
  { id: -9741, body: 'mars', title: 'Марс-5', note: 'Историческая орбита, СССР, 1974', detail: MARS_DETAIL, cosparId: '1973-049A', epoch: '1974-02-12T15:45:00Z', hPeri: 1760, hApo: 32_586, inclinationDeg: 35.3 },
  { id: -9891, body: 'mars', title: 'Фобос-2', note: 'Историческая орбита, СССР, 1989', detail: MARS_DETAIL, cosparId: '1988-059A', epoch: '1989-03-27T00:00:00Z', hPeri: 5697.5, hApo: 6281.5, inclinationDeg: 1.0852 },
];

export const historicById = (id: number) => HISTORIC_ORBITERS.find((o) => o.id === id);

const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Углы орбиты, при которых в момент epochMs аппарат находится над местом site на восходящей ветви,
 * в перицентре. Обратный ход шагов 4 и 5.5–5.7 листка:
 *   sin u = sin φ / sin i,  ab = atan2(cos i · sin u, cos u),  λ_Ω = λ − ab,  Ω = λ_Ω + S(t₀),
 *   ω = u (перицентр в этой точке), M₀ = 0.
 * Только для Земли: у неё экватор вращения совпадает с экватором элементов.
 */
export function anglesOverSite(site: Site, inclinationDeg: number, epochMs: number): { raanDeg: number; argPerigeeDeg: number; meanAnomalyDeg: number } {
  const i = inclinationDeg * DEG;
  const s = Math.sin(site.lat * DEG) / Math.sin(i);
  if (Math.abs(s) > 1) throw new Error(`Орбита с наклонением ${inclinationDeg}° не проходит над широтой ${site.lat}°`);
  const u = Math.asin(s); // восходящая ветвь: cos u > 0
  const ab = Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u));
  const S0 = BODIES.earth.rotationAngle(epochMs);
  const raan = site.lon * DEG - ab + S0;
  return { raanDeg: wrap360(raan / DEG), argPerigeeDeg: wrap360(u / DEG), meanAnomalyDeg: 0 };
}

export function historicRecord(o: HistoricOrbiter): SatelliteRecord {
  const epochMs = Date.parse(o.epoch);
  const angles = o.launch ? anglesOverSite(o.launch, o.inclinationDeg, epochMs) : { raanDeg: 0, argPerigeeDeg: 0, meanAnomalyDeg: 0 };
  const elements = customToElements({ ...o, name: o.title, ...angles, epochMs });
  return { elements: { ...elements, cosparId: o.cosparId }, source: 'historic', fetchedAt: epochMs };
}

/** Полёт с часами: начало — старт, конец (если задано место посадки) — пролёт ближе всего к нему. */
export interface Flight {
  startMs: number;
  endMs: number | null;
}

/**
 * Момент, когда подспутниковая точка ближе всего к месту site, на отрезке [fromMs, toMs]:
 * перебор с шагом 10 с, затем уточнение золотым сечением.
 */
export function closestApproach(rec: SatelliteRecord, site: Site, fromMs: number, toMs: number): number {
  const orbit = prepareOrbit(rec.elements);
  const dist = (t: number) => {
    const p = subPointAt(orbit, t);
    return centralAngle(p.lat, p.lon, site.lat * DEG, site.lon * DEG);
  };
  const step = 10_000;
  let best = fromMs;
  for (let t = fromMs; t <= toMs; t += step) if (dist(t) < dist(best)) best = t;
  let lo = best - step;
  let hi = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  while (hi - lo > 100) {
    const a = hi - g * (hi - lo);
    const b = lo + g * (hi - lo);
    if (dist(a) < dist(b)) hi = b;
    else lo = a;
  }
  return Math.round((lo + hi) / 2);
}

const flights = new Map<number, Flight | null>();

/** Часы исторического полёта с Байконура; null — у аппарата нет своего времени (спутники Марса, все остальные). */
export function historicFlight(id: number): Flight | null {
  if (flights.has(id)) return flights.get(id)!;
  const o = historicById(id);
  let flight: Flight | null = null;
  if (o?.launch) {
    const startMs = Date.parse(o.epoch);
    // Посадку ищем на втором витке: от половины витка до двух витков после старта
    const T = prepareOrbit(historicRecord(o).elements).T * 1000;
    const endMs = o.landing ? closestApproach(historicRecord(o), o.landing, startMs + T / 2, startMs + 2 * T) : null;
    flight = { startMs, endMs };
  }
  flights.set(id, flight);
  return flight;
}
