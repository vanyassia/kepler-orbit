import { describe, expect, it } from 'vitest';
import type { CustomSatellite } from '../custom';
import { customToElements, isStoredCustom, validateCustom } from '../custom';
import { gcd, isTemplateName, REPEAT_DEFAULTS, repeatError, repeatHeight, repeatPeriod, repeatTemplate } from '../orbitTemplates';
import { ROTATION_PERIOD } from '../../physics/bodies';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { trackSpan } from '../../views/trackCache';

const EPOCH = Date.UTC(2026, 10, 10, 12);

function repeatSat(body: CustomSatellite['body'], n: number, m: number, inclinationDeg = 60): CustomSatellite {
  const t = repeatTemplate(body, { n, m }, inclinationDeg);
  return { ...t, name: t.satName, id: 9_000_001, epochMs: EPOCH, raanDeg: 30, repeat: { n, m } };
}

/** Расстояние между двумя точками поверхности, градусы дуги. */
function arcDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const c = Math.sin(a.lat) * Math.sin(b.lat) + Math.cos(a.lat) * Math.cos(b.lat) * Math.cos(a.lon - b.lon);
  return Math.acos(Math.min(1, c)) * (180 / Math.PI);
}

describe('повторяющаяся трасса', () => {
  it('период — m звёздных суток на n витков', () => {
    expect(repeatPeriod('earth', { n: 5, m: 1 })).toBeCloseTo(ROTATION_PERIOD.earth / 5, 6);
    expect(repeatPeriod('mars', { n: 29, m: 2 })).toBeCloseTo((2 * ROTATION_PERIOD.mars) / 29, 6);
    // Известные значения: 1 виток за сутки — геостационарная высота, 15 витков — около 561 км
    expect(repeatHeight('earth', { n: 1, m: 1 })).toBeCloseTo(35_793, -1);
    expect(repeatHeight('earth', { n: 15, m: 1 })).toBeCloseTo(561, -1);
  });

  for (const [body, n, m] of [
    ['earth', 5, 1],
    ['earth', 15, 1],
    ['earth', 31, 2],
    ['moon', 7, 1],
    ['mars', 5, 1],
    ['mars', 43, 3],
  ] as const) {
    it(`${body}: через ${n} витков спутник над той же точкой, а раньше — нет`, () => {
      const el = customToElements(repeatSat(body, n, m));
      const orbit = prepareOrbit(el);
      const t0 = EPOCH + 3_600_000;
      const a = propagate(orbit, t0);
      const cycleMs = n * orbit.T * 1000;
      const b = propagate(orbit, t0 + cycleMs);
      // Округление высоты до 0,1 км почти не сдвигает узор; у Луны вращение чуть неравномерно (либрации в модели вращения)
      expect(arcDeg(a, b)).toBeLessThan(body === 'moon' ? 0.2 : 0.05);
      // На промежуточных целых витках точка другая: узор не замыкается раньше времени
      for (let k = 1; k < n; k++) expect(arcDeg(a, propagate(orbit, t0 + k * orbit.T * 1000))).toBeGreaterThan(0.5);
    });
  }

  it('шаблон проходит проверку окна, n и m проверяются', () => {
    for (const b of ['earth', 'moon', 'mars'] as const) {
      const d = REPEAT_DEFAULTS[b];
      expect(repeatError(b, d)).toBeNull();
      expect(validateCustom({ ...repeatTemplate(b, d, d.inclinationDeg), name: 'Цветок' })).toEqual({});
    }
    expect(repeatError('earth', { n: 17, m: 1 })).toBeNull(); // 6 км — ещё над поверхностью
    expect(repeatError('earth', { n: 18, m: 1 })).toMatch(/под поверхность/);
    expect(repeatError('earth', { n: 2.5, m: 1 })).toMatch(/целое/);
    expect(repeatError('earth', { n: 5, m: 0 })).toMatch(/целое/);
    expect(repeatError('moon', { n: 1, m: 20 })).toBeNull(); // самая далёкая из допустимых — около 650 000 км
  });

  it('узор с общим делителем совпадает с упрощённым', () => {
    expect(gcd(10, 2)).toBe(2);
    expect(repeatHeight('earth', { n: 10, m: 2 })).toBe(repeatHeight('earth', { n: 5, m: 1 }));
    expect(repeatTemplate('earth', { n: 10, m: 2 }, 60).note).toMatch(/тот же узор, что 5 витков за 1 сутки/);
  });

  it('название «Цветок n/m» считается названием шаблона', () => {
    expect(repeatTemplate('earth', { n: 5, m: 1 }, 60).satName).toBe('Цветок 5/1');
    expect(isTemplateName('Цветок 31/2')).toBe(true);
    expect(isTemplateName('Молния')).toBe(true);
    expect(isTemplateName('Мой цветок')).toBe(false);
  });

  it('виды рисуют весь цикл, обычные спутники — как в настройках', () => {
    const rep = prepareOrbit(customToElements(repeatSat('earth', 15, 1)));
    expect(trackSpan(rep, 1, 2)).toEqual({ back: 1, forward: 14 });
    const plain = prepareOrbit({ ...customToElements(repeatSat('earth', 15, 1)), repeatRevs: undefined });
    expect(trackSpan(plain, 1, 2)).toEqual({ back: 1, forward: 2 });
  });

  it('спутник с циклом сохраняется и читается из хранилища', () => {
    const sat = repeatSat('earth', 5, 1);
    expect(isStoredCustom(JSON.parse(JSON.stringify(sat)))).toBe(true);
    expect(isStoredCustom({ ...sat, repeat: { n: 0, m: 1 } })).toBe(false);
    const { repeat: _, ...old } = sat;
    expect(isStoredCustom(old)).toBe(true); // старые записи без цикла
    expect(customToElements(old).repeatRevs).toBeUndefined();
  });
});
