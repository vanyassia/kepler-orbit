import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_TTL_MS, type KeyValueStorage } from '../cache';
import { loadByNorad, resetFallbackCache, searchSatellites } from '../celestrak';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { ommToElements, type OmmRecord } from '../omm';

const fixtures = join(import.meta.dirname, 'fixtures');
const issJson = readFileSync(join(fixtures, 'iss.json'), 'utf8');
const snapshot = readFileSync(join(import.meta.dirname, '..', '..', '..', 'public', 'data', 'fallback-gp.json'), 'utf8');

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
}

const NOW = Date.UTC(2026, 9, 22, 12);

/** Подставной fetch: CelesTrak отвечает заданным образом, снимок — из public/data. */
function mockFetch(celestrak: () => Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('fallback-gp.json')) return new Response(snapshot);
    return celestrak();
  }) as unknown as typeof fetch;
}

const offline = () => Promise.reject(new TypeError('Failed to fetch'));

beforeEach(() => resetFallbackCache());

describe('Загрузка по номеру NORAD', () => {
  it('онлайн: данные CelesTrak, запись в кэш', async () => {
    const storage = new MemoryStorage();
    const rec = await loadByNorad(25544, { fetchImpl: mockFetch(async () => new Response(issJson)), storage, now: NOW });
    expect(rec.source).toBe('online');
    expect(rec.elements.name).toBe('ISS (ZARYA)');
    expect(storage.map.size).toBe(1);
  });

  it('свежий кэш используется без запроса к сети (правило CelesTrak «не чаще раза в 2 ч»)', async () => {
    const storage = new MemoryStorage();
    await loadByNorad(25544, { fetchImpl: mockFetch(async () => new Response(issJson)), storage, now: NOW });
    const fetchImpl = mockFetch(async () => new Response(issJson));
    const rec = await loadByNorad(25544, { fetchImpl, storage, now: NOW + 60_000 });
    expect(rec.source).toBe('cache');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('нет сети, кэш устарел → устаревший кэш', async () => {
    const storage = new MemoryStorage();
    await loadByNorad(25544, { fetchImpl: mockFetch(async () => new Response(issJson)), storage, now: NOW });
    const rec = await loadByNorad(25544, { fetchImpl: mockFetch(offline), storage, now: NOW + CACHE_TTL_MS + 1 });
    expect(rec.source).toBe('cache');
    expect(rec.fetchedAt).toBe(NOW);
  });

  it('нет сети и кэша → встроенный снимок', async () => {
    const rec = await loadByNorad(52145, { fetchImpl: mockFetch(offline), storage: new MemoryStorage(), now: NOW });
    expect(rec.source).toBe('fallback');
    expect(rec.elements.name).toMatch(/MERIDIAN/);
  });

  it('спутника нет нигде → понятная ошибка', async () => {
    await expect(
      loadByNorad(99999, { fetchImpl: mockFetch(async () => new Response('No GP data found')), storage: new MemoryStorage(), now: NOW }),
    ).rejects.toThrow(/не найден/);
  });

  it('CelesTrak вернул текст вместо JSON (ограничение частоты) → снимок', async () => {
    const rec = await loadByNorad(25544, {
      fetchImpl: mockFetch(async () => new Response('GP data has not updated since your last successful download', { status: 403 })),
      storage: new MemoryStorage(),
      now: NOW,
    });
    expect(rec.source).toBe('fallback');
  });
});

describe('Поиск', () => {
  it('цифры → поиск по номеру', async () => {
    const res = await searchSatellites(' 25544 ', { fetchImpl: mockFetch(async () => new Response(issJson)), storage: new MemoryStorage(), now: NOW });
    expect(res.items).toHaveLength(1);
    expect(res.items[0].elements.noradId).toBe(25544);
  });

  it('по названию без сети → поиск по снимку с пояснением', async () => {
    const res = await searchSatellites('meteor', { fetchImpl: mockFetch(offline), storage: new MemoryStorage(), now: NOW });
    expect(res.source).toBe('fallback');
    expect(res.notice).toBeTruthy();
    expect(res.items.map((r) => r.elements.name)).toContain('METEOR-M2 3');
  });

  it('пустой запрос → пустой результат без обращения к сети', async () => {
    const fetchImpl = mockFetch(offline);
    expect((await searchSatellites('  ', { fetchImpl })).items).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('Встроенный снимок: все спутники дают правдоподобные орбиты', () => {
  const items = (JSON.parse(snapshot) as { items: OmmRecord[] }).items;
  it.each(items.map((r) => [r.OBJECT_NAME, r] as const))('%s', (_name, r) => {
    const orbit = prepareOrbit(ommToElements(r));
    const s = propagate(orbit, NOW);
    expect(orbit.hPerigee).toBeGreaterThan(150);
    expect(orbit.hApogee).toBeLessThan(45000);
    expect(Math.abs(s.lat)).toBeLessThanOrEqual(orbit.i + 1e-9);
    expect(s.h).toBeGreaterThanOrEqual(orbit.hPerigee - 1e-6);
    expect(s.h).toBeLessThanOrEqual(orbit.hApogee + 1e-6);
  });
});
