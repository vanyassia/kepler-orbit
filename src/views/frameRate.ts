/**
 * Частота кадров по содержанию картинки. На скорости ×1 МКС сдвигается на экране меньше чем
 * на пиксель в секунду — рисовать 60 кадров в секунду незачем. Новый кадр нужен, когда самая
 * быстрая точка сдвинулась на доли пикселя; при ускорении времени частота растёт сама.
 */
import type { PreparedOrbit } from '../physics/propagate';
import { RAD } from '../physics/constants';

/** Сдвиг картинки, меньше которого глаз не заметит разницы, CSS-пиксели. */
export const MIN_SHIFT_PX = 0.25;
/** Реже этого кадр обновляется только на паузе: подписи и терминатор тоже должны оживать, мс. */
export const MAX_FRAME_INTERVAL_MS = 200;

/** Сколько миллисекунд времени симуляции проходит, пока картинка сдвинется на MIN_SHIFT_PX. */
export const simMsPerShift = (pxPerSimSecond: number): number => (pxPerSimSecond > 0 ? (MIN_SHIFT_PX / pxPerSimSecond) * 1000 : Infinity);

/** Пора ли рисовать: картинка сдвинулась заметно или кадр обновлялся слишком давно. NaN — кадра ещё не было. */
export const frameDue = (simDeltaMs: number, realDeltaMs: number, stepMs: number): boolean =>
  !(simDeltaMs < stepMs) || realDeltaMs >= MAX_FRAME_INTERVAL_MS;

/** Экранных пикселей на единицу длины сцены на расстоянии dist от камеры. */
export const pixelsPerUnit = (viewHeightPx: number, fovDeg: number, dist: number): number =>
  viewHeightPx / 2 / Math.tan(fovDeg / RAD / 2) / dist;

/** Наибольшая угловая скорость спутника на орбите — в перицентре, °/с (закон площадей). */
export const peakAngularRateDeg = (orbit: Pick<PreparedOrbit, 'n' | 'e'>): number =>
  (orbit.n * RAD * (1 + orbit.e) ** 2) / (1 - orbit.e * orbit.e) ** 1.5;
