import { describe, expect, it } from 'vitest';
import { FOLLOW_HARD_MARGIN, FOLLOW_MARGIN, followStep, lonStep } from '../map2d/follow';

const SIZE = 375;
const DT = 1 / 60;

const step = (x: number, active = false, smooth = true) => followStep({ x, moved: 0, speed: 0, size: SIZE, dt: DT, active, smooth });

/**
 * Прогон слежения: спутник летит по карте со скоростью v px/с, карта сдвигается по шагам.
 * everyOther — время модели меняется через кадр (как вместе с глобусом): спутник прыгает на двойной шаг.
 */
function run(x0: number, v: number, seconds: number, smooth = true, everyOther = false) {
  let x = x0;
  let active = false;
  let min = x;
  let max = x;
  // Разброс положения на экране — за вторую половину прогона, когда слежение уже вошло в режим
  let late = { min: Infinity, max: -Infinity };
  const n = seconds / DT;
  for (let i = 0; i < n; i++) {
    const moved = everyOther ? (i % 2 ? 2 * v * DT : 0) : v * DT;
    x += moved;
    const s = followStep({ x, moved, speed: Math.abs(v), size: SIZE, dt: DT, active, smooth });
    x += s.shift;
    active = s.active;
    min = Math.min(min, x);
    max = Math.max(max, x);
    if (i > n / 2) late = { min: Math.min(late.min, x), max: Math.max(late.max, x) };
  }
  return { x, active, min, max, late };
}

describe('слежение карты за спутником', () => {
  it('в средней части кадра карта стоит', () => {
    expect(step(SIZE / 2)).toEqual({ shift: 0, active: false });
    expect(step(SIZE * (1 - FOLLOW_MARGIN) - 1)).toEqual({ shift: 0, active: false });
  });

  it('у края карта начинает плавно сдвигаться к спутнику', () => {
    const x = SIZE * 0.9;
    const s = step(x);
    expect(s.active).toBe(true);
    expect(s.shift).toBeLessThan(0); // карта уезжает влево, спутник — к середине
    expect(Math.abs(s.shift)).toBeLessThan(SIZE / 2 - (SIZE - x)); // не сразу весь путь
  });

  it('неподвижный спутник за пару секунд оказывается в середине, и слежение затихает', () => {
    const r = run(SIZE * 0.9, 0, 3);
    expect(Math.abs(r.x - SIZE / 2)).toBeLessThan(0.03 * SIZE);
    expect(r.active).toBe(false);
  });

  it('медленный спутник (×1) подтягивается и снова отпускается', () => {
    const r = run(SIZE * 0.85, 0.2, 5);
    expect(Math.abs(r.x - SIZE / 2)).toBeLessThan(0.05 * SIZE);
    expect(r.active).toBe(false);
  });

  it('быстрый спутник (×5000, ~900 px/с) не уходит с экрана и держится у середины', () => {
    for (const v of [900, -900, 3000]) {
      const r = run(SIZE * 0.7, v, 10);
      expect(r.min).toBeGreaterThanOrEqual(FOLLOW_HARD_MARGIN * SIZE - 1e-9);
      expect(r.max).toBeLessThanOrEqual((1 - FOLLOW_HARD_MARGIN) * SIZE + 1e-9);
      expect(r.x).toBeCloseTo(SIZE / 2, 3);
      expect(r.active).toBe(true);
    }
  });

  it('спутник, который двигается рывками через кадр, всё равно стоит в середине', () => {
    const r = run(SIZE / 2, 900, 10, true, true);
    expect(r.min).toBeGreaterThanOrEqual(FOLLOW_HARD_MARGIN * SIZE - 1e-9);
    expect(r.max).toBeLessThanOrEqual((1 - FOLLOW_HARD_MARGIN) * SIZE + 1e-9);
    expect(r.late.min).toBeCloseTo(SIZE / 2, 3);
    expect(r.late.max).toBeCloseTo(SIZE / 2, 3);
  });

  it('без плавности (prefers-reduced-motion) — сразу в середину, но только у края', () => {
    expect(step(SIZE * 0.95, false, false)).toEqual({ shift: SIZE / 2 - SIZE * 0.95, active: false });
    expect(step(SIZE * 0.6, true, false)).toEqual({ shift: 0, active: false });
    const r = run(SIZE / 2, 900, 10, false);
    expect(r.min).toBeGreaterThanOrEqual(0);
    expect(r.max).toBeLessThanOrEqual(SIZE);
  });

  it('спутник далеко за краем (переход через ±180°) — сразу, без проезда по карте', () => {
    const s = followStep({ x: -640, moved: 15, speed: 900, size: SIZE, dt: DT, active: true, smooth: true });
    expect(s.shift).toBeCloseTo(SIZE / 2 + 640);
    expect(s.active).toBe(false);
  });

  it('долгота: шаг коротким путём и признак перехода через линию перемены дат', () => {
    expect(lonStep(10, 12)).toEqual({ delta: 2, wrapped: false });
    const east = lonStep(179.5, -179.5);
    expect(east.delta).toBeCloseTo(1);
    expect(east.wrapped).toBe(true);
    const west = lonStep(-179.5, 179.5);
    expect(west.delta).toBeCloseTo(-1);
    expect(west.wrapped).toBe(true);
  });
});
