import { describe, expect, it } from 'vitest';
import { BOARD_DASH_SCALE_MAX, BOARD_MAX_HALF_DEG, boardDashScale, boardFov, boardHalfAngle, clampZoom } from '../boardView';

const R_EARTH = 6371;

describe('Вид с борта: угол обзора', () => {
  it('низкая орбита (МКС, 420 км) — угол ограничен, горизонта в кадре нет', () => {
    const r = (R_EARTH + 420) / R_EARTH;
    const half = boardHalfAngle(r);
    expect(half).toBe(BOARD_MAX_HALF_DEG);
    // Угловой радиус диска Земли с МКС — около 70°: край диска (горизонт) за краем кадра
    expect(Math.asin(1 / r) * (180 / Math.PI)).toBeGreaterThan(half);
  });

  it('геостационарная орбита — весь диск Земли в кадре с запасом', () => {
    const r = 42164 / R_EARTH;
    const disc = Math.asin(1 / r) * (180 / Math.PI);
    const half = boardHalfAngle(r);
    expect(half).toBeGreaterThan(disc);
    expect(half).toBeLessThan(disc * 1.3);
  });

  it('с Луны Земля тоже заполняет кадр, а не точка', () => {
    const r = 384_400 / R_EARTH;
    const half = boardHalfAngle(r);
    expect(half).toBeGreaterThan(0.9);
    expect(half).toBeLessThan(1.5);
  });

  it('приближение сужает угол, отдаление расширяет', () => {
    const r = 42164 / R_EARTH;
    expect(boardHalfAngle(r, 0.5)).toBeLessThan(boardHalfAngle(r));
    expect(boardHalfAngle(r, 1.5)).toBeGreaterThan(boardHalfAngle(r));
  });

  it('на высоком узком экране вертикальный угол больше: по ширине помещается то же', () => {
    const r = 3;
    const wide = boardFov(r, 1.6);
    const tall = boardFov(r, 0.5);
    expect(wide).toBeCloseTo(2 * boardHalfAngle(r), 6);
    expect(tall).toBeGreaterThan(wide);
    // Горизонтальный угол на телефоне равен расчётному
    const hHalf = Math.atan(Math.tan((tall / 2) * (Math.PI / 180)) * 0.5) * (180 / Math.PI);
    expect(hHalf).toBeCloseTo(boardHalfAngle(r), 6);
  });

  it('множитель приближения ограничен, мусор не ломает расчёт', () => {
    expect(clampZoom(100)).toBeLessThan(2);
    expect(clampZoom(0)).toBeGreaterThan(0);
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(boardHalfAngle(0.5)).toBeGreaterThan(0); // внутри тела — не падает
  });
});

describe('Вид с борта: пунктир будущей трассы', () => {
  // Длина штриха на экране ∝ 1 / (расстояние до поверхности · tg половинного угла · масштаб пунктира)
  const onScreen = (altitude: number, half: number, scale: number) => 1 / (altitude * Math.tan((half * Math.PI) / 180) * scale);

  it('с МКС штрихи под спутником той же длины на экране, что и в обзоре', () => {
    const h = 420 / R_EARTH;
    const half = boardHalfAngle(1 + h);
    const scale = boardDashScale(h, half);
    expect(scale).toBeGreaterThan(10);
    expect(onScreen(h, half, scale)).toBeCloseTo(onScreen(2.4, 19, 1), 6);
  });

  it('приближение колёсиком тоже укорачивает штрихи', () => {
    const h = 420 / R_EARTH;
    expect(boardDashScale(h, boardHalfAngle(1 + h, 0.2))).toBeGreaterThan(boardDashScale(h, boardHalfAngle(1 + h)));
  });

  it('издалека (Луна над Землёй) — как в обзоре, без растяжения штрихов', () => {
    const r = 384400 / R_EARTH;
    expect(boardDashScale(r - 1, boardHalfAngle(r))).toBe(1);
  });

  it('предел и защита от нуля', () => {
    expect(boardDashScale(0, 0)).toBe(BOARD_DASH_SCALE_MAX);
    expect(boardDashScale(Number.NaN, 30)).toBe(1);
  });
});
