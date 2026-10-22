/**
 * Скользящий кэш трассы: точки считаются с запасом в четверть витка с каждой стороны
 * и пересчитываются, только когда окно отображения выходит за пределы кэша.
 */
import type { TrackPoint } from '../physics/groundTrack';
import { groundTrack, trackStepSeconds } from '../physics/groundTrack';
import type { PreparedOrbit } from '../physics/propagate';
import { propagate } from '../physics/propagate';
import { RAD } from '../physics/constants';

export interface TrackWindow {
  /** Прошедшая часть: от t − N_назад·T до текущего момента. */
  past: TrackPoint[];
  /** Будущая часть: от текущего момента до t + N_вперёд·T. */
  future: TrackPoint[];
  /** Текущая подспутниковая точка. */
  current: TrackPoint;
}

export class TrackCache {
  private orbit: PreparedOrbit | null = null;
  private points: TrackPoint[] = [];
  private from = 0;
  private to = 0;
  private stepMs = 0;

  get(orbit: PreparedOrbit, t: number, revsBack: number, revsForward: number): TrackWindow {
    const Tms = orbit.T * 1000;
    const a = t - revsBack * Tms;
    const b = t + revsForward * Tms;
    if (orbit !== this.orbit || a < this.from || b > this.to) {
      const margin = 0.25 * Tms;
      this.orbit = orbit;
      this.stepMs = trackStepSeconds(orbit) * 1000;
      // Выравниваем начало по сетке шага, чтобы точки не «дрожали» при пересчёте
      this.from = Math.floor((a - margin) / this.stepMs) * this.stepMs;
      this.to = b + margin;
      this.points = groundTrack(orbit, this.from, this.to, this.stepMs / 1000);
    }
    const s = propagate(orbit, t);
    const current: TrackPoint = { timeMs: t, lat: s.lat * RAD, lon: s.lon * RAD, h: s.h };
    const ia = Math.ceil((a - this.from) / this.stepMs);
    const it = Math.floor((t - this.from) / this.stepMs);
    const ib = Math.floor((b - this.from) / this.stepMs);
    return {
      past: [...this.points.slice(Math.max(0, ia), it + 1), current],
      future: [current, ...this.points.slice(it + 1, ib + 1)],
      current,
    };
  }
}
