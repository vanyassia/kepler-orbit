import { afterEach, describe, expect, it, vi } from 'vitest';
import snapshot from '../../../public/data/orbiters.json';
import { archiveWindow, DEFAULT_SATELLITE, loadOrbiter } from '../../data/orbiters';
import { orbitSource } from '../../views/trackCache';
import { icrfToBodyEquator, MERCURY, mercuryOrientation, ROTATION_PERIOD } from '../bodies';
import { RAD } from '../constants';
import { greenwichToGeo } from '../frames';
import { prepareOrbit, propagate } from '../propagate';
import { archiveOrbitProfile } from '../orbitProfile';
import { norm, wrapPi } from '../math';

afterEach(() => vi.restoreAllMocks());

describe('Меркурий', () => {
  it('поворот на восток за сутки и средний период вращения', () => {
    const t = Date.UTC(2011, 4, 19);
    expect(MERCURY.turn(t, t + 86_400_000) * RAD).toBeCloseTo(6.1385, 2);
    expect(ROTATION_PERIOD.mercury / 86400).toBeCloseTo(58.646, 3);
  });

  it('виток MESSENGER привязан к эпохе JPL, а положение и Солнце согласованы с Horizons', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(snapshot)));
    const id = DEFAULT_SATELLITE.mercury;
    const { elements } = await loadOrbiter('mercury', id);
    const orbit = prepareOrbit(elements);
    const archive = archiveWindow('mercury', id)!;
    const track = orbitSource(orbit);
    expect(archive.startMs).toBe(elements.epochMs);
    expect((archive.endMs - archive.startMs) / 1000).toBeCloseTo(orbit.T, 2);
    expect(track.at(archive.startMs - 1)).toBeNull();
    expect(track.at(archive.endMs)).not.toBeNull();
    expect(track.at(archive.endMs + 1)).toBeNull();
    const profile = archiveOrbitProfile(orbit, archive.startMs, archive.endMs);
    expect(profile.points[0].timeMs).toBe(archive.startMs);
    expect(profile.points.at(-1)?.timeMs).toBe(archive.endMs);

    // Horizons, цель 199, наблюдатель 500@-236, величины 14 и 15.
    // 2011-05-19 00:00 UTC: долготы западные, широты планетографические.
    const t = Date.UTC(2011, 4, 19);
    const spacecraft = propagate(orbit, t);
    expect(Math.abs(spacecraft.lat * RAD + 81.523670)).toBeLessThan(0.08);
    expect(Math.abs(spacecraft.lon * RAD + 54.607711)).toBeLessThan(0.08);
    const sun = greenwichToGeo(MERCURY.toFixed(MERCURY.sunDirection(t), t), 0);
    expect(Math.abs(sun.lat * RAD + 0.032376)).toBeLessThan(0.08);
    expect(Math.abs(sun.lon * RAD + 151.883590)).toBeLessThan(0.08);

    const bepi = await loadOrbiter('mercury', -121);
    expect(bepi.elements.name).toBe('BepiColombo');
    expect(prepareOrbit(bepi.elements).hPerigee).toBeGreaterThan(0);
    expect(archiveWindow('mercury', -121)).toBeNull();
  });

  it('траектория BepiColombo согласована с контрольным вектором Horizons', () => {
    // 500@199, 28 ноября 2026 года 11:00 TDB, элементы BODY и вектор FRAME/ICRF.
    const epochMs = Date.UTC(2026, 10, 28, 11) - 69_184;
    const o = prepareOrbit({
      name: 'BepiColombo', noradId: -121, body: 'mercury', epochMs, eccentricity: 0.8274243930127186,
      inclinationDeg: 89.40057618870706, raanDeg: 67.8619414409025, argPerigeeDeg: 357.1444701775034,
      meanMotion: 0.003608305185341749 * 240, meanAnomalyDeg: 201.1847390374987,
    });
    const { alpha0, delta0 } = mercuryOrientation(epochMs);
    const vector = icrfToBodyEquator({ x: -6916.507977843285, y: -27712.85441789264, z: -14568.59436140209 }, alpha0, delta0);
    const reference = greenwichToGeo(MERCURY.toFixed(vector, epochMs), MERCURY.radius);
    const state = propagate(o, epochMs);
    expect(Math.abs(state.lat - reference.lat) * RAD).toBeLessThan(0.01);
    expect(Math.abs(wrapPi(state.lon - reference.lon)) * RAD).toBeLessThan(0.01);
    expect(Math.abs(state.r - norm(vector))).toBeLessThan(0.1);
  });
});
