import { describe, expect, it } from 'vitest';
import { icrfToBodyEquator, ROTATION_PERIOD, SATURN, saturnOrientation } from '../bodies';
import { DEG, RAD } from '../constants';
import { greenwichToGeo } from '../frames';
import { dot, norm, wrapPi } from '../math';
import { prepareOrbit, propagate } from '../propagate';
import { tdbMinusUtc } from '../dynamicalTime';

// Horizons: центр 500@699, время TDB. Элементы REF_PLANE=BODY, векторы FRAME/ICRF.
const cases = [
  {
    id: 602, jd: 2461368.208333333,
    elements: [5.989356752167801e-3, 9.757742377083293e-3, 185.6443634351404, 55.16988116397246, 0.003031231477661532, 331.2502775234079],
    position: { x: 225352.3130802502, y: -72575.20067623765, z: -14025.30432733496 },
    sun: { x: -1.373560061267693e9, y: -3.065294892556482e8, z: -6.745540566536017e7 },
  },
  {
    id: -82, jd: 2458005.541666667,
    elements: [0.901928905615897, 61.63230097911914, 125.6663597126282, 187.821656911604, 0.00070996440683032, 2.102740410969563],
    position: { x: -43724.02563574934, y: 21015.14322774212, z: -76732.25941996225 },
    sun: { x: 8.280703915631801e7, y: 1.390358465005178e9, z: 5.707348945046190e8 },
  },
  {
    id: 606, jd: 2461372.958333333,
    elements: [0.0287373439246591, 0.404555196248078, 250.592317051291, 327.338367490792, 0.000261272135245219, 275.224070069987],
    position: { x: -198578.9884416745, y: -1199481.922122223, z: 98041.65204153146 },
  },
];

describe('Сатурн: центр 699 и ориентация System III', () => {
  it('поворачивается на полные 360° за звёздные сутки и использует шкалу TDB', () => {
    expect(tdbMinusUtc(Date.UTC(2000, 0, 1))).toBeCloseTo(64.184, 8);
    expect(tdbMinusUtc(Date.UTC(2011, 4, 19))).toBeCloseTo(66.184, 8);
    expect(tdbMinusUtc(Date.UTC(2017, 0, 1))).toBeCloseTo(69.184, 8);
    const j2000 = Date.UTC(2000, 0, 1, 12) - 64_184;
    expect(saturnOrientation(j2000).W * RAD).toBeCloseTo(38.9, 6);
    expect(SATURN.turn(j2000, j2000 + ROTATION_PERIOD.saturn * 1000)).toBeCloseTo(2 * Math.PI, 10);
  });

  it.each(cases)('NAIF $id: трасса и направление на Солнце согласованы с векторами Horizons', (sample) => {
    const [eccentricity, inclinationDeg, raanDeg, argPerigeeDeg, n, meanAnomalyDeg] = sample.elements;
    const epochMs = (sample.jd - 2440587.5) * 86_400_000 - 69_184;
    const orbit = prepareOrbit({
      name: String(sample.id), noradId: sample.id, body: 'saturn', epochMs, eccentricity,
      inclinationDeg, raanDeg, argPerigeeDeg, meanMotion: n * 86400 / 360, meanAnomalyDeg,
    });
    const { alpha0, delta0 } = saturnOrientation(epochMs);
    const position = icrfToBodyEquator(sample.position, alpha0, delta0);
    const geo = greenwichToGeo(SATURN.toFixed(position, epochMs), SATURN.radius);
    const state = propagate(orbit, epochMs);
    expect(Math.abs(state.lat - geo.lat)).toBeLessThan(0.005 * DEG);
    expect(Math.abs(wrapPi(state.lon - geo.lon))).toBeLessThan(0.005 * DEG);
    // Для Титана Horizons включает массу спутника в μ.
    expect(Math.abs(state.r - norm(position)) / norm(position)).toBeLessThan(sample.id === 606 ? 0.0001 : 0.00001);
    if (sample.id === -82) expect(Math.abs(geo.lat) * RAD).toBeGreaterThan(55);

    if (sample.sun) {
      const sun = icrfToBodyEquator(sample.sun, alpha0, delta0);
      expect(dot(sun, SATURN.sunDirection(epochMs)) / norm(sun)).toBeGreaterThan(Math.cos(0.5 * DEG));
    }
  });
});
