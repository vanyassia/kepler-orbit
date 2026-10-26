/**
 * Получение элементов орбит из CelesTrak GP API с запасными вариантами:
 *
 *   свежий кэш (< 2 ч) → CelesTrak онлайн → устаревший кэш → встроенный снимок → ошибка.
 *
 * API: https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json
 *      https://celestrak.org/NORAD/elements/gp.php?NAME=ISS&FORMAT=json (поиск по подстроке)
 * Сервер отдаёт заголовок Access-Control-Allow-Origin: *, поэтому запросы идут прямо из браузера.
 */
import type { OrbitalElements } from '../physics/propagate';
import type { KeyValueStorage } from './cache';
import { defaultStorage, isFresh, readCache, writeCache } from './cache';
import type { OmmRecord } from './omm';
import { isOmmRecord, ommToElements } from './omm';

const GP_URL = 'https://celestrak.org/NORAD/elements/gp.php';
const FALLBACK_URL = `${import.meta.env?.BASE_URL ?? './'}data/fallback-gp.json`;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULTS = 25;

/** Откуда получены данные. */
export type DataSource = 'online' | 'cache' | 'fallback' | 'manual' | 'horizons';

export interface SatelliteRecord {
  elements: OrbitalElements;
  source: DataSource;
  /** Когда данные были получены из CelesTrak (мс Unix). */
  fetchedAt: number;
  /** Исходная запись каталога OMM (для справки; в расчёте используются только шесть элементов и эпоха). */
  omm?: OmmRecord;
  /** Строки TLE, если элементы введены вручную. */
  tle?: [string, string];
}

export interface SearchResult {
  items: SatelliteRecord[];
  source: DataSource;
  /** Сообщение для пользователя, если пришлось перейти на запасной источник. */
  notice?: string;
}

export interface LoaderOptions {
  fetchImpl?: typeof fetch;
  storage?: KeyValueStorage | null;
  signal?: AbortSignal;
  now?: number;
}

/** Снимок, встроенный в приложение (public/data/fallback-gp.json). */
interface FallbackSnapshot {
  savedAt: string;
  items: OmmRecord[];
}

let fallbackPromise: Promise<FallbackSnapshot> | null = null;

async function loadFallback(fetchImpl: typeof fetch): Promise<FallbackSnapshot> {
  fallbackPromise ??= fetchImpl(FALLBACK_URL).then((r) => {
    if (!r.ok) throw new Error(`Снимок данных недоступен (${r.status})`);
    return r.json() as Promise<FallbackSnapshot>;
  });
  try {
    return await fallbackPromise;
  } catch (e) {
    fallbackPromise = null;
    throw e;
  }
}

/** Сброс кэша снимка (для тестов). */
export function resetFallbackCache(): void {
  fallbackPromise = null;
}

