import { describe, expect, it } from 'vitest';
import type { TrackPoint } from '../../physics/groundTrack';
import { trackHeading } from '../map2d/renderMap';
import type { TrackWindow } from '../trackCache';

const pt = (timeMs: number, lon: number, lat: number): TrackPoint => ({ timeMs, lon, lat, h: 400 });
const win = (cur: TrackPoint, next?: TrackPoint, prev?: TrackPoint): TrackWindow => ({
  current: cur,
  future: next ? [cur, next] : [cur],
  past: prev ? [prev, cur] : [cur],
  revision: 0,
});

describe('направление значка спутника на карте', () => {
  it('на восток — вправо, на север — вверх экрана', () => {
    expect(trackHeading(win(pt(0, 10, 0), pt(60, 11, 0)))).toBeCloseTo(0);
    expect(trackHeading(win(pt(0, 10, 0), pt(60, 10, 1)))).toBeCloseTo(-Math.PI / 2);
  });

  it('через линию перемены дат — коротким путём', () => {
    expect(trackHeading(win(pt(0, 179.5, 0), pt(60, -179.5, 0)))).toBeCloseTo(0);
  });

  it('в конце окна трассы — по предыдущей точке', () => {
    expect(trackHeading(win(pt(60, 10, 0), undefined, pt(0, 9, -1)))).toBeCloseTo(-Math.PI / 4);
  });
});
