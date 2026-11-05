import { describe, expect, it } from 'vitest';
import { customToElements, validateCustom } from '../custom';
import { ORBIT_TEMPLATES, templatesFor } from '../orbitTemplates';
import { APO_MAX, E_MAX, heightFromSlider, maxEccentricity, niceHeight, shapeOf, sliderFromHeight, tuneElements } from '../orbitTune';
import { BODIES, ROTATION_PERIOD } from '../../physics/bodies';
import type { OrbitalElements } from '../../physics/propagate';
import { prepareOrbit, propagate } from '../../physics/propagate';

const asCustom = (t: (typeof ORBIT_TEMPLATES)[number]) => ({ ...t, id: 9_000_001, epochMs: Date.UTC(2026, 10, 5), name: t.satName });

describe('шаблоны орбит', () => {
  it('у каждого тела есть шаблоны, все проходят проверку окна', () => {
    for (const b of ['earth', 'moon', 'mars'] as const) expect(templatesFor(b).length).toBeGreaterThan(0);
    for (const t of ORBIT_TEMPLATES) expect(validateCustom({ ...t, name: t.satName })).toEqual({});
  });

  it('у Земли — четыре шаблона из задания', () => {
    expect(templatesFor('earth').map((t) => t.label)).toEqual(['Геостационарная', 'Молния', 'Солнечно-синхронная', 'Полярная']);
  });

  it('геостационарный спутник стоит над одной точкой экватора', () => {
    const t = ORBIT_TEMPLATES.find((x) => x.id === 'geo')!;
    const el = customToElements(asCustom(t));
    const orbit = prepareOrbit(el);
    expect(orbit.T).toBeCloseTo(ROTATION_PERIOD.earth, -1); // ±5 с
    const a = propagate(orbit, el.epochMs);
    const b = propagate(orbit, el.epochMs + 5 * 86400_000);
    expect(Math.abs(a.lat)).toBeLessThan(1e-9);
    const dLon = Math.abs(((b.lon - a.lon + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    expect(dLon * (180 / Math.PI)).toBeLessThan(0.05); // за 5 суток не уплывает
  });

  it('ареостационарный спутник стоит над точкой экватора Марса', () => {
    const t = ORBIT_TEMPLATES.find((x) => x.id === 'mars-areo')!;
    const el = customToElements(asCustom(t));
    const orbit = prepareOrbit(el);
    const a = propagate(orbit, el.epochMs);
    const b = propagate(orbit, el.epochMs + 3 * 86400_000);
    const dLon = Math.abs(((b.lon - a.lon + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
    expect(dLon * (180 / Math.PI)).toBeLessThan(0.1);
  });

  it('«Молния» — полусуточная, апогей над северным полушарием', () => {
    const t = ORBIT_TEMPLATES.find((x) => x.id === 'molniya')!;
    const el = customToElements(asCustom(t));
    const orbit = prepareOrbit(el);
    expect(orbit.T).toBeCloseTo(ROTATION_PERIOD.earth / 2, -1);
    expect(t.hApo).toBeGreaterThan(39_000);
    // через полвитка от перигея (M₀ = 0) — апогей, широта ≈ +63,4°
    const s = propagate(orbit, el.epochMs + (orbit.T / 2) * 1000);
    expect(s.lat * (180 / Math.PI)).toBeCloseTo(63.4, 1);
  });
});

describe('изменение орбиты ползунками', () => {
  const iss: OrbitalElements = {
    name: 'МКС',
    noradId: 25544,
    epochMs: Date.UTC(2026, 10, 1),
    meanMotion: 15.5,
    eccentricity: 0.0005,
    inclinationDeg: 51.64,
    raanDeg: 120,
    argPerigeeDeg: 80,
    meanAnomalyDeg: 10,
  };

  it('без изменений элементы те же', () => {
    const el = tuneElements(iss, {});
    expect(el.meanMotion).toBeCloseTo(iss.meanMotion, 9);
    expect(el.eccentricity).toBe(iss.eccentricity);
  });

  it('высота перицентра и e задают орбиту, остальные элементы не меняются', () => {
    const el = tuneElements(iss, { hPeri: 1000, e: 0.2, inclinationDeg: 98 });
    const sh = shapeOf(el);
    expect(sh.hPeri).toBeCloseTo(1000, 6);
    expect(sh.e).toBe(0.2);
    expect(sh.inclinationDeg).toBe(98);
    const R = BODIES.earth.radius;
    expect(sh.hApo).toBeCloseTo(((R + 1000) * 1.2) / 0.8 - R, 6);
    expect([el.raanDeg, el.argPerigeeDeg, el.meanAnomalyDeg, el.epochMs]).toEqual([iss.raanDeg, iss.argPerigeeDeg, iss.meanAnomalyDeg, iss.epochMs]);
  });

  it('вытянутость меняет апоцентр, перицентр остаётся на месте', () => {
    const before = shapeOf(iss);
    const sh = shapeOf(tuneElements(iss, { e: 0.5 }));
    expect(sh.hPeri).toBeCloseTo(before.hPeri, 6);
    expect(sh.hApo).toBeGreaterThan(before.hApo);
  });

  it('апоцентр не дальше предела, наклонение — от 0 до 180°', () => {
    const el = tuneElements(iss, { hPeri: 300_000, e: E_MAX });
    expect(shapeOf(el).hApo).toBeLessThanOrEqual(APO_MAX + 1e-6);
    expect(el.eccentricity).toBeCloseTo(maxEccentricity(300_000, BODIES.earth.radius), 12);
    expect(tuneElements(iss, { inclinationDeg: 200 }).inclinationDeg).toBe(180);
    expect(tuneElements(iss, { inclinationDeg: -5 }).inclinationDeg).toBe(0);
  });

  it('логарифмическая шкала высоты обратима', () => {
    for (const h of [150, 408, 20_200, 35_793, 400_000]) expect(heightFromSlider(sliderFromHeight(h, 150, 400_000), 150, 400_000)).toBeCloseTo(h, 6);
    expect(sliderFromHeight(10, 150, 400_000)).toBe(0);
    expect(sliderFromHeight(1e9, 150, 400_000)).toBe(1);
  });

  it('круглые высоты', () => {
    expect(niceHeight(408.4)).toBe(408);
    expect(niceHeight(2034)).toBe(2030);
    expect(niceHeight(35_793)).toBe(35_800);
  });
});
