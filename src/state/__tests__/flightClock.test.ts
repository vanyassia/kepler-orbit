import { describe, expect, it, vi } from 'vitest';

// Хранилище настроек zustand пишет в localStorage — в Node его нет, нужна заглушка до импорта store
vi.hoisted(() => {
  const m = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
});
import { historicFlight, SPUTNIK1_ID, VOSTOK1_ID } from '../../data/historicOrbiters';
import { clockOnSelect, FLIGHT_SPEED, useAppStore } from '../store';

const NOW = Date.parse('2026-11-10T12:00:00Z');

describe('часы при выборе исторического полёта', () => {
  it('Восток-1: часы переходят к старту, ×60, пауза назначена над местом посадки', () => {
    const c = clockOnSelect(25544, VOSTOK1_ID, 1000, NOW);
    const f = historicFlight(VOSTOK1_ID)!;
    expect(c).toEqual({ simTime: f.startMs, anchorSim: f.startMs, anchorReal: 1000, speed: FLIGHT_SPEED, playing: true, flightEnd: f.endMs });
  });

  it('после полёта любой другой спутник возвращает часы к текущему времени', () => {
    expect(clockOnSelect(VOSTOK1_ID, 25544, 1000, NOW)).toEqual({ simTime: NOW, anchorSim: NOW, anchorReal: 1000, speed: 1, playing: true, flightEnd: null });
    expect(clockOnSelect(SPUTNIK1_ID, -9711, 1000, NOW)).toMatchObject({ simTime: NOW, speed: 1 });
  });

  it('между обычными спутниками часы не трогаются', () => {
    expect(clockOnSelect(25544, 20580, 1000, NOW)).toEqual({ flightEnd: null });
    expect(clockOnSelect(null, -9711, 1000, NOW)).toEqual({ flightEnd: null });
  });

  it('часы встают на паузу ровно над местом посадки, один раз', () => {
    const f = historicFlight(VOSTOK1_ID)!;
    const end = f.endMs!;
    const st = useAppStore.getState();
    useAppStore.setState({ simTime: end - 60_000, anchorSim: end - 60_000, anchorReal: 0, speed: 60, playing: true, flightEnd: end });
    st.tick(500); // ещё 30 с полёта
    expect(useAppStore.getState().simTime).toBe(end - 30_000);
    st.tick(2000); // перелёт через момент посадки
    expect(useAppStore.getState()).toMatchObject({ simTime: end, playing: false });
    // Пустили снова — дальше часы идут без остановки
    useAppStore.getState().setPlaying(true);
    const { anchorReal } = useAppStore.getState();
    useAppStore.getState().tick(anchorReal + 1000);
    expect(useAppStore.getState().simTime).toBe(end + 60_000);
  });
});
