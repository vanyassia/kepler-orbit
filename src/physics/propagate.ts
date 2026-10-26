/**
 * Фасад физического ядра: «начальные элементы + момент времени → полное состояние КА».
 * Порядок расчёта — по листку «Трасса спутника» (docs/formulas.md):
 *
 *   шаг 2:  T = 86400/N → n = 2π/T → a = ∛(μ/n²) → h_п, h_а;
 *   шаг 4:  S на эпоху → λ_Ω = Ω − S;
 *   шаг 5:  M = M₀ + n·t → E (уравнение Кеплера, метод Ньютона) → ν → u = ω + ν
 *           → sin φ = sin u·sin i → ab = atan2(cos i·sin u, cos u) → λ = λ_Ω + ab − ω_З·t.
 *
 * Для высоты и 3D-сцены дополнительно считаются r = a(1 − e·cos E), координаты x, y, z (9)
 * и скорость (10) — в листке их нет, но трассу они не меняют.
 */
import { DEG, TWO_PI } from './constants';
import type { Vec3 } from './math';
import { wrap2Pi } from './math';
import {
  focalParameter,
  meanAnomalyAt,
  meanMotionFromRevPerDay,
  periodFromRevPerDay,
  radiusFromEccentric,
  semiMajorAxis,
  solveKepler,
  trueAnomalyFromEccentric,
} from './kepler';
import { argumentOfLatitude, inertialPosition, inertialVelocity, velocityComponents } from './orbit';
import { geoToGreenwich, greenwichToInertial } from './frames';
import { equatorPath, latitudeFromArgument, nodeLongitude, subSatelliteLongitude } from './subpoint';
import type { BodyId, CentralBody } from './bodies';
import { BODIES } from './bodies';

/**
 * Начальные элементы орбиты на эпоху t₀ — ровно то, что берётся из каталога CelesTrak.
 * Углы — в градусах, как в исходных данных.
 */
export interface OrbitalElements {
  name: string;
  noradId: number;
  /** Международное обозначение (COSPAR), например «1998-067A». */
  cosparId?: string;
  /** Эпоха элементов t₀, мс Unix (UTC). */
  epochMs: number;
  /** Среднее движение N, об/сут. */
  meanMotion: number;
  /** Эксцентриситет e. */
  eccentricity: number;
  /** Наклонение i, °. */
  inclinationDeg: number;
  /** Долгота восходящего узла Ω, °. */
  raanDeg: number;
  /** Аргумент перицентра ω, °. */
  argPerigeeDeg: number;
  /** Средняя аномалия на эпоху M₀, °. */
  meanAnomalyDeg: number;
  /**
   * Центральное тело (по умолчанию Земля). Для Луны и Марса элементы заданы в системе
   * «экватор тела и узел» (так их выдаёт JPL Horizons).
   */
  body?: BodyId;
}

/** Элементы, приведённые к радианам, и производные постоянные орбиты. */
export interface PreparedOrbit {
  elements: OrbitalElements;
  /** Центральное тело: μ, радиус, вращение. */
  body: CentralBody;
  epochMs: number;
  /** Среднее движение n, рад/с. */
  n: number;
  /** Большая полуось a, км. */
  a: number;
  e: number;
  /** Фокальный параметр p, км. */
  p: number;
  /** Период T, с. */
  T: number;
  /** Наклонение i, рад. */
  i: number;
  /** Долгота восходящего узла Ω, рад. */
  raan: number;
  /** Аргумент перицентра ω, рад. */
  omega: number;
  /** Средняя аномалия на эпоху M₀, рад. */
  M0: number;
  /** Радиусы перицентра и апоцентра r_π = a(1 − e), r_α = a(1 + e), км. */
  rPerigee: number;
  rApogee: number;
  /** Высоты перигея и апогея над шаром, км. */
  hPerigee: number;
  hApogee: number;
  /** Угол поворота тела на эпоху S(t₀), рад (шаг 4). */
  S0: number;
  /** Долгота восходящего узла на эпоху λ_Ω = Ω − S(t₀), рад (шаг 4). */
  lambdaNode: number;
  /**
   * Наклонение, долгота узла и сдвиг отсчёта u относительно экватора, вокруг которого вращается тело.
   * Для Земли и Луны совпадают с i, Ω и 0. У Марса элементы JPL Horizons заданы относительно
   * полюса IAU 2015, а вращение — по IAU 2009 (формула (20)); разница ≈ 1,5° учтена здесь.
   */
  iEq: number;
  raanEq: number;
  uShift: number;
}

