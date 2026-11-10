/**
 * Скользящий кэш трассы: точки считаются с запасом в четверть витка с каждой стороны
 * и пересчитываются, только когда окно отображения выходит за пределы кэша.
 */
import { historicFlight } from '../data/historicOrbiters';
import { ROTATION_PERIOD } from '../physics/bodies';
import { RAD } from '../physics/constants';
import type { TrackPoint } from '../physics/groundTrack';
import { trackStepSeconds } from '../physics/groundTrack';
import type { PreparedOrbit } from '../physics/propagate';
import { ascendingNodeTimes, subPointAt } from '../physics/propagate';

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
  /** Исторический полёт: раньше старта трассы нет (виток до старта не рисуется). */
  fromMs: number;
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
      fromMs: historicFlight(orbit.elements.noradId)?.startMs ?? -Infinity,
      at: (t) => {
        const p = subPointAt(orbit, t);
        return { timeMs: t, lat: p.lat * RAD, lon: p.lon * RAD, h: p.h };
      },
    };
    sources.set(orbit, s);
  }
  return s;
}

/** Виток длиннее двух недель (Луна вокруг Земли): за целые витки трасса — десятки оборотов сплошными полосами. */
const LONG_PERIOD_SEC = 14 * 86400;

/**
 * Сколько витков трассы показывать назад и вперёд. У обычных орбит — сколько выбрано в настройках.
 * У очень долгих тот же счёт идёт оборотами трассы вокруг тела: подспутниковая точка обходит тело
 * за 1 / |1/T_вращ − 1/T| (у Луны ≈ 24 ч 50 мин), и окно «1 назад, 2 вперёд» — это 1 и 2 таких оборота.
 */
export function trackSpan(orbit: PreparedOrbit, revsBack: number, revsForward: number): { back: number; forward: number } {
  if (orbit.T <= LONG_PERIOD_SEC) return { back: revsBack, forward: revsForward };
  const lap = 1 / Math.abs(1 / ROTATION_PERIOD[orbit.body.id] - 1 / orbit.T);
  const k = lap / orbit.T;
  return { back: revsBack * k, forward: revsForward * k };
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
      for (let tt = this.from; tt <= this.to; tt += stepMs) this.points.push(tt < src.fromMs ? null : src.at(tt));
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
 * Сколько витков начинается на будущей части трассы — узлы в (t, t + forward·T].
 * У обычных орбит это ровно forward. У очень долгих (Луна вокруг Земли: виток 27 сут, окно — пара суток)
 * узел попадает в окно лишь иногда: тогда на трассе есть «+1», и легенда должна его показать.
 */
export function revolutionsAhead(orbit: PreparedOrbit, t: number, forwardRevs: number): number {
  return ascendingNodeTimes(orbit, t, t + forwardRevs * orbit.T * 1000).filter((n) => n > t).length;
}

/**
 * Начала витков (восходящие узлы), которые попадают на показанную трассу: от её начала до конца.
 * Прошедшие (не позже t) отмечаются на карте тихой точкой, будущие — точкой с подписью «+1», «+2»…
 */
export function nodesInWindow(revs: Revolutions, t: number, backRevs: number, forwardRevs: number, periodSec: number): { time: number; offset: number }[] {
  const from = t - backRevs * periodSec * 1000;
  const to = t + forwardRevs * periodSec * 1000;
  return revs.nodes.filter((n) => n >= from && n <= to).map((n) => ({ time: n, offset: revs.offsetAt(n) }));
}

/**
 * Цвета витков. Текущий и три следующих — свои оттенки, дальше — один общий
 * (цвета не повторяются по кругу). Оттенки одной насыщенности (OKLCH, C ≈ 0,13), без «кислотных»:
 * голубой → барвинковый → орхидея → шалфей. Проверено на тёмном фоне: различимость (ΔE OKLab)
 * при обычном зрении ≥ 14 по всем парам, при дейтеранопии и протанопии ≥ 6. Светлота выше
 * «тёмной» полосы намеренно: линии лежат поверх спутникового снимка, а не на однотонном фоне графика.
 */
const FUTURE_REV_COLORS = [ORBIT_COLOR, '#959af4', '#ee95d1', '#9ec773'];
/** Витки +4 и дальше. */
const FAR_REV_COLOR = '#d4dfeb';
const PAST_REV_COLOR = '#77889b';

export function revolutionColor(offset: number): string {
  if (offset < 0) return PAST_REV_COLOR;
  return offset < FUTURE_REV_COLORS.length ? FUTURE_REV_COLORS[offset] : FAR_REV_COLOR;
}
