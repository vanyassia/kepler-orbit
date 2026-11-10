/**
 * Встроенные снимки элементов (public/data): в них должны быть все спутники из списков сайта.
 * Тест запускается и в ежедневном обновлении данных: если источник не ответил и спутник выпал
 * из снимка, обновление останавливается, а на сайте остаётся прежний снимок.
 * (Так 04.11.2026 из снимка пропал Спектр-Р: CelesTrak ответил «No GP data found».)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseEpochUtc } from '../../physics/time';
import { HISTORIC_ORBITERS } from '../historicOrbiters';
import { isOmmRecord, type OmmRecord } from '../omm';
import { ORBITERS } from '../orbiters';
import { MOON_NAIF_ID, POPULAR_SATELLITES } from '../popular';

const dataDir = join(import.meta.dirname, '..', '..', '..', 'public', 'data');
const gp = JSON.parse(readFileSync(join(dataDir, 'fallback-gp.json'), 'utf8')) as { savedAt: string; items: OmmRecord[] };
const orbiters = JSON.parse(readFileSync(join(dataDir, 'orbiters.json'), 'utf8')) as {
  savedAt: string;
  items: { naifId: number; body: string; epoch: string; eccentricity: number; meanMotionDegPerSec: number; semiMajorAxisKm: number }[];
};

describe('Снимок CelesTrak (fallback-gp.json)', () => {
  const earth = POPULAR_SATELLITES.filter((p) => p.noradId !== MOON_NAIF_ID);

  it.each(earth.map((p) => [p.title, p.noradId] as const))('%s (NORAD %i) есть в снимке', (_title, id) => {
    const rec = gp.items.find((r) => Number(r.NORAD_CAT_ID) === id);
    expect(rec, `спутника ${id} нет в снимке`).toBeDefined();
    expect(isOmmRecord(rec)).toBe(true);
  });

  it('у каждого спутника одна запись', () => {
    const ids = gp.items.map((r) => Number(r.NORAD_CAT_ID));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('единицы: среднее движение в оборотах в сутки, углы в градусах, эпоха — UTC', () => {
    for (const r of gp.items) {
      // От Луны (0,037 об/сут) до самой низкой орбиты (≈ 16,5 об/сут): рад/с или °/с сюда не попадут
      expect(r.MEAN_MOTION).toBeGreaterThan(0.03);
      expect(r.MEAN_MOTION).toBeLessThan(17);
      expect(r.INCLINATION).toBeGreaterThanOrEqual(0);
      expect(r.INCLINATION).toBeLessThanOrEqual(180);
      for (const k of ['RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY'] as const) {
        expect(r[k]).toBeGreaterThanOrEqual(0);
        expect(r[k]).toBeLessThan(360);
      }
      const epoch = parseEpochUtc(r.EPOCH);
      // Эпоха не позже снимка больше чем на месяц (элементы с прогнозом манёвра бывают чуть «из будущего»)
      // и не раньше космической эры; у брошенных аппаратов она может быть сколь угодно старой
      expect(epoch).toBeLessThan(Date.parse(gp.savedAt) + 30 * 86_400_000);
      expect(epoch).toBeGreaterThan(Date.UTC(1957, 9, 4));
    }
  });
});

describe('Снимок JPL Horizons (orbiters.json)', () => {
  const historic = new Set(HISTORIC_ORBITERS.map((o) => o.id));
  const fromHorizons = ORBITERS.filter((o) => !historic.has(o.naifId));

  it.each(fromHorizons.map((o) => [o.title, o.naifId, o.body] as const))('%s (NAIF %i) есть в снимке', (_title, id, body) => {
    const it = orbiters.items.find((x) => x.naifId === id);
    expect(it, `аппарата ${id} нет в снимке`).toBeDefined();
    expect(it!.body).toBe(body);
    expect(Number.isFinite(Date.parse(it!.epoch))).toBe(true);
    expect(it!.eccentricity).toBeGreaterThanOrEqual(0);
    expect(it!.eccentricity).toBeLessThan(1);
  });

  it('единицы: среднее движение в °/с согласовано с большой полуосью в км (третий закон Кеплера)', () => {
    // μ, которое Horizons подставляет сам: n²a³ = μ. Для Луны и Марса оно совпадает с μ модели,
    // для Луны вокруг Земли Horizons берёт сумму масс Земли и Луны (403 503 км³/с²).
    const expected: Record<string, [number, number]> = { moon: [4902.7, 4902.9], mars: [42828, 42829], earth: [398600, 403600] };
    for (const it of orbiters.items) {
      const n = (it.meanMotionDegPerSec * Math.PI) / 180;
      const mu = n * n * it.semiMajorAxisKm ** 3;
      const [lo, hi] = expected[it.body];
      expect(mu, `NAIF ${it.naifId}`).toBeGreaterThan(lo);
      expect(mu, `NAIF ${it.naifId}`).toBeLessThan(hi);
    }
  });
});
