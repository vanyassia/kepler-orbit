import { afterEach, describe, expect, it, vi } from 'vitest';
import snapshot from '../../../public/data/orbiters.json';
import { prepareOrbit, type OrbitalElements } from '../../physics/propagate';
import { useAppStore } from '../../state/store';
import { orbitSource, TrackCache } from '../../views/trackCache';
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
      state.setRecord({ elements: { ...elements, noradId: 602 }, source: 'horizons', fetchedAt: Date.now() });
      expect(useAppStore.getState().simTime).toBeGreaterThan(endMs);
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
});
