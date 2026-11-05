import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORBITERS } from '../orbiters';
import { PHOTOS, photoFor, photoSourceUrl, photoUrl } from '../photos';
import { POPULAR_SATELLITES } from '../popular';

const PUBLIC = join(import.meta.dirname, '..', '..', '..', 'public');

/** Аппараты, для которых свободного снимка не нашлось: у них миниатюры нет. */
const WITHOUT_PHOTO = new Set(['earth:67253', 'earth:52145', 'earth:41191', 'earth:44307', 'earth:54153', 'earth:7530', 'mars:-9891']);

describe('снимки аппаратов', () => {
  it('у каждого спутника из списков есть снимок, кроме известных исключений', () => {
    const keys = [...POPULAR_SATELLITES.map((p) => `earth:${p.noradId}`), ...ORBITERS.map((o) => `${o.body}:${o.naifId}`)];
    const missing = keys.filter((k) => !PHOTOS[k] && !WITHOUT_PHOTO.has(k));
    expect(missing).toEqual([]);
    // Ключи снимков — только существующие спутники, без опечаток в номерах
    expect(Object.keys(PHOTOS).filter((k) => !keys.includes(k))).toEqual([]);
  });

  it('файлы снимков и миниатюр лежат в public/photos и не тяжёлые', () => {
    for (const p of Object.values(PHOTOS)) {
      for (const size of ['full', 'small'] as const) {
        const file = join(PUBLIC, photoUrl(p, size, '/'));
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size, file).toBeLessThan(size === 'full' ? 150_000 : 12_000);
      }
    }
  });

  it('у каждого снимка указаны подпись, автор и лицензия', () => {
    for (const p of Object.values(PHOTOS)) {
      expect(p.caption.trim()).not.toBe('');
      expect(p.author.trim()).not.toBe('');
      expect(p.license.trim()).not.toBe('');
    }
  });

  it('номера разных тел не путаются: Фобос у Марса, а у Земли 401 — нет', () => {
    expect(photoFor('mars', 401)?.image).toBe('phobos');
    expect(photoFor('earth', 401)).toBeNull();
    expect(photoFor(undefined, 25544)?.image).toBe('iss');
    expect(photoFor('earth', 999_999)).toBeNull();
  });

  it('адреса: миниатюра с суффиксом -s, страница Commons с закодированным именем', () => {
    const iss = PHOTOS['earth:25544'];
    expect(photoUrl(iss, 'full', '/kepler-orbit/')).toBe('/kepler-orbit/photos/iss.webp');
    expect(photoUrl(iss, 'small', '/kepler-orbit/')).toBe('/kepler-orbit/photos/iss-s.webp');
    expect(photoSourceUrl(PHOTOS['earth:47719'])).toBe('https://commons.wikimedia.org/wiki/File:%D0%90%D1%80%D0%BA%D1%82%D0%B8%D0%BA%D0%B0-%D0%9C.jpg');
  });
});
