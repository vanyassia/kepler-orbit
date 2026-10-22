/**
 * Невозмущённое кеплерово движение: связь между временем и положением на орбите.
 * Формулы (1)–(7), docs/formulas.md.
 */
import { MU, SECONDS_PER_DAY, TWO_PI } from './constants';
import { wrap2Pi } from './math';

/**
 * Формула (1). Среднее движение в рад/с по числу оборотов в сутки.
 *
 *   n = 2π·N / 86400,
 *
 * N — среднее движение из каталога CelesTrak (MEAN_MOTION), об/сут.
 */
export function meanMotionFromRevPerDay(revPerDay: number): number {
  return (TWO_PI * revPerDay) / SECONDS_PER_DAY;
}

/**
 * Формула (2). Большая полуось из третьего закона Кеплера n²a³ = μ:
 *
 *   a = ∛(μ / n²).
 *
 * @param n среднее движение, рад/с.
 * @returns a, км.
 */
export function semiMajorAxis(n: number, mu = MU): number {
  return Math.cbrt(mu / (n * n));
}

/**
 * Формула (3). Период обращения:
 *
 *   T = 2π·√(a³/μ).
 *
 * @returns T, с.
 */
export function orbitalPeriod(a: number, mu = MU): number {
  return TWO_PI * Math.sqrt((a * a * a) / mu);
}

/**
 * Формула (3). Фокальный параметр орбиты:
 *
 *   p = a(1 − e²).
 */
export function focalParameter(a: number, e: number): number {
  return a * (1 - e * e);
}

/**
 * Формула (4). Средняя аномалия в момент t:
 *
 *   M = M₀ + n(t − t₀).
 *
 * @param M0 средняя аномалия на эпоху t₀, рад.
 * @param n среднее движение, рад/с.
 * @param dt t − t₀, с.
 * @returns M, рад, в диапазоне [0, 2π).
 */
export function meanAnomalyAt(M0: number, n: number, dt: number): number {
  return wrap2Pi(M0 + n * dt);
}

/** Результат решения уравнения Кеплера. */
export interface KeplerSolution {
  /** Эксцентрическая аномалия E, рад, [0, 2π). */
  E: number;
  /** Число выполненных итераций Ньютона. */
  iterations: number;
}

/**
 * Формула (5). Решение уравнения Кеплера
 *
 *   E − e·sin E = M
 *
 * методом Ньютона (касательных):
 *
 *   E_{k+1} = E_k − (E_k − e·sin E_k − M) / (1 − e·cos E_k).
 *
 * Начальное приближение: E₀ = M + e·sin M (при e < 0,8), E₀ = π (при e ≥ 0,8) —
 * второе гарантирует сходимость для сильно вытянутых орбит (типа «Молния»).
 *
 * @param M средняя аномалия, рад.
 * @param e эксцентриситет, 0 ≤ e < 1.
 * @param tol допустимая невязка, рад.
 */
export function solveKepler(M: number, e: number, tol = 1e-13, maxIter = 50): KeplerSolution {
  if (e < 0 || e >= 1) throw new RangeError(`Эксцентриситет вне диапазона эллиптических орбит: ${e}`);
  const Mn = wrap2Pi(M);
  let E = e < 0.8 ? Mn + e * Math.sin(Mn) : Math.PI;
  for (let k = 1; k <= maxIter; k++) {
    const f = E - e * Math.sin(E) - Mn;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) return { E: wrap2Pi(E), iterations: k };
  }
  return { E: wrap2Pi(E), iterations: maxIter };
}

/**
 * Формула (6). Истинная аномалия по эксцентрической:
 *
 *   tg(ϑ/2) = √((1 + e)/(1 − e)) · tg(E/2).
 *
 * В коде используется эквивалентная запись через atan2, которая сразу
 * даёт правильную четверть и не имеет особенности при E = π:
 *
 *   ϑ = 2·atan2(√(1 + e)·sin(E/2), √(1 − e)·cos(E/2)).
 *
 * @returns ϑ, рад, [0, 2π).
 */
export function trueAnomalyFromEccentric(E: number, e: number): number {
  return wrap2Pi(2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)));
}

/**
 * Формула (7). Радиус-вектор (уравнение орбиты):
 *
 *   r = a(1 − e·cos E) = p / (1 + e·cos ϑ).
 */
export function radiusFromEccentric(a: number, e: number, E: number): number {
  return a * (1 - e * Math.cos(E));
}

/** Формула (7), вторая форма: r = p / (1 + e·cos ϑ). */
export function radiusFromTrue(p: number, e: number, theta: number): number {
  return p / (1 + e * Math.cos(theta));
}