export function prepareOrbit(el: OrbitalElements): PreparedOrbit {
  const body = BODIES[el.body ?? 'earth'];
  const T = periodFromRevPerDay(el.meanMotion); // шаг 2: T = 86400/N
  const n = meanMotionFromRevPerDay(el.meanMotion); // n = 2π/T
  const a = semiMajorAxis(n, body.mu); // a = ∛(μ/n²)
  const e = el.eccentricity;
  const i = el.inclinationDeg * DEG;
  const raan = el.raanDeg * DEG;
  const S0 = body.rotationAngle(el.epochMs);
  const eq = equatorElements(body, el.epochMs, i, raan, S0);
  return {
    elements: el,
    body,
    epochMs: el.epochMs,
    n,
    a,
    e,
    p: focalParameter(a, e),
    T,
    i,
    raan,
    omega: el.argPerigeeDeg * DEG,
    M0: el.meanAnomalyDeg * DEG,
    rPerigee: a * (1 - e),
    rApogee: a * (1 + e),
    hPerigee: a * (1 - e) - body.radius,
    hApogee: a * (1 + e) - body.radius,
    S0,
    lambdaNode: nodeLongitude(eq.raan, S0), // шаг 4: λ_Ω = Ω − S
    iEq: eq.i,
    raanEq: eq.raan,
    uShift: eq.uShift,
  };
}

/**
 * Плоскость орбиты относительно экватора вращения тела: переводим нормаль к орбите
 * и направление на узел в систему тела на эпоху и снимаем поворот на S(t₀).
 * Для Земли и Луны это тождественное преобразование.
 */
function equatorElements(body: CentralBody, t0: number, i: number, raan: number, S0: number) {
  const conv = (v: Vec3) => greenwichToInertial(body.toFixed(v, t0), S0);
  const h = conv({ x: Math.sin(raan) * Math.sin(i), y: -Math.cos(raan) * Math.sin(i), z: Math.cos(i) });
  const node = conv({ x: Math.cos(raan), y: Math.sin(raan), z: 0 });
  const iEq = Math.acos(Math.max(-1, Math.min(1, h.z)));
  const raanEq = Math.atan2(h.x, -h.y);
  const nx = Math.cos(raanEq);
  const ny = Math.sin(raanEq);
  // Угол от нового узла до старого в плоскости орбиты (знак — по нормали h)
  const cross = { x: ny * node.z, y: -nx * node.z, z: nx * node.y - ny * node.x };
  const uShift = Math.atan2(h.x * cross.x + h.y * cross.y + h.z * cross.z, nx * node.x + ny * node.y);
  return { i: iEq, raan: raanEq, uShift };
}

/** Полное состояние КА в момент t (все промежуточные величины — для пояснений в UI). */
export interface SatelliteState {
  timeMs: number;
  /** t − t₀, с. */
  dt: number;
  /** Номер витка от эпохи (целая часть (M₀ + n·Δt)/2π). */
  revolution: number;
  M: number;
  E: number;
  keplerIterations: number;
  /** Истинная аномалия ϑ, рад. */
  theta: number;
  r: number;
  u: number;
  /** Положение и скорость в АГЭСК, км и км/с. */
  eci: Vec3;
  vEci: Vec3;
  Vr: number;
  Vn: number;
  V: number;
  /** Угол поворота тела S (W) в момент t, рад. */
  S: number;
  /** Путь по экватору от узла ab, рад (шаг 5.6). */
  ab: number;
  /** Поворот тела за время после эпохи ω_З·t, рад (шаг 5.7). */
  turn: number;
  /** Положение в ГСК, км. */
  ecef: Vec3;
  /** Широта и долгота подспутниковой точки, рад; высота, км. */
  lat: number;
  lon: number;
  h: number;
}

