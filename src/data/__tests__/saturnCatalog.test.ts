import { afterEach, describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import snapshot from '../../../public/data/orbiters.json';
import { archiveOrbitProfile, profileAt } from '../../physics/orbitProfile';
import { orbitEllipse, prepareOrbit, propagate, type OrbitalElements } from '../../physics/propagate';
import { useAppStore } from '../../state/store';
import { cassiniModelRadius, createCassiniModel, disposeCassiniModel } from '../../views/globe3d/cassiniModel';
import { cassiniFrame, cassiniOverviewDistance } from '../../views/globe3d/cassiniOverview';
import { axisToScene, toScene } from '../../views/globe3d/coords';
import { futureTrackLegend, orbitSource, Revolutions, TrackCache } from '../../views/trackCache';
import { buildTrackTable } from '../exportData';
import { CASSINI_WINDOW, isOrbiterId, legacyBodyFor, loadOrbiter, ownLook } from '../orbiters';

vi.hoisted(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
});
afterEach(() => vi.restoreAllMocks());

describe('Каталог Сатурна', () => {
  it('выбирает модель «Кассини» только для аппарата у Сатурна', () => {
    expect(ownLook({ body: 'saturn', noradId: -82 })).toBe('cassini');
    expect(ownLook({ body: 'saturn', noradId: 602 })).toBeNull();
    expect(ownLook({ body: 'earth', noradId: -82 })).toBeNull();
  });

  it('различает идентификаторы Титана и земных спутников, сохраняя старые ссылки', () => {
    expect(isOrbiterId('saturn', 606)).toBe(true);
    expect(isOrbiterId('earth', 606)).toBe(false);
    expect(legacyBodyFor(606)).toBe('earth');
    expect(legacyBodyFor(602)).toBe('earth');
    expect(legacyBodyFor(301)).toBe('earth');
    expect(legacyBodyFor(401)).toBe('mars');
    expect(legacyBodyFor(-248)).toBe('venus');
    expect(legacyBodyFor(-85)).toBe('moon');
  });

  it('читает снимок по паре тело и номер и сохраняет полный масштаб орбиты Титана', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(snapshot)));
    const { elements } = await loadOrbiter('saturn', 606);
    expect(elements.name).toBe('Титан');
    expect(prepareOrbit(elements).rApogee).toBeGreaterThan(1_250_000);
    await expect(loadOrbiter('earth', 606)).rejects.toThrow('606');
  });
});

