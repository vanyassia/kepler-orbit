import { describe, expect, it } from 'vitest';
import { CHUNK_BYTES, levelWidths, mipLevels, pickLevel, planChunks, redChannel, rowsPerChunk } from '../imageChunks';

describe('порции снимка', () => {
  it('порции покрывают снимок без пропусков и наложений', () => {
    const parts = planChunks(4096, rowsPerChunk(8192, 4));
    expect(parts[0].y).toBe(0);
    for (let k = 1; k < parts.length; k++) expect(parts[k].y).toBe(parts[k - 1].y + parts[k - 1].rows);
    const last = parts[parts.length - 1];
    expect(last.y + last.rows).toBe(4096);
  });

  it('порция не больше заданного объёма', () => {
    expect(rowsPerChunk(8192, 4) * 8192 * 4).toBeLessThanOrEqual(CHUNK_BYTES);
    expect(rowsPerChunk(4096, 1) * 4096).toBeLessThanOrEqual(CHUNK_BYTES);
    // Очень широкий снимок всё равно передаётся хотя бы по строке
    expect(rowsPerChunk(1 << 24, 4)).toBe(1);
  });

  it('уровней детализации хватает до одного пикселя', () => {
    expect(mipLevels(8192, 4096)).toBe(14);
    expect(mipLevels(2048, 1024)).toBe(12);
    expect(mipLevels(1, 1)).toBe(1);
  });

  it('маска берёт красный канал', () => {
    expect([...redChannel(new Uint8ClampedArray([10, 1, 2, 255, 20, 3, 4, 255]))]).toEqual([10, 20]);
  });
});

describe('копии снимка для карты', () => {
  it('снимок до 4096 пикселей входит в копии сам', () => {
    expect(levelWidths(2048)).toEqual([1024, 1448, 2048]);
    expect(levelWidths(4096)).toEqual([1024, 1448, 2048, 2896, 4096]);
  });

  it('больший снимок в копии не входит: его место — загрузка по требованию', () => {
    expect(levelWidths(8192)).toEqual([1024, 1448, 2048, 2896, 4096]);
  });

  it('берётся наименьшая копия, закрывающая ширину', () => {
    const levels = [{ width: 1024 }, { width: 2048 }, { width: 4096 }];
    expect(pickLevel(levels, 900).width).toBe(1024);
    expect(pickLevel(levels, 2048).width).toBe(2048);
    expect(pickLevel(levels, 2049).width).toBe(4096);
    expect(pickLevel(levels, 9000).width).toBe(4096);
  });
});
