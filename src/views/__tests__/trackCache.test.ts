import { describe, expect, it } from 'vitest';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { DEG, RAD } from '../../physics/constants';
import { MAX_WINDOW_POINTS, orbitSource, TrackCache, trackSpan, type TrackSource } from '../trackCache';

const T0 = Date.UTC(2026, 9, 31, 12);
const elements = (meanMotion: number, eccentricity = 0.001) => ({
  name: 'test',
  noradId: 1,
  epochMs: T0,
  meanMotion,
  eccentricity,
  inclinationDeg: 51.6,
  raanDeg: 10,
  argPerigeeDeg: 20,
  meanAnomalyDeg: 30,
});

describe('Скользящий кэш трассы', () => {
  const orbit = prepareOrbit(elements(15.5));
  const src = orbitSource(orbit);

  it('между шагами сетки меняется только текущая точка: те же массивы и тот же номер набора', () => {
    const c = new TrackCache();
    const a = c.get(src, T0, 1, 2)!;
    const past = a.past;
    const future = a.future;
    const revision = a.revision;
    const b = c.get(src, T0 + 1000, 1, 2)!;
    expect(b.revision).toBe(revision);
    expect(b.past).toBe(past);
    expect(b.future).toBe(future);
    expect(b.past[b.past.length - 1]).toBe(b.current);
    expect(b.future[0]).toBe(b.current);
    expect(b.current.timeMs).toBe(T0 + 1000);
  });

  it('текущая точка совпадает с расчётом модели', () => {
    const c = new TrackCache();
    const w = c.get(src, T0 + 12_345, 1, 2)!;
    const s = propagate(orbit, T0 + 12_345);
    expect(w.current.lat).toBeCloseTo(s.lat * RAD, 9);
    expect(w.current.lon).toBeCloseTo(s.lon * RAD, 9);
  });

  it('новый шаг сетки, другое число витков и другая орбита дают новый набор', () => {
    const c = new TrackCache();
    const first = c.get(src, T0, 1, 2)!.revision;
    const step = src.stepSec * 1000;
    expect(c.get(src, T0 + 2 * step, 1, 2)!.revision).not.toBe(first);
    const second = c.get(src, T0 + 2 * step, 1, 2)!.revision;
    expect(c.get(src, T0 + 2 * step, 2, 2)!.revision).not.toBe(second);
    const third = c.get(src, T0 + 2 * step, 2, 2)!.revision;
    expect(c.get(orbitSource(prepareOrbit(elements(14))), T0, 2, 2)!.revision).not.toBe(third);
  });

  it('в окне нет разрывов по времени и повторов', () => {
    const c = new TrackCache();
    const w = c.get(src, T0 + 500, 2, 3)!;
    const all = [...w.past, ...w.future.slice(1)];
    for (let k = 1; k < all.length; k++) expect(all[k].timeMs).toBeGreaterThan(all[k - 1].timeMs);
    expect(all[0].timeMs).toBeLessThanOrEqual(T0 + 500 - 2 * orbit.T * 1000 + src.stepSec * 1000);
    expect(all[all.length - 1].timeMs).toBeGreaterThanOrEqual(T0 + 500 + 3 * orbit.T * 1000 - src.stepSec * 1000);
  });

  it('промежуточные точки уходят с начала и добавляются в конец окна при сдвиге времени', () => {
    const fast: TrackSource = {
      key: {},
      periodSec: 100,
      stepSec: 8,
      fromMs: -Infinity,
      at: (timeMs) => {
        const lon = [8000, 208_000].reduce((lon, start) => lon + Math.max(0, Math.min(20, (timeMs - start) / 400)), 0);
        return { timeMs, lat: 0, lon, h: 100 };
      },
    };
    const cache = new TrackCache();
    for (const time of [109_999, 110_000, 110_001, 110_000, 109_999]) {
      const w = cache.get(fast, time, 1, 1)!;
      expect(w.past[0].timeMs).toBe(time <= 110_000 ? 10_000 : 12_000);
      expect(w.future.at(-1)?.timeMs).toBe(time >= 110_000 ? 210_000 : 208_000);
    }
    // В момент совпадения с расчётной точкой её заменяет текущая точка.
    cache.get(fast, 9999, 1, 1);
    const w = cache.get(fast, 10_000, 1, 1)!;
    expect(w.future[1].timeMs).toBe(12_000);
  });

  it('на восьми витках «Акацуки» сохраняется детализация у каждого перицентра', () => {
    const orbit = prepareOrbit({
      ...elements(0.0003772408189842064 * 240, 0.9417604620249725),
      body: 'venus',
      inclinationDeg: 160.5675,
      raanDeg: 313.4762,
      argPerigeeDeg: 347.7812,
      meanAnomalyDeg: 68.7073,
    });
    const cache = new TrackCache();
    const src = orbitSource(orbit);
    for (const time of [T0, T0 + 0.24 * orbit.T * 1000]) {
      const { past, future } = cache.get(src, time, 5, 8)!;
      for (const points of [past, future]) {
        expect(points.length).toBeLessThanOrEqual(MAX_WINDOW_POINTS);
        let maxArc = 0;
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const hav = Math.sin((b.lat - a.lat) * DEG / 2) ** 2
            + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin((b.lon - a.lon) * DEG / 2) ** 2;
          maxArc = Math.max(maxArc, 2 * Math.asin(Math.sqrt(hav)) * RAD);
        }
        expect(maxArc).toBeLessThan(2);
      }
      expect(future.at(-1)!.timeMs - time).toBeGreaterThan(7.99 * orbit.T * 1000);
    }
  });

  it('окно длинной орбиты вмещается в линии глобуса (Спектр-Р, 8 витков вперёд)', () => {
    const long = orbitSource(prepareOrbit(elements(0.12, 0.93)));
    const w = new TrackCache().get(long, T0, 5, 8)!;
    expect(w.past.length).toBeLessThanOrEqual(MAX_WINDOW_POINTS);
    expect(w.future.length).toBeLessThanOrEqual(MAX_WINDOW_POINTS);
    // Окно дотягивается до конца восьмого витка
    expect(w.future[w.future.length - 1].timeMs).toBeGreaterThan(T0 + 7.99 * long.periodSec * 1000);
  });

  it('вытянутая полярная орбита с быстрым перицентром у полюса (Venus Express) не срезает вершину', () => {
    const vex = prepareOrbit({
      name: 'Venus Express',
      noradId: -248,
      body: 'venus',
      epochMs: T0,
      meanMotion: 86400 / 81009,
      eccentricity: 0.8334,
      inclinationDeg: 89.83,
      raanDeg: 103.9,
      argPerigeeDeg: 73.8,
      meanAnomalyDeg: 325.3,
    });
    const w = new TrackCache().get(orbitSource(vex), T0 + 1000, 1, 1)!;
    const all = [...w.past, ...w.future.slice(1)];
    for (let k = 1; k < all.length; k++) expect(all[k].timeMs).toBeGreaterThan(all[k - 1].timeMs);
    expect(Math.max(...all.map((p) => p.lat))).toBeGreaterThan(89.8);
    expect(Math.min(...all.map((p) => p.lat))).toBeLessThan(-89.8);
    expect(w.past.length).toBeLessThanOrEqual(MAX_WINDOW_POINTS);
    expect(w.future.length).toBeLessThanOrEqual(MAX_WINDOW_POINTS);
  });
});

