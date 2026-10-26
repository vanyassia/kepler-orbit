/**
 * Геометрия карты. «Мировые» координаты карты — градусы:
 *   x = λ + 180 ∈ [0, 360],   y = 90 − φ ∈ [0, 180]
 * (равнопромежуточная проекция). Контуры d3-geo строятся сразу в этих координатах.
 */
import { geoEquirectangular, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';

export const WORLD_W = 360;
export const WORLD_H = 180;

/** Проекция d3: радианы → «мировые» координаты (x = λ° + 180, y = 90 − φ°). */
export const projection = geoEquirectangular()
  .scale(180 / Math.PI)
  .translate([180, 90])
  .precision(0.1);

/** Контур геообъекта как Path2D в мировых координатах (d3 сам разрезает по ±180°). */
export function toPath2D(object: GeoPermissibleObjects): Path2D {
  const p = new Path2D();
  geoPath(projection, p as unknown as CanvasRenderingContext2D)(object);
  return p;
}

/** Рисование геообъекта прямо в контекст (для часто меняющихся контуров). */
export function tracePath(ctx: CanvasRenderingContext2D, object: GeoPermissibleObjects): void {
  geoPath(projection, ctx)(object);
}

export interface BorderPaths {
  /** Границы между государствами. */
  borders: Path2D;
  /** Береговая линия. */
  coast: Path2D;
  /** Суша (для схематичного режима без спутникового снимка). */
  land: Path2D;
}

const bordersPromise: Partial<Record<'coarse' | 'fine', Promise<BorderPaths>>> = {};

/**
 * Natural Earth (пакет world-atlas), загружается по требованию: сначала 1:110 млн (108 КБ) —
 * для обзора всей карты этого достаточно; 1:50 млн (756 КБ) — только когда карту приблизили.
 */
export function loadBorders(detail: 'coarse' | 'fine' = 'coarse'): Promise<BorderPaths> {
  const load = detail === 'fine' ? () => import('world-atlas/countries-50m.json') : () => import('world-atlas/countries-110m.json');
  bordersPromise[detail] ??= load().then((mod) => {
    const topo = (mod.default ?? mod) as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>;
    const countries = topo.objects.countries;
    return {
      borders: toPath2D(mesh(topo, countries, (a, b) => a !== b)),
      coast: toPath2D(mesh(topo, countries, (a, b) => a === b)),
      land: toPath2D(feature(topo, topo.objects.land)),
    };
  });
  return bordersPromise[detail]!;
}
