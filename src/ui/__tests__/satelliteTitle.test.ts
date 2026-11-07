import { describe, expect, it } from 'vitest';
import type { OrbitalElements } from '../../physics/propagate';
import { LABEL_MAX, labelTitle } from '../satelliteTitle';

const el = (name: string, noradId = 9_000_001): OrbitalElements => ({
  name,
  noradId,
  epochMs: 0,
  meanMotion: 15,
  eccentricity: 0,
  inclinationDeg: 51.6,
  raanDeg: 0,
  argPerigeeDeg: 0,
  meanAnomalyDeg: 0,
});

describe('labelTitle — подпись на карте и глобусе', () => {
  it('короткое название — как есть, у известных спутников — русское', () => {
    expect(labelTitle(el('Мой спутник'))).toBe('Мой спутник');
    expect(labelTitle(el('ISS (ZARYA)', 25544))).toBe('МКС');
  });
  it('длинное название сокращается с многоточием', () => {
    const t = labelTitle(el('Очень-очень длинное название моего собственного спутника'));
    expect(t.length).toBeLessThanOrEqual(LABEL_MAX);
    expect(t.endsWith('…')).toBe(true);
  });
});
