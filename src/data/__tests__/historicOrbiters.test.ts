import { describe, expect, it } from 'vitest';
import { BODIES } from '../../physics/bodies';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { HISTORIC_ORBITERS, historicRecord } from '../historicOrbiters';
import { isOrbiterId, loadOrbiter, ORBITERS } from '../orbiters';

/** Опубликованные периоды, часы, и допуск: у Марса-3 источники расходятся заметнее. */
const PERIOD_H: Record<string, [number, number]> = {
  'Марс-2': [18, 0.01],
  'Марс-3': [12.67 * 24, 0.04],
  'Марс-5': [24.88, 0.005],
  'Фобос-2': [7.6597, 0.002],
};

describe('советские спутники Марса', () => {
  it('период из высот совпадает с опубликованным', () => {
    for (const o of HISTORIC_ORBITERS) {
      const orbit = prepareOrbit(historicRecord(o).elements);
      const [period, tolerance] = PERIOD_H[o.title];
      expect(Math.abs(orbit.T / 3600 - period) / period, o.title).toBeLessThan(tolerance);
    }
  });

  it('спутник остаётся между перицентром и апоцентром спустя десятилетия', () => {
    for (const o of HISTORIC_ORBITERS) {
      const orbit = prepareOrbit(historicRecord(o).elements);
      for (const t of [Date.parse('2026-10-31T12:00:00Z'), Date.parse('2030-01-01T00:00:00Z')]) {
        const r = propagate(orbit, t).r - BODIES.mars.radius;
        expect(r).toBeGreaterThan(o.hPeri - 1);
        expect(r).toBeLessThan(o.hApo + 1);
      }
    }
  });

  it('попадают в список Марса и загружаются без снимка Horizons', async () => {
    for (const o of HISTORIC_ORBITERS) {
      expect(ORBITERS.some((x) => x.naifId === o.id && x.body === 'mars')).toBe(true);
      expect(isOrbiterId(o.id)).toBe(true);
      const rec = await loadOrbiter(o.id);
      expect(rec.source).toBe('historic');
      expect(rec.elements.cosparId).toBe(o.cosparId);
      expect(rec.elements.name).toBe(o.title);
    }
  });
});
