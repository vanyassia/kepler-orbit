/**
 * Скользящий кэш трассы: точки считаются с запасом в четверть витка с каждой стороны
 * и пересчитываются, только когда окно отображения выходит за пределы кэша.
 */
import { RAD } from '../physics/constants';
import type { TrackPoint } from '../physics/groundTrack';
import { trackStepSeconds } from '../physics/groundTrack';
import type { PreparedOrbit } from '../physics/propagate';
import { ascendingNodeTimes, propagate } from '../physics/propagate';

/** Цвета холстов (глобус и карта); те же значения — в токенах оформления --orbit и --sat. */
export const ORBIT_COLOR = '#46d6ff';
export const SAT_COLOR = '#ffb547';

export interface TrackSource {
  /** Объект, по смене которого кэш сбрасывается (орбита). */
  key: object;
  /** Период обращения, с — задаёт ширину окна в витках. */
  periodSec: number;
  stepSec: number;
  /** Подспутниковая точка в момент t; null — модель не дала положения. */
  at: (t: number) => TrackPoint | null;
}

const sources = new WeakMap<object, TrackSource>();

/** Наша модель (задача двух тел). */
export function orbitSource(orbit: PreparedOrbit): TrackSource {
  let s = sources.get(orbit);
  if (!s) {
    s = {
      key: orbit,
      periodSec: orbit.T,
      stepSec: trackStepSeconds(orbit),
      at: (t) => {
        const st = propagate(orbit, t);
        return { timeMs: t, lat: st.lat * RAD, lon: st.lon * RAD, h: st.h };
      },
    };
    sources.set(orbit, s);
  }
  return s;
}

export interface TrackWindow {
  /** Прошедшая часть: от t − N_назад·T до текущего момента. */
  past: TrackPoint[];
  /** Будущая часть: от текущего момента до t + N_вперёд·T. */
  future: TrackPoint[];
  /** Текущая подспутниковая точка. */
  current: TrackPoint;
  /** Номер набора точек: меняется, когда окно сдвинулось на шаг сетки. Между сменами меняется только current. */
  revision: number;
}

/** Предел числа точек в каждой части окна: столько вмещают линии глобуса. */
export const MAX_WINDOW_POINTS = 20_000;

export class TrackCache {
  private key: object | null = null;
  private points: (TrackPoint | null)[] = [];
  private from = 0;
  private to = 0;
  private stepMs = 0;
  /** Последнее окно: его массивы используются повторно, чтобы не плодить мусор в памяти на каждый кадр. */
  private window: TrackWindow | null = null;
  private span = '';
  private revision = 0;

  get(src: TrackSource, t: number, revsBack: number, revsForward: number): TrackWindow | null {
    const Tms = src.periodSec * 1000;
    const a = t - revsBack * Tms;
    const b = t + revsForward * Tms;
    // Длинные орбиты (Спектр-Р, Чандра) на нескольких витках: шаг растёт, чтобы окно вместилось в линии глобуса
    const stepMs = Math.max(src.stepSec * 1000, (Math.max(revsBack, revsForward) * Tms) / (MAX_WINDOW_POINTS - 2));
    if (src.key !== this.key || stepMs !== this.stepMs || a < this.from || b > this.to) {
      const margin = 0.25 * Tms;
      this.key = src.key;
      this.stepMs = stepMs;
      // Выравниваем начало по сетке шага, чтобы точки не «дрожали» при пересчёте
      this.from = Math.floor((a - margin) / stepMs) * stepMs;
      this.to = b + margin;
      this.points = [];
      for (let tt = this.from; tt <= this.to; tt += stepMs) this.points.push(src.at(tt));
      this.span = '';
    }
    const current = src.at(t);
    if (!current) return null;
    const ia = Math.max(0, Math.ceil((a - this.from) / this.stepMs));
    const it = Math.floor((t - this.from) / this.stepMs);
    const ib = Math.floor((b - this.from) / this.stepMs);
    const span = `${ia}|${it}|${ib}`;
    const w = this.window;
    if (w && span === this.span) {
      w.current = current;
      w.past[w.past.length - 1] = current;
      w.future[0] = current;
      return w;
    }
    this.span = span;
    const next = w ?? { past: [], future: [], current, revision: 0 };
    next.current = current;
    next.revision = ++this.revision;
    next.past.length = 0;
    next.future.length = 1;
    next.future[0] = current;
    for (let i = ia; i <= it; i++) {
      const p = this.points[i];
      if (p) next.past.push(p);
    }
    next.past.push(current);
    for (let i = it + 1; i <= ib; i++) {
      const p = this.points[i];
      if (p) next.future.push(p);
    }
    this.window = next;
    return next;
  }
}

/**
 * Витки: номер витка точки относительно текущего (0 — текущий, +1 — следующий, −1 — предыдущий).
 * Граница витка — прохождение восходящего узла (u = 0).
 */
export class Revolutions {
  readonly nodes: number[];
  private readonly base: number;

  constructor(orbit: PreparedOrbit, t: number, revsBack: number, revsForward: number) {
    const Tms = orbit.T * 1000;
    this.nodes = ascendingNodeTimes(orbit, t - (revsBack + 1) * Tms, t + (revsForward + 1) * Tms);
    this.base = this.countUpTo(t);
  }

  /** Число узлов не позже момента τ (бинарный поиск). */
  private countUpTo(tau: number): number {
    let lo = 0;
    let hi = this.nodes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.nodes[mid] <= tau) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  offsetAt(tau: number): number {
    return this.countUpTo(tau) - this.base;
  }
}

/**
 * Цвета витков. Текущий и три следующих — свои оттенки, дальше — один общий
 * (цвета не повторяются по кругу). Проверено валидатором палитры (скил dataviz) на тёмном фоне:
 * различимость при обычном зрении ≥ 15 по всем парам. Светлота выше «тёмной» полосы
 * намеренно: линии лежат поверх спутникового снимка, а не на однотонном фоне графика.
 */
const FUTURE_REV_COLORS = [ORBIT_COLOR, '#b38cff', '#6be07c', '#fff07a'];
/** Витки +4 и дальше. */
const FAR_REV_COLOR = '#e6eef8';
const PAST_REV_COLOR = '#5f7a96';

export function revolutionColor(offset: number): string {
  if (offset < 0) return PAST_REV_COLOR;
  return offset < FUTURE_REV_COLORS.length ? FUTURE_REV_COLORS[offset] : FAR_REV_COLOR;
}
