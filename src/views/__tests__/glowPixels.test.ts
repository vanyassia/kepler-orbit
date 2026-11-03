import { describe, expect, it } from 'vitest';
import { glowPixels } from '../glowPixels';

const SIZE = 128;
const at = (px: Uint8Array, x: number, y: number) => Array.from(px.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4));

describe('glowPixels — пятно свечения', () => {
  const px = glowPixels(SIZE, [255, 250, 235, 1], [255, 200, 110, 0.35]);

  it('в центре — цвет ядра без прозрачности', () => {
    expect(at(px, 64, 64)).toEqual([255, 250, 235, 255]);
  });

  it('в углу пятно полностью прозрачно', () => {
    expect(at(px, 0, 0)[3]).toBe(0);
  });

  it('прозрачность гладко убывает от центра к краю, без скачков и шума', () => {
    let prev = 256;
    for (let x = 64; x < SIZE; x++) {
      const a = at(px, x, 64)[3];
      expect(a).toBeLessThanOrEqual(prev);
      expect(prev - a).toBeLessThanOrEqual(12);
      prev = a;
    }
  });

  it('цвет в ореоле между ядром и краем — без посторонних оттенков', () => {
    // На любом радиусе красный канал не меньше зелёного, зелёный не меньше синего (тёплый цвет)
    for (let x = 64; x < SIZE; x++) {
      const [r, g, b, a] = at(px, x, 64);
      if (a === 0) continue;
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
    }
  });

  it('пятно симметрично: одинаковые пиксели на одном расстоянии от центра', () => {
    expect(at(px, 40, 64)).toEqual(at(px, 64 + (63 - 40), 64));
    expect(at(px, 64, 40)).toEqual(at(px, 40, 64));
  });
});
