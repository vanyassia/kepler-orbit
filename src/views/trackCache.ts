/**
 * Скользящий кэш трассы: точки считаются с запасом в четверть витка с каждой стороны
 * и пересчитываются, только когда окно отображения выходит за пределы кэша.
 */
import { historicFlight } from '../data/historicOrbiters';
import { cassiniWindow } from '../data/orbiters';
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
  toMs?: number;
}

const sources = new WeakMap<object, TrackSource>();

/** Наша модель (задача двух тел). */
export function orbitSource(orbit: PreparedOrbit): TrackSource {
  let s = sources.get(orbit);
  if (!s) {
    const archive = cassiniWindow(orbit.elements.body, orbit.elements.noradId);
    s = {
      key: orbit,
      periodSec: orbit.T,
      stepSec: trackStepSeconds(orbit),
      fromMs: archive?.startMs ?? historicFlight(orbit.elements.noradId)?.startMs ?? -Infinity,
      toMs: archive?.endMs,
      at: (t) => {
        if (archive && (t < archive.startMs || t > archive.endMs)) return null;
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
 * Сколько витков трассы показывать назад и вперёд. У обычных орбит — сколько выбрано в настройках,
 * у повторяющейся трассы — не меньше целого цикла (назад + вперёд = n витков).
 * У очень долгих тот же счёт идёт оборотами трассы вокруг тела: подспутниковая точка обходит тело
 * за 1 / |s/T − Ω_тела/(2π)|, где s = ±1 — направление орбиты, а знак Ω_тела учитывает обратное
 * вращение Венеры (у Луны ≈ 24 ч 50 мин). Окно «1 назад, 2 вперёд» — это 1 и 2 таких оборота.
 */
export function trackSpan(orbit: PreparedOrbit, revsBack: number, revsForward: number): { back: number; forward: number } {
  // Повторяющаяся трасса: показываем весь цикл, иначе узор не замкнётся
  const cycle = orbit.elements.repeatRevs;
  if (cycle) return { back: revsBack, forward: Math.max(revsForward, cycle - revsBack) };
  if (orbit.T <= LONG_PERIOD_SEC) return { back: revsBack, forward: revsForward };
  const dir = Math.cos(orbit.iEq) >= 0 ? 1 : -1;
  const bodyFreq = Math.sign(orbit.body.turn(0, 86_400_000)) / ROTATION_PERIOD[orbit.body.id];
  const rel = Math.abs(dir / orbit.T - bodyFreq);
  // Почти синхронная орбита (например, лунностационарная): не делим на ноль и не растягиваем окно
  if (rel <= 1 / (2 * orbit.T)) return { back: revsBack, forward: revsForward };
  const k = 1 / (rel * orbit.T);
  return { back: revsBack * k, forward: revsForward * k };
}

export interface TrackWindow {
  /** Прошедшая часть: от t − N_назад·T до текущего момента. */
  past: TrackPoint[];
  /** Будущая часть: от текущего момента до t + N_вперёд·T. */
  future: TrackPoint[];
  /** Текущая подспутниковая точка. */
  current: TrackPoint;
  /** Номер набора точек: меняется при пересечении любой границей очередной точки. */
  revision: number;
}

/** Предел числа точек в каждой части окна: столько вмещают линии глобуса. */
export const MAX_WINDOW_POINTS = 20_000;
/** На равномерную сетку отводим до 75% окна, остальное оставляем для быстрых участков. */
const MAX_BASE_POINTS = 15_000;
/** Наибольшая глубина дробления быстрого шага (перицентр вытянутых орбит и проход у полюса): stepMs / 2^6. */
const MAX_REFINE_DEPTH = 6;
/** Разница долгот по короткой дуге, градусы (0…180). */
const deltaLonDeg = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);

/**
 * Нужны ли промежуточные точки между a и b: на вытянутых орбитах у перицентра за один шаг по времени
 * спутник может пролететь до 10° дуги, а у полюсов долгота меняется резко — без дробления трасса
 * срезает вершину у полюса и ломается в перицентре.
 */
function needsRefine(a: TrackPoint, b: TrackPoint, tolerance: number): boolean {
  if (b.timeMs - a.timeMs <= 2000) return false;
  const dLat = Math.abs(b.lat - a.lat);
  const dLon = deltaLonDeg(a.lon, b.lon);
  const cosLat = Math.cos((((a.lat + b.lat) * 0.5) * Math.PI) / 180);
  return Math.hypot(dLat, dLon * cosLat) > 1.5 * tolerance || dLon > 10 * tolerance;
}

/** Рекурсивное заполнение промежуточных точек строго между a и b (в порядке времени). */
function refineBetween(src: TrackSource, a: TrackPoint, b: TrackPoint, depth: number, tolerance: number, out: TrackPoint[]): void {
  if (depth >= MAX_REFINE_DEPTH || !needsRefine(a, b, tolerance)) return;
  const m = src.at((a.timeMs + b.timeMs) / 2);
  if (!m) return;
  refineBetween(src, a, m, depth + 1, tolerance, out);
  out.push(m);
  refineBetween(src, m, b, depth + 1, tolerance, out);
}

/** Учитываем и запас кэша: ни при каком сдвиге окна оно не должно переполнить буфер. */
function fitsWindow(points: TrackPoint[], duration: number): boolean {
  const offset = MAX_WINDOW_POINTS - 1; // одно место занимает текущая точка
  for (let i = offset; i < points.length; i++) {
    if (points[i].timeMs - points[i - offset].timeMs <= duration) return false;
  }
  return true;
}

export class TrackCache {
  private key: object | null = null;
  private points: TrackPoint[] = [];
  private from = 0;
  private to = 0;
  private duration = 0;
  /** Последнее окно: его массивы используются повторно, чтобы не плодить мусор в памяти на каждый кадр. */
  private window: TrackWindow | null = null;
  private span = '';
  private revision = 0;

  /** Индекс первой точки с временем ≥ t (или строго > t при after). */
  private pointIndex(t: number, after = false): number {
    let lo = 0;
    let hi = this.points.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const time = this.points[mid].timeMs;
      if (time < t || (after && time === t)) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  get(src: TrackSource, t: number, revsBack: number, revsForward: number): TrackWindow | null {
    const Tms = src.periodSec * 1000;
    const a = src.toMs === undefined ? t - revsBack * Tms : src.fromMs;
    const b = src.toMs ?? t + revsForward * Tms;
    const duration = Math.max(revsBack, revsForward) * Tms;
    if (src.key !== this.key || duration !== this.duration || a < this.from || b > this.to) {
      const stepMs = Math.max(src.stepSec * 1000, duration / (MAX_BASE_POINTS - 2));
      const margin = Math.min(0.25 * Tms, Math.max(duration, stepMs));
      this.key = src.key;
      this.duration = duration;
      // Выравниваем начало по сетке шага, чтобы точки не «дрожали» при пересчёте
      this.from = Math.floor((a - margin) / stepMs) * stepMs;
      this.to = b + margin;
      const last = Math.ceil((this.to - this.from) / stepMs);
      const base: (TrackPoint | null)[] = [];
      if (src.toMs !== undefined) base.push(src.at(src.fromMs));
      for (let i = 0; i <= last; i++) {
        const time = this.from + i * stepMs;
        if (src.toMs !== undefined && (time <= src.fromMs || time >= src.toMs)) continue;
        base.push(time < src.fromMs ? null : src.at(time));
      }
      if (src.toMs !== undefined) base.push(src.at(src.toMs));
      // Если точек слишком много, одинаково ослабляем критерий дробления по всему окну.
      // При достаточно большом пороге остаётся только базовая сетка, которая заведомо вмещается.
      let tolerance = 1;
      do {
        this.points = [];
        let prev: TrackPoint | null = null;
        for (const point of base) {
          if (point) {
            if (prev) refineBetween(src, prev, point, 0, tolerance, this.points);
            this.points.push(point);
          }
          prev = point;
        }
        tolerance *= 2;
      } while (!fitsWindow(this.points, duration));
      this.span = '';
    }
    const current = src.at(t);
    if (!current) return null;
    const pastStart = this.pointIndex(a);
    const pastEnd = this.pointIndex(t);
    const futureStart = this.points[pastEnd]?.timeMs === t ? pastEnd + 1 : pastEnd;
    const futureEnd = this.pointIndex(b, true);
    const span = `${pastStart}|${pastEnd}|${futureStart}|${futureEnd}`;
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
    for (let i = pastStart; i < pastEnd; i++) next.past.push(this.points[i]);
    next.past.push(current);
    for (let i = futureStart; i < futureEnd; i++) next.future.push(this.points[i]);
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

/** В архивной легенде — цвета реально нарисованных отрезков. Карта красит отрезок по его середине. */
export function futureTrackLegend(points: TrackPoint[], revs: Revolutions): { current: boolean; forward: number } {
  if (points.length < 2) return { current: false, forward: 0 };
  const offset = (i: number) => revs.offsetAt((points[i].timeMs + points[i + 1].timeMs) / 2);
  return { current: offset(0) === 0, forward: offset(points.length - 2) };
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