export function propagate(orbit: PreparedOrbit, timeMs: number): SatelliteState {
  const dt = (timeMs - orbit.epochMs) / 1000;
  const revolution = Math.floor((orbit.M0 + orbit.n * dt) / TWO_PI);
  const M = meanAnomalyAt(orbit.M0, orbit.n, dt); // (4)
  const { E, iterations } = solveKepler(M, orbit.e); // (5)
  const theta = trueAnomalyFromEccentric(E, orbit.e); // (6)
  const r = radiusFromEccentric(orbit.a, orbit.e, E); // (7)
  const u = argumentOfLatitude(orbit.omega, theta); // (8)
  const eci = inertialPosition(r, u, orbit.raan, orbit.i); // (9)
  const { Vr, Vn, V } = velocityComponents(orbit.p, orbit.e, theta, orbit.body.mu); // (10)
  const vEci = inertialVelocity(Vr, Vn, u, orbit.raan, orbit.i);
  // Подспутниковая точка — сферический треугольник (шаги 5.5–5.8)
  const uEq = u + orbit.uShift;
  const lat = latitudeFromArgument(uEq, orbit.iEq); // sin φ = sin u · sin i
  const ab = equatorPath(uEq, orbit.iEq); // ab = atan2(cos i · sin u, cos u)
  const turn = orbit.body.turn(orbit.epochMs, timeMs); // ω_З · t
  const lon = subSatelliteLongitude(orbit.lambdaNode, ab, turn); // λ = λ_Ω + ab − ω_З·t
  const h = r - orbit.body.radius;
  const S = orbit.body.rotationAngle(timeMs);
  const ecef = geoToGreenwich(lat, lon, h, orbit.body.radius);
  return { timeMs, dt, revolution, M, E, keplerIterations: iterations, theta, r, u, eci, vEci, Vr, Vn, V, S, ab, turn, ecef, lat, lon, h };
}

/**
 * Положение КА в АГЭСК при заданной истинной аномалии (без привязки ко времени).
 * Используется для построения эллипса орбиты и характерных точек.
 */
export function positionAtTrueAnomaly(orbit: PreparedOrbit, theta: number): Vec3 {
  const r = orbit.p / (1 + orbit.e * Math.cos(theta));
  return inertialPosition(r, argumentOfLatitude(orbit.omega, theta), orbit.raan, orbit.i);
}

/**
 * Замкнутый эллипс орбиты в АГЭСК (в задаче двух тел он неподвижен в инерциальном пространстве).
 * Точки равномерны по эксцентрической аномалии E — так они гуще у перицентра,
 * где КА движется быстрее и кривизна больше.
 */
export function orbitEllipse(orbit: PreparedOrbit, segments = 256): Vec3[] {
  const pts: Vec3[] = [];
  for (let k = 0; k <= segments; k++) {
    const E = (k / segments) * TWO_PI;
    pts.push(positionAtTrueAnomaly(orbit, trueAnomalyFromEccentric(E, orbit.e)));
  }
  return pts;
}

/**
 * Средняя аномалия, соответствующая истинной ϑ (обращение формул (6) и (5)):
 *   E = 2·atan2(√(1 − e)·sin(ϑ/2), √(1 + e)·cos(ϑ/2)),   M = E − e·sin E.
 */
export function meanAnomalyFromTrue(theta: number, e: number): number {
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(theta / 2), Math.sqrt(1 + e) * Math.cos(theta / 2));
  return wrap2Pi(E - e * Math.sin(E));
}

/**
 * Моменты прохождения восходящего узла (u = 0, т. е. ϑ = −ω) в интервале [t1, t2].
 * Восходящий узел — традиционное начало витка; используется для засечек на шкале времени.
 */
export function ascendingNodeTimes(orbit: PreparedOrbit, t1Ms: number, t2Ms: number): number[] {
  const Mnode = meanAnomalyFromTrue(wrap2Pi(-orbit.omega), orbit.e);
  const periodMs = orbit.T * 1000;
  // Ближайший момент M = M_узла после эпохи, затем сдвиг на целое число периодов
  const firstAfterEpoch = orbit.epochMs + (wrap2Pi(Mnode - orbit.M0) / orbit.n) * 1000;
  const k0 = Math.ceil((t1Ms - firstAfterEpoch) / periodMs);
  const times: number[] = [];
  for (let k = k0; ; k++) {
    const t = firstAfterEpoch + k * periodMs;
    if (t > t2Ms) break;
    times.push(t);
  }
  return times;
}
