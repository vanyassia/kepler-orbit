import { describe, expect, it } from 'vitest';
import { RAD } from '../../physics/constants';
import { prepareOrbit, propagate } from '../../physics/propagate';
import type { OrbitalElements } from '../../physics/propagate';
import { isOrbiterId, ORBITERS } from '../orbiters';
import { MOON_NAIF_ID, POPULAR_SATELLITES } from '../popular';

/** Элементы Луны относительно Земли из снимка JPL Horizons (Ω уже от точки весны даты), эпоха 03.11.2026. */
const MOON: OrbitalElements = {
  name: 'Луна',
  noradId: MOON_NAIF_ID,
  body: 'earth',
  epochMs: Date.parse('2026-11-03T17:58:50.816Z'),
  meanMotion: (0.0001546518899185831 * 86400) / 360,
  eccentricity: 0.0399270167045346,
  inclinationDeg: 27.79561840519239,
  raanDeg: 354.0893344207992,
  argPerigeeDeg: 76.06064859782728,
  meanAnomalyDeg: 80.11225167939847,
};

describe('Луна как спутник Земли', () => {
  it('стоит в списке Земли и загружается из снимка JPL Horizons', () => {
    expect(POPULAR_SATELLITES.some((p) => p.noradId === MOON_NAIF_ID)).toBe(true);
    expect(ORBITERS.find((o) => o.naifId === MOON_NAIF_ID)?.body).toBe('earth');
    expect(isOrbiterId(MOON_NAIF_ID)).toBe(true);
  });

  it('подлунная точка совпадает с JPL Horizons', () => {
    // Horizons, 03.11.2026 18:00 UTC: точка Земли под Луной — 203,895° в. д., 8,915° с. ш.
    // Широта Horizons геодезическая, у модели — геоцентрическая: на 9° разница около 0,06°.
    const s = propagate(prepareOrbit(MOON), Date.parse('2026-11-03T18:00:00Z'));
    expect(Math.abs(s.lat * RAD - 8.915)).toBeLessThan(0.1);
    expect(Math.abs(((s.lon * RAD - 203.895 + 540) % 360) - 180)).toBeLessThan(0.02);
    expect(s.h).toBeGreaterThan(356_000 - 6371);
    expect(s.h).toBeLessThan(407_000 - 6371);
  });
});
