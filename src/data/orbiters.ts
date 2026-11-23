/**
 * Спутники Луны, Марса и Венеры: аппараты, а у Марса ещё Фобос и Деймос. Сюда же — сама Луна как спутник Земли. Элементы орбит берутся из JPL Horizons
 * (оскулирующие элементы в системе «экватор тела и узел») и хранятся снимком
 * в public/data/orbiters.json — у Horizons нет CORS, браузер не может запросить его напрямую.
 * Обновление: npm run update:orbiters.
 */
import type { BodyId } from '../physics/bodies';
import type { SatelliteRecord } from './celestrak';
import { HISTORIC_ORBITERS, historicById, historicRecord, SPUTNIK1_ID, VOSTOK1_ID } from './historicOrbiters';
import { MOON_NAIF_ID } from './popular';

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
  { naifId: -248, body: 'venus', title: 'Venus Express', note: 'Полярная орбита ЕКА, данные до декабря 2014' },
  { naifId: -5, body: 'venus', title: 'Акацуки', note: 'Японский орбитер, обратная орбита, данные до июля 2025' },
  { naifId: 602, body: 'saturn', title: 'Энцелад', note: 'Ледяной спутник, период ≈ 33 ч' },
  { naifId: 606, body: 'saturn', title: 'Титан', note: 'Крупнейший спутник Сатурна, период ≈ 16 суток' },
  { naifId: -82, body: 'saturn', title: 'Кассини', note: 'Последний полный виток, 5–12 сентября 2017 года' },
  // Исторические орбиты; у Земли (Восток-1, Спутник-1) они стоят в списке popular.ts
  ...HISTORIC_ORBITERS.map((o): Orbiter => ({ naifId: o.id, body: o.body, title: o.title, note: o.note })),
];

/** Спутник из снимка JPL Horizons, а не из каталога CelesTrak. */
export const isOrbiterId = (body: BodyId, id: number) => ORBITERS.some((o) => o.body === body && o.naifId === id);

/** Тело для старой ссылки без параметра body. Новые спутники Сатурна требуют явного тела. */
export const legacyBodyFor = (id: number): BodyId =>
  ORBITERS.find((o) => o.body !== 'saturn' && o.naifId === id)?.body ?? 'earth';

export const CASSINI_WINDOW = {
  startMs: Date.UTC(2017, 8, 5, 18, 47),
  endMs: Date.UTC(2017, 8, 12, 5, 27),
};

/** Границы витка № 292 по журналу NASA; общие для часов, трассы и выгрузки. */
export const cassiniWindow = (body: BodyId | undefined, id: number | undefined) =>
  body === 'saturn' && id === -82 ? CASSINI_WINDOW : null;

export type NaturalSatellite = 'moon' | 'phobos' | 'deimos' | 'enceladus' | 'titan';

/** Естественный спутник — рисуется телом (шар, «картофелина»), а не значком аппарата; иначе null. */
export function naturalSatellite(el: { noradId: number; body?: BodyId }): NaturalSatellite | null {
  const body = el.body ?? 'earth';
  if (el.noradId === MOON_NAIF_ID && body === 'earth') return 'moon';
  if (el.noradId === 401 && body === 'mars') return 'phobos';
  if (el.noradId === 402 && body === 'mars') return 'deimos';
  if (el.noradId === 602 && body === 'saturn') return 'enceladus';
  if (el.noradId === 606 && body === 'saturn') return 'titan';
  return null;
}

/** Номер МКС в каталоге NORAD. */
export const ISS_NORAD = 25544;

/** МКС — рисуется своим значком на карте и своей моделью на глобусе (ферма, восемь золотистых панелей, модули). */
export function isIss(el: { noradId: number; body?: BodyId }): boolean {
  return el.noradId === ISS_NORAD && (el.body ?? 'earth') === 'earth';
}

/** Аппараты со своим значком на карте и своей моделью на глобусе (у остальных — общий значок аппарата). */
export type OwnLook = 'iss' | 'vostok' | 'sputnik';

export function ownLook(el: { noradId: number; body?: BodyId }): OwnLook | null {
  if (isIss(el)) return 'iss';
  if ((el.body ?? 'earth') !== 'earth') return null;
  if (el.noradId === VOSTOK1_ID) return 'vostok';
  if (el.noradId === SPUTNIK1_ID) return 'sputnik';
  return null;
}

/** Спутник по умолчанию для каждого тела. */
export const DEFAULT_SATELLITE: Record<BodyId, number> = { earth: 25544, moon: -85, mars: -74, venus: -248, saturn: 602 };

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

/** Элементы из снимка JPL Horizons или из исторического каталога. */
export async function loadOrbiter(body: BodyId, naifId: number): Promise<SatelliteRecord> {
  const historic = historicById(naifId);
  if (historic?.body === body) return historicRecord(historic);
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
  const it = snap.items.find((x) => x.body === body && x.naifId === naifId);
  const meta = ORBITERS.find((o) => o.body === body && o.naifId === naifId);
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
