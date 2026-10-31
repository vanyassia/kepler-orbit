import { describe, expect, it } from 'vitest';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { RAD } from '../../physics/constants';
import { MAX_WINDOW_POINTS, orbitSource, TrackCache } from '../trackCache';

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

  it('окно длинной орбиты вмещается в линии глобуса (Спектр-Р, 8 витков вперёд)', () => {
    const long = orbitSource(prepareOrbit(elements(0.12, 0.93)));
    const w = new TrackCache().get(long, T0, 5, 8)!;
    expect(w.past.length).toBeLessThanOrEqual(MAX_WINDOW_POINTS);
    expect(w.future.length).toBeLessThanOrEqual(MAX_WINDOW_POINTS);
    // Окно дотягивается до конца восьмого витка
    expect(w.future[w.future.length - 1].timeMs).toBeGreaterThan(T0 + 7.99 * long.periodSec * 1000);
  });
});
