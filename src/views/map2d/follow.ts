/**
 * Слежение карты за спутником на телефоне. Считается отдельно по каждой оси экрана: пока спутник
 * в средней части кадра, карта стоит; подошёл к краю — карта плавно подтягивается, пока он снова
 * не окажется в середине. Быстрый спутник (ускорение времени) карта ведёт непрерывно, сдвигаясь
 * вместе с ним.
 */

/** Спокойная зона: спутник дальше этой доли размера от края — карту не двигаем. */
export const FOLLOW_MARGIN = 0.2;
/** Ближе этой доли к краю спутник не подпускается даже при большой скорости. */
export const FOLLOW_HARD_MARGIN = 0.08;
/** Постоянная времени плавного подтягивания, с. */
const TAU = 0.35;
/** Подтягивание закончено, когда спутник ближе этой доли размера к середине… */
const SETTLE = 0.02;
/** …и до края спокойной зоны он доберётся не раньше чем за это время, с. Иначе ведём непрерывно. */
const LOOKAHEAD = 10;

export interface FollowInput {
  /** Положение спутника на экране, px. */
  x: number;
  /** Сколько спутник прошёл по карте с прошлого шага, px экрана (уже учтено в x). */
  moved: number;
  /** Сглаженная скорость спутника по карте, px/с: решает, вести ли его непрерывно. */
  speed: number;
  /** Размер видимой области по этой оси, px. */
  size: number;
  /** Время с прошлого шага, с. */
  dt: number;
  /** Шло ли подтягивание на прошлом шаге. */
  active: boolean;
  /** false — без плавности (prefers-reduced-motion или скачок спутника): сразу в середину. */
  smooth: boolean;
}

export interface FollowStep {
  /** На сколько пикселей сдвинуть карту (положительное — вправо или вниз). */
  shift: number;
  /** Идёт ли подтягивание: на следующем шаге продолжать, даже если спутник уже в спокойной зоне. */
  active: boolean;
}

/** Один шаг слежения по одной оси. */
export function followStep({ x, moved, speed, size, dt, active, smooth }: FollowInput): FollowStep {
  const center = size / 2;
  const off = center - x;
  const outside = Math.abs(off) > (0.5 - FOLLOW_MARGIN) * size;
  // Спутник далеко за краем (после скачка времени или перехода через ±180°) — сразу, без проезда по всей карте
  if (!smooth || Math.abs(off) > size) return { shift: outside ? off : 0, active: false };
  if (!active && !outside) return { shift: 0, active: false };

  // Карта едет вместе со спутником (весь его ход с прошлого шага) и плавно подтягивает его к середине.
  // Подтягивание считается от прежнего места: так скорость спутника не даёт отставания
  const before = x - moved;
  let shift = (center - before) * (1 - Math.exp(-Math.min(dt, 0.1) / TAU)) - moved;
  const lo = FOLLOW_HARD_MARGIN * size;
  const hi = size - lo;
  if (x + shift < lo) shift = lo - x;
  else if (x + shift > hi) shift = hi - x;

  const settled = Math.abs(center - (x + shift)) < SETTLE * size && speed * LOOKAHEAD < (0.5 - FOLLOW_MARGIN) * size;
  return { shift, active: !settled };
}

/** Смещение долготы за шаг коротким путём и признак перехода через линию перемены дат. */
export function lonStep(prev: number, next: number): { delta: number; wrapped: boolean } {
  const raw = next - prev;
  if (raw > 180) return { delta: raw - 360, wrapped: true };
  if (raw < -180) return { delta: raw + 360, wrapped: true };
  return { delta: raw, wrapped: false };
}
