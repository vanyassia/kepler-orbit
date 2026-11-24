import { Vector3 } from 'three';
import { DEG } from '../../physics/constants';
import { CASSINI_SPAN } from './cassiniModel';
import { SATURN_RING_OUTER } from './saturn';

/** Свободная область под панелью управления. Ось камеры смещена в центр этой области. */
export function cassiniFrame(width: number, height: number) {
  const bottom = Math.min(16, Math.min(width, height) * 0.08);
  const top = Math.min(width <= 720 ? 84 : 56, height * 0.28);
  const freeHeight = height - top - bottom;
  const shiftY = (top - bottom) / 2;
  const modelPxPerUnit = Math.min(80, Math.min(width, freeHeight) * 0.3) / CASSINI_SPAN;
  return { paddingX: bottom, top, freeHeight, shiftY, modelPxPerUnit };
}

/** Камера смотрит в центр Сатурна. В кадр входят кольца, эллипс и аппарат в любой точке эллипса. */
export function cassiniOverviewDistance(
  ellipse: readonly Vector3[], back: Vector3, cameraUp: Vector3,
  width: number, height: number, baseFov: number, modelRadius: number,
): number {
  const shortSide = Math.min(width, height);
  const focalPx = shortSide / (2 * Math.tan(baseFov * DEG / 2));
  const frame = cassiniFrame(width, height);
  const modelRatio = modelRadius * frame.modelPxPerUnit / focalPx;
  const right = new Vector3().crossVectors(cameraUp, back).normalize();
  const up = new Vector3().crossVectors(back, right);

  const fitAxis = (halfSize: number, axis: Vector3) => {
    const slope = halfSize / focalPx;
    const normal = Math.hypot(1, slope);
    // Масштаб модели пропорционален глубине, поэтому её радиус вычитается из наклона боковой плоскости кадра.
    const slopeWithModel = slope - modelRatio * normal;
    let distance = SATURN_RING_OUTER * normal / slope;
    for (const p of ellipse) {
      distance = Math.max(distance, p.dot(back) + Math.abs(p.dot(axis)) / slopeWithModel);
    }
    return distance;
  };
  return Math.max(7.8, fitAxis(width / 2 - frame.paddingX, right), fitAxis(frame.freeHeight / 2, up));
}
