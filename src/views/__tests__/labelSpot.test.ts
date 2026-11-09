import { describe, expect, it } from 'vitest';
import { chooseSpot, type SpotMemory } from '../map2d/labelSpot';

/** Прогон по кадрам: какие места свободны в каждом кадре → где стоит подпись. */
function run(frames: boolean[][], settle = 3): number[] {
  let mem: SpotMemory | undefined;
  return frames.map((free) => {
    const r = chooseSpot(mem, free, settle);
    mem = r.mem;
    return r.spot;
  });
}

describe('chooseSpot — место подписи у конца трассы', () => {
  it('сначала — главное место, если оно свободно', () => {
    expect(run([[true, true]])).toEqual([0]);
  });

  it('главное занято — первое свободное запасное', () => {
    expect(run([[false, false, true]])).toEqual([2]);
  });

  it('не мечется, когда главное место то занято, то свободно', () => {
    const T = [true, true];
    const F = [false, true];
    expect(run([T, F, T, F, T, F, T])).toEqual([0, 1, 1, 1, 1, 1, 1]);
  });

  it('возвращается на главное, когда оно свободно несколько кадров подряд', () => {
    const T = [true, true];
    const F = [false, true];
    expect(run([F, T, T, T, T])).toEqual([1, 1, 1, 1, 0]);
  });

  it('прежнее место заняли — переходит на свободное', () => {
    expect(run([[false, true, true], [false, false, true]])).toEqual([1, 2]);
  });

  it('мест нет — подпись не рисуется, прежнее место помнится', () => {
    expect(run([[false, true, true], [false, false, false], [false, true, true]])).toEqual([1, -1, 1]);
  });
});
