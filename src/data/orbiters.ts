/**
 * Спутники Луны и Марса: аппараты, а у Марса ещё Фобос и Деймос. Сюда же — сама Луна как спутник Земли. Элементы орбит берутся из JPL Horizons
 * (оскулирующие элементы в системе «экватор тела и узел») и хранятся снимком
 * в public/data/orbiters.json — у Horizons нет CORS, браузер не может запросить его напрямую.
 * Обновление: npm run update:orbiters.
 */
import type { BodyId } from '../physics/bodies';
import type { SatelliteRecord } from './celestrak';
import { HISTORIC_ORBITERS, historicRecord } from './historicOrbiters';

export interface Orbiter {
  /** Идентификатор NAIF (у космических аппаратов — отрицательный, у естественных спутников — положительный). */
  naifId: number;
  body: BodyId;
  title: string;
  note: string;
}

export const ORBITERS: Orbiter[] = [
  // Луна вокруг Земли; в списке Земли она стоит в popular.ts (MOON_NAIF_ID)
  { naifId: 301, body: 'earth', title: 'Луна', note: 'Естественный спутник Земли, T ≈ 27,3 сут' },
  { naifId: -85, body: 'moon', title: 'LRO', note: 'Картографирование Луны, полярная орбита' },
  { naifId: -152, body: 'moon', title: 'Чандраян-2', note: 'Индийский орбитальный модуль' },
  { naifId: -155, body: 'moon', title: 'Danuri', note: 'Корейский лунный орбитер' },
  { naifId: -192, body: 'moon', title: 'ARTEMIS-P1', note: 'Бывший THEMIS-B, вытянутая орбита' },
  { naifId: -193, body: 'moon', title: 'ARTEMIS-P2', note: 'Бывший THEMIS-C, вытянутая орбита' },
  { naifId: -86, body: 'moon', title: 'Чандраян-1', note: 'Индийский орбитер, данные до октября 2022' },
  { naifId: -74, body: 'mars', title: 'MRO', note: 'Съёмка высокого разрешения, ~280 км' },
  { naifId: -143, body: 'mars', title: 'TGO', note: 'ExoMars (ЕКА и Роскосмос)' },
  { naifId: -53, body: 'mars', title: 'Mars Odyssey', note: 'Солнечно-синхронная орбита' },
  { naifId: -41, body: 'mars', title: 'Mars Express', note: 'Вытянутая орбита, e ≈ 0,57' },
  { naifId: -62, body: 'mars', title: 'Hope', note: 'Высокая орбита, до 43 000 км' },
  { naifId: -202, body: 'mars', title: 'MAVEN', note: 'Изучение атмосферы, данные до марта 2026' },
  { naifId: -3, body: 'mars', title: 'Mangalyaan', note: 'Индийский орбитер, данные до ноября 2022' },
  { naifId: 401, body: 'mars', title: 'Фобос', note: 'Естественный спутник, T ≈ 7,7 ч' },
  { naifId: 402, body: 'mars', title: 'Деймос', note: 'Естественный спутник, T ≈ 30,3 ч' },
  ...HISTORIC_ORBITERS.map((o): Orbiter => ({ naifId: o.id, body: 'mars', title: o.title, note: o.note })),
];

/** Спутник из снимка JPL Horizons, а не из каталога CelesTrak. */
export const isOrbiterId = (id: number) => id < 0 || ORBITERS.some((o) => o.naifId === id);

/** Спутник по умолчанию для каждого тела. */
export const DEFAULT_SATELLITE: Record<BodyId, number> = { earth: 25544, moon: -85, mars: -74 };

// ── Загрузка снимка ─────────────────────────────────────────────────────────

interface OrbiterSnapshotItem {
  naifId: number;
  body: BodyId;
  name: string;
  epoch: string;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionDegPerSec: number;
}

let snapshot: Promise<{ savedAt: string; items: OrbiterSnapshotItem[] }> | null = null;

/** Элементы спутника Луны или Марса из снимка JPL Horizons. */
export async function loadOrbiter(naifId: number): Promise<SatelliteRecord> {
  const historic = HISTORIC_ORBITERS.find((o) => o.id === naifId);
  if (historic) return historicRecord(historic);
  // no-cache: сайт разрешает кэшировать файлы 10 минут, а старый снимок не подходит к новому списку
  snapshot ??= fetch(`${import.meta.env.BASE_URL}data/orbiters.json`, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`Снимок элементов JPL Horizons недоступен (${r.status})`);
    return r.json();
  });
  let snap;
  try {
    snap = await snapshot;
  } catch (e) {
    snapshot = null;
    throw e;
  }
  const it = snap.items.find((x) => x.naifId === naifId);
  const meta = ORBITERS.find((o) => o.naifId === naifId);
  if (!it) {
    snapshot = null; // при следующем выборе запросить снимок заново
    throw new Error(`Спутник NAIF ${naifId} не найден в снимке JPL Horizons`);
  }
  return {
    source: 'horizons',
    fetchedAt: Date.parse(snap.savedAt),
    elements: {
      name: meta?.title ?? (it.name || `NAIF ${naifId}`),
      noradId: naifId,
      body: it.body,
      epochMs: Date.parse(it.epoch),
      // Среднее движение Horizons, °/с → об/сут (формула (1) работает с об/сут)
      meanMotion: (it.meanMotionDegPerSec * 86400) / 360,
      eccentricity: it.eccentricity,
      inclinationDeg: it.inclinationDeg,
      raanDeg: it.raanDeg,
      argPerigeeDeg: it.argPerigeeDeg,
      meanAnomalyDeg: it.meanAnomalyDeg,
    },
  };
}
