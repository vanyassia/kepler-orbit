import { describe, expect, it } from 'vitest';
import { CITIES } from '../cities';
import { SPUTNIK1_ID, VOSTOK1_ID } from '../historicOrbiters';
import { PLACES, placesFor } from '../landmarks';

const names = (list: { name: string }[]) => list.map((c) => c.name);

describe('отметки исторических полётов', () => {
  it('у Востока-1 — Байконур и посадка Гагарина, у Спутника-1 — только Байконур', () => {
    expect(names(placesFor('earth', VOSTOK1_ID))).toEqual([...names(CITIES), 'Байконур', 'Посадка Гагарина']);
    expect(names(placesFor('earth', SPUTNIK1_ID))).toEqual([...names(CITIES), 'Байконур']);
    expect(placesFor('earth', VOSTOK1_ID).filter((c) => !CITIES.includes(c)).every((c) => c.highlight)).toBe(true);
  });

  it('у остальных спутников этих отметок нет', () => {
    for (const id of [25544, 20580, 301, undefined]) expect(placesFor('earth', id)).toBe(PLACES.earth);
    expect(placesFor('mars', -9711)).toBe(PLACES.mars);
    expect(names(PLACES.earth)).not.toContain('Байконур');
    expect(names(PLACES.earth)).not.toContain('Посадка Гагарина');
  });

  it('список не создаётся заново каждый кадр', () => {
    expect(placesFor('earth', VOSTOK1_ID)).toBe(placesFor('earth', VOSTOK1_ID));
  });
});
