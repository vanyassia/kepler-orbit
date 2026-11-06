/**
 * «Вид с борта»: камера стоит на спутнике и смотрит вниз, на подспутниковую точку.
 * Здесь — чистый расчёт угла обзора, без three.js: сколько неба и тела помещается в кадр.
 */

/** Наибольший половинный угол обзора по узкой стороне кадра, градусы: шире — сильные искажения по краям. */
export const BOARD_MAX_HALF_DEG = 40;
/** Наименьший половинный угол обзора, градусы (сильное приближение с Луны на Землю). */
export const BOARD_MIN_HALF_DEG = 0.15;
/** Запас вокруг диска тела, когда спутник далеко: диск занимает около 80 % узкой стороны кадра. */
export const BOARD_DISC_MARGIN = 1.25;
/** Пределы приближения колёсиком и щипком: множитель к тангенсу половинного угла. */
export const BOARD_ZOOM_MIN = 0.08;
export const BOARD_ZOOM_MAX = 1.6;

const RAD = 180 / Math.PI;

/**
 * Половинный угол обзора по узкой стороне кадра, градусы.
 * Издалека весь диск тела помещается в кадр с запасом; вблизи (низкая орбита) угол ограничен
 * BOARD_MAX_HALF_DEG — под спутником видна полоса поверхности, а не весь шар.
 *
 * @param distRadii расстояние от центра тела до спутника, в радиусах тела (r / R)
 * @param zoom множитель приближения: < 1 — ближе, > 1 — шире
 */
export function boardHalfAngle(distRadii: number, zoom = 1): number {
  // Угловой радиус диска тела с расстояния r: arcsin(R / r)
  const disc = Math.asin(Math.min(1, 1 / Math.max(1, distRadii))) * RAD;
  const auto = Math.min(BOARD_MAX_HALF_DEG, disc * BOARD_DISC_MARGIN);
  const t = Math.tan(auto / RAD) * clampZoom(zoom);
  return Math.min(BOARD_MAX_HALF_DEG * 1.25, Math.max(BOARD_MIN_HALF_DEG, Math.atan(t) * RAD));
}

/**
 * Вертикальный угол обзора камеры (three.js задаёт его по вертикали), градусы.
 * На узком высоком экране (телефон) угол boardHalfAngle — по ширине, иначе тело не помещается.
 */
export function boardFov(distRadii: number, aspect: number, zoom = 1): number {
  const half = boardHalfAngle(distRadii, zoom) / RAD;
  const vertical = aspect < 1 ? Math.atan(Math.tan(half) / aspect) : half;
  return 2 * vertical * RAD;
}

export const clampZoom = (z: number): number => Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, Number.isFinite(z) ? z : 1));

/**
 * Масштаб пунктира будущей трассы в виде с борта.
 *
 * Штрихи пунктира заданы в единицах сцены (около 140 км штрих, 100 км просвет) и подобраны под обзор
 * издалека. С борта низкого спутника поверхность в десятки раз ближе: первый штрих растягивается
 * на полэкрана, а просвет за ним выглядит как обрыв линии. Масштаб уменьшает штрихи так, чтобы
 * под спутником они были на экране той же длины, что и в обзоре.
 *
 * @param altitudeRadii высота камеры над поверхностью, в радиусах тела
 * @param halfDeg половинный угол обзора по узкой стороне кадра, градусы (boardHalfAngle)
 * @returns множитель dashScale материала линии: 1 — как в обзоре, больше — штрихи короче
 */
export function boardDashScale(altitudeRadii: number, halfDeg: number): number {
  const k = BOARD_DASH_REF / (Math.max(1e-4, altitudeRadii) * Math.tan(Math.max(BOARD_MIN_HALF_DEG, halfDeg) / RAD));
  return Math.min(BOARD_DASH_SCALE_MAX, Math.max(1, Number.isFinite(k) ? k : 1));
}

/** Обзор: до поверхности около 2,4 радиуса тела при половинном угле обзора 19° — 2,4 · tg 19°. */
export const BOARD_DASH_REF = 2.4 * Math.tan(19 / RAD);
/** Предел уменьшения штрихов: мельче они сливаются в сплошную линию. */
export const BOARD_DASH_SCALE_MAX = 400;
