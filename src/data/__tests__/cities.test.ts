import { describe, expect, it } from 'vitest';
import { CITIES, cityShown } from '../cities';

const byName = (n: string) => CITIES.find((c) => c.name === n)!;

describe('видимость городов на 2D-карте', () => {
  it('Смоленск скрыт на мелком масштабе и появляется при приближении', () => {
    expect(cityShown(byName('Смоленск'), 3)).toBe(false);
    expect(cityShown(byName('Смоленск'), 12)).toBe(true);
  });

  it('Москва и столицы видны всегда', () => {
    expect(cityShown(byName('Москва'), 1)).toBe(true);
    expect(cityShown(byName('Париж'), 1)).toBe(true);
  });
});