describe('Виток № 292 «Кассини»', () => {
  const cassini = snapshot.items.find((item) => item.naifId === -82)!;
  const elements: OrbitalElements = {
    name: 'Кассини', noradId: -82, body: 'saturn', epochMs: Date.parse(cassini.epoch),
    eccentricity: cassini.eccentricity, meanMotion: cassini.meanMotionDegPerSec * 86400 / 360,
    inclinationDeg: cassini.inclinationDeg, raanDeg: cassini.raanDeg,
    argPerigeeDeg: cassini.argPerigeeDeg, meanAnomalyDeg: cassini.meanAnomalyDeg,
  };
  const { startMs, endMs } = CASSINI_WINDOW;

  it('ставит часы на эпоху, ограничивает перемотку и завершает воспроизведение', () => {
    const state = useAppStore.getState();
    try {
      state.setRecord({ elements, source: 'horizons', fetchedAt: elements.epochMs });
      expect(useAppStore.getState()).toMatchObject({ simTime: elements.epochMs, playing: false });
      state.setSimTime(startMs - 60_000);
      expect(useAppStore.getState().simTime).toBe(startMs);
      state.setSimTime(endMs - 1000);
      state.setPlaying(true);
      state.tick(useAppStore.getState().anchorReal + 3000);
      expect(useAppStore.getState()).toMatchObject({ simTime: endMs, playing: false });
      const now = Date.UTC(2026, 10, 24);
      vi.spyOn(Date, 'now').mockReturnValue(now);
      state.setRecord({ elements: { ...elements, noradId: 606 }, source: 'horizons', fetchedAt: now });
      expect(useAppStore.getState()).toMatchObject({ simTime: now, speed: 1, playing: true });
    } finally {
      useAppStore.setState(state);
    }
  });

  it('ограничивает трассу и выгрузку точными границами витка', () => {
    const orbit = prepareOrbit(elements);
    const source = orbitSource(orbit);
    expect(source.at(startMs - 1)).toBeNull();
    expect(source.at(endMs + 1)).toBeNull();
    const track = new TrackCache().get(source, elements.epochMs, 0, 1)!;
    expect(track.past[0].timeMs).toBe(startMs);
    expect(track.future.at(-1)?.timeMs).toBe(endMs);
    const table = buildTrackTable(orbit, { fromMs: startMs - 1000, toMs: endMs + 1000, stepSec: 3600, groups: [], msk: false });
    expect(table.times[0]).toBe(startMs);
    expect(table.times.at(-1)).toBe(endMs);
    expect(table.titles).toContain('Высота h от экваториального радиуса 60 268 км (км)');
  });

  it('показывает на графиках даты архива и плотную выборку вокруг перицентра', () => {
    const orbit = prepareOrbit(elements);
    const profile = archiveOrbitProfile(orbit, startMs, endMs);
    expect(profile.points[0].timeMs).toBe(startMs);
    expect(profile.points.at(-1)?.timeMs).toBe(endMs);
    expect(new Date(profile.apsisMs).toISOString().slice(0, 10)).toBe('2017-09-09');
    expect(profile.points.filter((p) => Math.abs(p.timeMs - profile.apsisMs) < 30 * 60_000).length).toBeGreaterThan(15);
    for (const time of [startMs, profile.apsisMs, endMs]) {
      const point = profileAt(profile, time);
      const state = propagate(orbit, time);
      expect(point.timeMs).toBe(time);
      expect(point.h).toBeCloseTo(state.h, 5);
      expect(point.V).toBeCloseTo(state.V, 5);
    }
    expect(profileAt(profile, profile.apsisMs - 1000).theta).toBeGreaterThan(6);
    expect(profileAt(profile, profile.apsisMs + 1000).theta).toBeLessThan(0.1);
  });

  it('берёт цвета легенды с будущей трассы и убирает её пункты в конце архива', () => {
    const orbit = prepareOrbit(elements);
    const cache = new TrackCache();
    const source = orbitSource(orbit);
    const legendAt = (time: number) => {
      const track = cache.get(source, time, 1, 2)!;
      return futureTrackLegend(track.future, new Revolutions(orbit, time, 1, 2));
    };
    expect(legendAt(startMs)).toEqual({ current: true, forward: 1 });
    expect(legendAt(endMs - 60_000)).toEqual({ current: true, forward: 0 });
    expect(legendAt(endMs)).toEqual({ current: false, forward: 0 });
  });

  it('вписывает всю орбиту и модель с антеннами в панели глобуса и обоих видов', () => {
    const orbit = prepareOrbit(elements);
    const ellipse = orbitEllipse(orbit, 360).map((p) => toScene(p, new Vector3(), orbit.body.radius));
    const model = createCassiniModel();
    const radius = cassiniModelRadius(model);
    disposeCassiniModel(model);
    const up = new Vector3(0, 1, 0);
    const direction = axisToScene(orbit.body.sunDirection(elements.epochMs));
    direction.y = 0;
    direction.normalize().applyAxisAngle(up, 0.54);
    direction.y = 0.48;
    direction.normalize();

    for (const [width, height] of [[390, 660], [390, 325], [1100, 660], [1100, 325]]) {
      const half = 19 * Math.PI / 180;
      const aspect = width / height;
      const fov = 2 * Math.atan(Math.tan(half) / Math.min(1, aspect)) * 180 / Math.PI;
      const distance = cassiniOverviewDistance(ellipse, direction, up, width, height, 38, radius);
      expect(distance).toBeLessThan(220);
      const frame = cassiniFrame(width, height);
      const camera = new PerspectiveCamera(fov, aspect);
      camera.setViewOffset(width, height, 0, -frame.shiftY, width, height);
      camera.position.copy(direction).multiplyScalar(distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const focal = Math.min(width, height) / (2 * Math.tan(half));
      const right = new Vector3().crossVectors(up, direction).normalize();
      const top = new Vector3().crossVectors(direction, right);
      for (const point of ellipse) {
        const depth = distance - point.dot(direction);
        const modelR = radius * frame.modelPxPerUnit * depth / focal;
        // Четыре крайние для кадра точки сферы вокруг аппарата.
        for (const [axis, side] of [[right, width - 2 * frame.paddingX], [top, frame.freeHeight]] as const) {
          for (const sign of [-1, 1]) {
            const edge = axis.clone().multiplyScalar(sign).addScaledVector(direction, side / (2 * focal)).normalize();
            const projected = point.clone().addScaledVector(edge, modelR).project(camera);
            expect(Math.abs(projected.x)).toBeLessThan(1);
            expect(Math.abs(projected.y + 2 * frame.shiftY / height)).toBeLessThanOrEqual(frame.freeHeight / height + 1e-8);
          }
        }
      }
    }
  });
});