/** Запрос к GP API. Возвращает массив OMM; пустой массив — «ничего не найдено». */
export async function fetchGp(
  params: { catnr?: number; name?: string },
  { fetchImpl = fetch, signal }: LoaderOptions = {},
): Promise<OmmRecord[]> {
  const url = new URL(GP_URL);
  if (params.catnr !== undefined) url.searchParams.set('CATNR', String(params.catnr));
  if (params.name !== undefined) url.searchParams.set('NAME', params.name);
  url.searchParams.set('FORMAT', 'json');

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const res = await fetchImpl(url.toString(), { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const text = await res.text();
  // CelesTrak на пустой результат отвечает текстом «No GP data found»
  if (/no gp data found/i.test(text)) return [];
  if (!res.ok) throw new Error(`CelesTrak ответил ${res.status}: ${text.slice(0, 120)}`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`CelesTrak: ${text.slice(0, 160) || 'пустой ответ'}`);
  }
  if (!Array.isArray(parsed)) throw new Error('CelesTrak вернул данные в неожиданном формате');
  return parsed.filter(isOmmRecord);
}

const toRecords = (items: OmmRecord[], source: DataSource, fetchedAt: number): SatelliteRecord[] =>
  items.flatMap((r) => {
    try {
      return [{ elements: ommToElements(r), source, fetchedAt, omm: r }];
    } catch {
      return []; // запись с некорректными элементами пропускаем
    }
  });

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Сначала названия, начинающиеся с запроса («ISS (ZARYA)» раньше «UME (ISS)»), затем по номеру NORAD. */
function rankByQuery(records: SatelliteRecord[], q: string): SatelliteRecord[] {
  const needle = q.toUpperCase();
  const rank = (r: SatelliteRecord) => (r.elements.name.toUpperCase().startsWith(needle) ? 0 : 1);
  return [...records].sort((a, b) => rank(a) - rank(b) || a.elements.noradId - b.elements.noradId);
}

/** Одинаковые одновременные запросы объединяются в один (не нагружаем CelesTrak дважды). */
const inflight = new Map<string, Promise<SatelliteRecord>>();

/** Загрузка спутника по номеру NORAD. */
export function loadByNorad(noradId: number, opts: LoaderOptions = {}): Promise<SatelliteRecord> {
  if (opts.fetchImpl || opts.storage !== undefined) return loadByNoradImpl(noradId, opts); // тесты
  const key = String(noradId);
  let p = inflight.get(key);
  if (!p) {
    p = loadByNoradImpl(noradId, opts).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function loadByNoradImpl(noradId: number, opts: LoaderOptions): Promise<SatelliteRecord> {
  const { fetchImpl = fetch, storage = defaultStorage(), now = Date.now() } = opts;
  const key = `catnr:${noradId}`;
  const cached = readCache<OmmRecord[]>(storage, key);

  if (cached && isFresh(cached, now) && cached.data.length) {
    const [rec] = toRecords(cached.data, 'cache', cached.savedAt);
    if (rec) return rec;
  }

  let networkError: unknown;
  try {
    const items = await fetchGp({ catnr: noradId }, opts);
    if (items.length) {
      writeCache(storage, key, items, now);
      const [rec] = toRecords(items, 'online', now);
      if (rec) return rec;
    }
    networkError = new Error(`Спутник NORAD ${noradId} не найден в каталоге CelesTrak`);
  } catch (e) {
    if (isAbort(e) && opts.signal?.aborted) throw e;
    networkError = e;
  }

  if (cached?.data.length) {
    const [rec] = toRecords(cached.data, 'cache', cached.savedAt);
    if (rec) return rec;
  }

  try {
    const snap = await loadFallback(fetchImpl);
    const found = snap.items.find((r) => Number(r.NORAD_CAT_ID) === noradId);
    if (found) {
      const [rec] = toRecords([found], 'fallback', Date.parse(snap.savedAt));
      if (rec) return rec;
    }
  } catch {
    // снимок тоже недоступен — сообщим исходную ошибку
  }
  throw networkError instanceof Error ? networkError : new Error('Не удалось загрузить данные спутника');
}

/**
 * Поиск по названию или номеру NORAD. Только цифры → поиск по номеру,
 * иначе — по подстроке названия (латиницей, как в каталоге CelesTrak).
 */
export async function searchSatellites(query: string, opts: LoaderOptions = {}): Promise<SearchResult> {
  const { fetchImpl = fetch, storage = defaultStorage(), now = Date.now() } = opts;
  const q = query.trim();
  if (!q) return { items: [], source: 'online' };

  if (/^\d{1,9}$/.test(q)) {
    try {
      const rec = await loadByNorad(Number(q), opts);
      return { items: [rec], source: rec.source };
    } catch (e) {
      if (isAbort(e)) throw e;
      return { items: [], source: 'online', notice: e instanceof Error ? e.message : String(e) };
    }
  }

  const key = `name:${q.toUpperCase()}`;
  const cached = readCache<OmmRecord[]>(storage, key);
  if (cached && isFresh(cached, now)) {
    return { items: rankByQuery(toRecords(cached.data, 'cache', cached.savedAt), q).slice(0, MAX_RESULTS), source: 'cache' };
  }

  try {
    const items = await fetchGp({ name: q }, opts);
    writeCache(storage, key, items, now);
    return { items: rankByQuery(toRecords(items, 'online', now), q).slice(0, MAX_RESULTS), source: 'online' };
  } catch (e) {
    if (isAbort(e) && opts.signal?.aborted) throw e;
    const notice = 'CelesTrak недоступен — показаны сохранённые данные';
    if (cached) return { items: rankByQuery(toRecords(cached.data, 'cache', cached.savedAt), q).slice(0, MAX_RESULTS), source: 'cache', notice };
    try {
      const snap = await loadFallback(fetchImpl);
      const needle = q.toUpperCase();
      const found = snap.items.filter((r) => String(r.OBJECT_NAME).toUpperCase().includes(needle));
      return { items: toRecords(found, 'fallback', Date.parse(snap.savedAt)), source: 'fallback', notice };
    } catch {
      return { items: [], source: 'fallback', notice: 'Нет связи с CelesTrak и нет сохранённых данных' };
    }
  }
}
