/**
 * Кэш ответов CelesTrak в localStorage.
 *
 * CelesTrak просит не запрашивать одни и те же данные чаще раза в 2 часа
 * (элементы обновляются примерно с такой частотой), поэтому свежий кэш
 * используется без обращения к сети, а устаревший — как запасной вариант.
 */
export const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const PREFIX = 'kepler:gp:';

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface CacheEntry<T> {
  savedAt: number;
  data: T;
}

/** localStorage, если он доступен (в приватном режиме или при запрете — нет). */
export function defaultStorage(): KeyValueStorage | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    s.getItem('kepler:probe');
    return s;
  } catch {
    return null;
  }
}

export function readCache<T>(storage: KeyValueStorage | null, key: string): CacheEntry<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    return typeof entry?.savedAt === 'number' ? entry : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(storage: KeyValueStorage | null, key: string, data: T, now = Date.now()): void {
  if (!storage) return;
  try {
    storage.setItem(PREFIX + key, JSON.stringify({ savedAt: now, data } satisfies CacheEntry<T>));
  } catch {
    // Переполнение хранилища не должно ломать приложение
  }
}

export function isFresh(entry: CacheEntry<unknown>, now = Date.now()): boolean {
  return now - entry.savedAt < CACHE_TTL_MS;
}
