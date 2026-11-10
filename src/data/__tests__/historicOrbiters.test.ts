import { describe, expect, it } from 'vitest';
import { BODIES } from '../../physics/bodies';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { DEG } from '../../physics/constants';
import { centralAngle } from '../../physics/passes';
import { BAIKONUR, GAGARIN_LANDING, HISTORIC_ORBITERS, historicById, historicFlight, historicRecord, SPUTNIK1_ID, VOSTOK1_ID } from '../historicOrbiters';
import { POPULAR_SATELLITES } from '../popular';
import { isOrbiterId, loadOrbiter, ORBITERS } from '../orbiters';

/** Опубликованные периоды, часы, и допуск: у Марса-3 источники расходятся заметнее. */
const PERIOD_H: Record<string, [number, number]> = {
  'Марс-2': [18, 0.01],
  'Марс-3': [12.67 * 24, 0.04],
  'Марс-5': [24.88, 0.005],
  'Фобос-2': [7.6597, 0.002],
  // Восток-1: 89,34 мин по ТАСС; Спутник-1: 96,2 мин (NSSDCA)
  'Восток-1': [89.34 / 60, 0.002],
  'Спутник-1': [96.2 / 60, 0.002],
};

describe('исторические орбиты', () => {
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
        const r = propagate(orbit, t).r - BODIES[o.body].radius;
        expect(r).toBeGreaterThan(o.hPeri - 1);
        expect(r).toBeLessThan(o.hApo + 1);
      }
    }
  });

  it('попадают в список своего тела и загружаются без снимка Horizons', async () => {
    for (const o of HISTORIC_ORBITERS) {
      expect(ORBITERS.some((x) => x.naifId === o.id && x.body === o.body)).toBe(true);
      expect(isOrbiterId(o.id)).toBe(true);
      const rec = await loadOrbiter(o.id);
      expect(rec.source).toBe('historic');
      expect(rec.elements.cosparId).toBe(o.cosparId);
      expect(rec.elements.name).toBe(o.title);
    }
  });
});

/** Расстояние по поверхности Земли между подспутниковой точкой (радианы) и местом (градусы), км. */
const kmTo = (p: { lat: number; lon: number }, site: { lat: number; lon: number }) =>
  centralAngle(p.lat, p.lon, site.lat * DEG, site.lon * DEG) * BODIES.earth.radius;

describe('полёты с Байконура: Восток-1 и Спутник-1', () => {
  const flights = [VOSTOK1_ID, SPUTNIK1_ID].map((id) => historicById(id)!);

  it('в момент старта аппарат над Байконуром, на восходящей ветви, в перицентре', () => {
    for (const o of flights) {
      const orbit = prepareOrbit(historicRecord(o).elements);
      const t0 = Date.parse(o.epoch);
      const s = propagate(orbit, t0);
      expect(kmTo(s, BAIKONUR), o.title).toBeLessThan(1);
      expect(propagate(orbit, t0 + 60_000).lat, o.title).toBeGreaterThan(s.lat); // летит на север
      expect(s.h, o.title).toBeCloseTo(o.hPeri, 3);
    }
  });

  it('Восток-1: часы от старта 9:07 мск до пролёта над местом посадки на втором витке', () => {
    const f = historicFlight(VOSTOK1_ID)!;
    expect(f.startMs).toBe(Date.parse('1961-04-12T06:07:00Z'));
    const minutes = (f.endMs! - f.startMs) / 60_000;
    // Один виток — 89 мин; посадка севернее Байконура, поэтому чуть больше витка
    expect(minutes).toBeGreaterThan(89);
    expect(minutes).toBeLessThan(95);
    const orbit = prepareOrbit(historicRecord(historicById(VOSTOK1_ID)!).elements);
    // Трасса второго витка проходит рядом со Смеловкой: Земля за виток поворачивается на 22,4°
    expect(kmTo(propagate(orbit, f.endMs!), GAGARIN_LANDING)).toBeLessThan(150);
  });

  it('у Спутника-1 часы без остановки, у спутников Марса и обычных — своего времени нет', () => {
    expect(historicFlight(SPUTNIK1_ID)).toEqual({ startMs: Date.parse('1957-10-04T19:28:34Z'), endMs: null });
    for (const id of [-9711, -9891, 25544, -85]) expect(historicFlight(id)).toBeNull();
  });

  it('стоят в списке спутников Земли, Восток-1 — в коротком списке боковой панели', () => {
    expect(POPULAR_SATELLITES.find((p) => p.noradId === VOSTOK1_ID)?.featured).toBe(true);
    expect(POPULAR_SATELLITES.some((p) => p.noradId === SPUTNIK1_ID)).toBe(true);
  });
});
