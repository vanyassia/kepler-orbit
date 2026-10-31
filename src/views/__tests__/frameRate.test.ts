import { describe, expect, it } from 'vitest';
import { prepareOrbit } from '../../physics/propagate';
import { frameDue, MAX_FRAME_INTERVAL_MS, MIN_SHIFT_PX, peakAngularRateDeg, pixelsPerUnit, simMsPerShift } from '../frameRate';

describe('Частота кадров по содержанию картинки', () => {
  it('пиксели на единицу сцены: половина высоты кадра на расстоянии, где единица заполняет её', () => {
    expect(pixelsPerUnit(800, 90, 1)).toBeCloseTo(400, 6);
    expect(pixelsPerUnit(800, 90, 2)).toBeCloseTo(200, 6);
  });

  it('шаг времени обратен скорости картинки', () => {
    expect(simMsPerShift(1)).toBeCloseTo(MIN_SHIFT_PX * 1000, 6);
    expect(simMsPerShift(2)).toBeCloseTo((MIN_SHIFT_PX * 1000) / 2, 6);
    expect(simMsPerShift(0)).toBe(Infinity);
  });

  it('на ×1 кадр нужен при заметном сдвиге, после долгого простоя и если кадра ещё не было', () => {
    expect(frameDue(1, 100, 10, 500)).toBe(false);
    expect(frameDue(1, 500, 10, 500)).toBe(true);
    expect(frameDue(1, 100, MAX_FRAME_INTERVAL_MS, 500)).toBe(true);
    expect(frameDue(1, Number.NaN, 0, 500)).toBe(true);
  });

  it('при ускорении времени кадр нужен всегда: движение не должно идти рывками', () => {
    for (const speed of [10, 60, 300, 1000, 5000]) expect(frameDue(speed, 1, 1, 500)).toBe(true);
  });

  it('угловая скорость в перицентре: круговая орбита — n, эллипс — выше по закону площадей', () => {
    const base = { name: 't', noradId: 1, epochMs: 0, meanMotion: 2, inclinationDeg: 60, raanDeg: 0, argPerigeeDeg: 0, meanAnomalyDeg: 0 };
    const circle = prepareOrbit({ ...base, eccentricity: 0 });
    const ellipse = prepareOrbit({ ...base, eccentricity: 0.7 });
    expect(peakAngularRateDeg(circle)).toBeCloseTo((720 / 86400) * 1, 9);
    // ν̇ в перицентре = n·√(1−e²)·(a/r_π)² = n·(1+e)²/(1−e²)^{3/2}·… — проверка через V_π/r_π
    const Vp = (2 * Math.PI * ellipse.a * Math.sqrt((1 + 0.7) / (1 - 0.7))) / ellipse.T;
    expect(peakAngularRateDeg(ellipse)).toBeCloseTo((Vp / ellipse.rPerigee) * (180 / Math.PI), 9);
  });
});
