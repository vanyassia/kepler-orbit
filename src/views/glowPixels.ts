/** Цвет с прозрачностью: r, g, b — 0…255, a — 0…1. */
export type Rgba = readonly [number, number, number, number];

/**
 * Пиксели мягкого круглого пятна (свечение Солнца и спутника) размером size×size, RGBA по байту.
 * Раньше пятно рисовалось радиальным градиентом canvas, но Safari подмешивает в такой
 * градиент шум, и после загрузки в видеокарту он виден как цветные точки вокруг ядра.
 * Здесь каждый пиксель считается сам: одинаково во всех браузерах.
 * Точки перехода те же, что были у градиента: ядро до 0,18 радиуса, край ореола на 0,45, к краю — прозрачность.
 * Между точками цвет смешивается с учётом прозрачности, как в градиенте canvas.
 */
export function glowPixels(size: number, inner: Rgba, outer: Rgba): Uint8Array {
  const stops: Array<[number, Rgba]> = [
    [0, inner],
    [0.18, inner],
    [0.45, outer],
    [1, [outer[0], outer[1], outer[2], 0]],
  ];
  const px = new Uint8Array(size * size * 4);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot(x + 0.5 - c, y + 0.5 - c) / c);
      let k = 1;
      while (k < stops.length - 1 && r > stops[k][0]) k++;
      const [r0, a] = stops[k - 1];
      const [r1, b] = stops[k];
      const f = r1 > r0 ? (r - r0) / (r1 - r0) : 0;
      const alpha = a[3] + (b[3] - a[3]) * f;
      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        // Смешивание домноженных на прозрачность цветов, затем обратно к обычному цвету
        const pre = a[ch] * a[3] + (b[ch] * b[3] - a[ch] * a[3]) * f;
        px[i + ch] = Math.round(alpha > 0 ? pre / alpha : b[ch]);
      }
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}