describe('Окно трассы очень долгих орбит', () => {
  it('у обычных орбит — выбранное число витков', () => {
    expect(trackSpan(prepareOrbit(elements(15.5)), 1, 2)).toEqual({ back: 1, forward: 2 });
    // Чандра, T ≈ 64 ч: целые витки, как раньше
    expect(trackSpan(prepareOrbit(elements(0.378, 0.76)), 1, 2)).toEqual({ back: 1, forward: 2 });
  });

  it('у Луны виток трассы — оборот подлунной точки, ≈ 24 ч 50 мин', () => {
    const moon = prepareOrbit(elements(1 / 27.32, 0.055));
    const { back, forward } = trackSpan(moon, 1, 2);
    expect((back * moon.T) / 3600).toBeCloseTo(24.84, 1);
    expect(forward).toBeCloseTo(2 * back, 10);
  });

  it('у Венеры учитывается обратное вращение: прямая орбита короче витка, обратная — длиннее', () => {
    const Tdays = 35;
    const direct = prepareOrbit({ ...elements(1 / Tdays), body: 'venus', inclinationDeg: 60 });
    const retro = prepareOrbit({ ...elements(1 / Tdays), body: 'venus', inclinationDeg: 160 });
    const dSpan = trackSpan(direct, 1, 2);
    const rSpan = trackSpan(retro, 1, 2);
    // Венера крутится навстречу прямой орбите (1/35 + 1/243,02 → ~30,6 сут) и попутно обратной (1/35 − 1/243,02 → ~40,9 сут)
    expect((dSpan.back * direct.T) / 86400).toBeCloseTo(1 / (1 / Tdays + 1.4813688 / 360), 2);
    expect((rSpan.back * retro.T) / 86400).toBeCloseTo(1 / (1 / Tdays - 1.4813688 / 360), 2);
    expect(dSpan.back).toBeLessThan(1);
    expect(rSpan.back).toBeGreaterThan(1);
  });

  it('синхронная долгая орбита (например, на Луне с T = T_вращ) не даёт бесконечность', () => {
    const syncMoon = prepareOrbit({ ...elements(13.17635815 / 360), body: 'moon', inclinationDeg: 0 });
    expect(trackSpan(syncMoon, 1, 2)).toEqual({ back: 1, forward: 2 });
  });
});

describe('Исторический полёт: трасса начинается со старта', () => {
  it('у Востока-1 в момент старта прошедшей трассы нет, через полвитка она начинается у Байконура', async () => {
    const { historicById, historicRecord, VOSTOK1_ID, BAIKONUR } = await import('../../data/historicOrbiters');
    const orbit = prepareOrbit(historicRecord(historicById(VOSTOK1_ID)!).elements);
    const start = orbit.epochMs;
    const src = orbitSource(orbit);
    expect(src.fromMs).toBe(start);
    const c = new TrackCache();
    // В момент старта прошедшая часть — только текущая точка
    expect(c.get(src, start, 1, 2)!.past).toHaveLength(1);
    // Через полвитка первая точка прошедшей части — не раньше старта и рядом с Байконуром
    const w = new TrackCache().get(src, start + (orbit.T * 1000) / 2, 1, 2)!;
    expect(w.past[0].timeMs).toBeGreaterThanOrEqual(start);
    expect(w.past[0].timeMs - start).toBeLessThan(src.stepSec * 1000);
    expect(Math.abs(w.past[0].lat - BAIKONUR.lat)).toBeLessThan(1);
    // Будущее до старта (если часы увели раньше) тоже не рисуется
    expect(new TrackCache().get(src, start - 3_600_000, 1, 2)!.future.slice(1).every((p) => p.timeMs >= start)).toBe(true);
  });
});
