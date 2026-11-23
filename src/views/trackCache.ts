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
  /** Номер набора точек: меняется, когда окно сдвинулось на шаг сетки. Между сменами меняется только current. */
  revision: number;
}

/** Предел числа точек в каждой части окна: столько вмещают линии глобуса. */
export const MAX_WINDOW_POINTS = 20_000;
/** Наибольшая глубина дробления быстрого шага (перицентр вытянутых орбит и проход у полюса): stepMs / 2^6. */
const MAX_REFINE_DEPTH = 6;
/** Разница долгот по короткой дуге, градусы (0…180). */
const deltaLonDeg = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);

/**
 * Нужны ли промежуточные точки между a и b: на вытянутых орбитах у перицентра за один шаг по времени
 * спутник может пролететь до 10° дуги, а у полюсов долгота меняется резко — без дробления трасса
 * срезает вершину у полюса и ломается в перицентре.
 */
function needsRefine(a: TrackPoint, b: TrackPoint): boolean {
  if (b.timeMs - a.timeMs <= 2000) return false;
  const dLat = Math.abs(b.lat - a.lat);
  const dLon = deltaLonDeg(a.lon, b.lon);
  const cosLat = Math.cos((((a.lat + b.lat) * 0.5) * Math.PI) / 180);
  return Math.hypot(dLat, dLon * cosLat) > 1.5 || dLon > 10;
}

/** Рекурсивное заполнение промежуточных точек строго между a и b (в порядке времени). */
function refineBetween(src: TrackSource, a: TrackPoint, b: TrackPoint, depth: number, budget: { left: number }, out: TrackPoint[]): void {
  if (depth >= MAX_REFINE_DEPTH || budget.left <= 0 || !needsRefine(a, b)) return;
  const tm = (a.timeMs + b.timeMs) / 2;
  if (tm < src.fromMs) return;
  const m = src.at(tm);
  if (!m) return;
  budget.left--;
  refineBetween(src, a, m, depth + 1, budget, out);
  out.push(m);
  refineBetween(src, m, b, depth + 1, budget, out);
}

export class TrackCache {
  private key: object | null = null;
  private points: (TrackPoint | null)[] = [];
  /** Промежуточные точки между points[i] и points[i + 1] на быстрых участках (перицентр, полюс). */
  private extra: (TrackPoint[] | undefined)[] = [];
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
      // Уточняем быстрые участки (перицентр, полюса) в пределах запаса до MAX_WINDOW_POINTS
      const maxBase = Math.ceil((Math.max(revsBack, revsForward) * Tms) / stepMs) + 2;
      const budget = { left: Math.max(0, MAX_WINDOW_POINTS - maxBase) };
      this.extra = new Array(this.points.length);
      for (let i = 0; i < this.points.length - 1 && budget.left > 0; i++) {
        const p0 = this.points[i];
        const p1 = this.points[i + 1];
        if (!p0 || !p1 || !needsRefine(p0, p1)) continue;
        const mid: TrackPoint[] = [];
        refineBetween(src, p0, p1, 0, budget, mid);
        if (mid.length) this.extra[i] = mid;
      }
      this.span = '';
    }
    const current = src.at(t);
    if (!current) return null;
    const ia = Math.max(0, Math.ceil((a - this.from) / this.stepMs));
    const it = Math.floor((t - this.from) / this.stepMs);
    const ib = Math.floor((b - this.from) / this.stepMs);
    // На уточнённом шаге учитываем, сколько промежуточных точек уже позади текущего момента t
    const curExtra = this.extra[it];
    let sub = 0;
    if (curExtra) {
      while (sub < curExtra.length && curExtra[sub].timeMs < t) sub++;
    }
    const span = `${ia}|${it}|${sub}|${ib}`;
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
    // Промежуточные точки в начале окна (между a и points[ia])
    const lead = ia > 0 ? this.extra[ia - 1] : undefined;
    if (lead) {
      for (const p of lead) if (p.timeMs >= a && p.timeMs < t) next.past.push(p);
    }
    for (let i = ia; i <= it; i++) {
      const p = this.points[i];
      if (p && p.timeMs < t) next.past.push(p);
      const ex = this.extra[i];
      if (ex) {
        for (const q of ex) if (q.timeMs < t) next.past.push(q);
      }
    }
    next.past.push(current);
    if (curExtra) {
      for (let k = sub; k < curExtra.length; k++) if (curExtra[k].timeMs > t && curExtra[k].timeMs <= b) next.future.push(curExtra[k]);
    }
    for (let i = it + 1; i <= ib; i++) {
      const p = this.points[i];
      if (p && p.timeMs <= b) next.future.push(p);
      const ex = this.extra[i];
      if (ex) {
        for (const q of ex) if (q.timeMs <= b) next.future.push(q);
      }
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
