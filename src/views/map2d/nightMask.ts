/**
 * Маски освещённости для карты в равнопромежуточной проекции.
 *
 * Для каждого пикселя считается синус высоты Солнца (формула (15)):
 *   sin h☉ = sin φ·sin φ☉ + cos φ·cos φ☉·cos(λ − λ☉).
 * Затемнение плавно нарастает от восхода/заката (h☉ ≈ −0,83° с учётом рефракции)
 * до конца навигационных сумерек (h☉ = −12°); огни городов проявляются с h☉ < −1°.
 */
import { DEG } from '../../physics/constants';

export const MASK_W = 512;
export const MASK_H = 256;

const SIN_SUNSET = Math.sin(-0.83 * DEG);
const SIN_NAUTICAL = Math.sin(-12 * DEG);
const SIN_LIGHTS_ON = Math.sin(-1 * DEG);
const SIN_LIGHTS_FULL = Math.sin(-9 * DEG);
const MAX_DARKNESS = 0.8;

export const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Заранее посчитанные значения по sin h☉ ∈ [−1, 1]: пикселей в маске 131 тысяча, а пересчёт — до 20 раз в секунду. */
const STEPS = 4096;
const tabulate = (fn: (sinH: number) => number) => Uint8ClampedArray.from({ length: STEPS + 1 }, (_, k) => fn((2 * k) / STEPS - 1));
const DARK_ALPHA = tabulate((x) => 255 * MAX_DARKNESS * smooth(SIN_SUNSET, SIN_NAUTICAL, x));
const LIGHTS_ALPHA = tabulate((x) => 255 * smooth(SIN_LIGHTS_ON, SIN_LIGHTS_FULL, x));

export interface NightMasks {
  /** Чёрный цвет с прозрачностью = степень затемнения. */
  dark: HTMLCanvasElement;
  /** Белый цвет с прозрачностью = яркость огней городов. */
  lights: HTMLCanvasElement;
  /** Пиксели масок: один буфер на всё время работы, новый на каждый пересчёт не создаётся. */
  darkPixels: ImageData;
  lightsPixels: ImageData;
}

export function createNightMasks(): NightMasks {
  const mk = () => Object.assign(document.createElement('canvas'), { width: MASK_W, height: MASK_H });
  const dark = mk();
  const lights = mk();
  const lightsPixels = lights.getContext('2d')!.createImageData(MASK_W, MASK_H);
  lightsPixels.data.fill(255); // белый цвет; яркость задаётся прозрачностью
  return { dark, lights, darkPixels: dark.getContext('2d')!.createImageData(MASK_W, MASK_H), lightsPixels };
}

/** Прозрачность масок для подсолнечной точки (широта и долгота в радианах): четвёртый байт каждого пикселя RGBA. */
export function fillNightAlpha(dark: Uint8ClampedArray, lights: Uint8ClampedArray, sub: { lat: number; lon: number }): void {
  const sinS = Math.sin(sub.lat);
  const cosS = Math.cos(sub.lat);

  const cosDl = new Float32Array(MASK_W);
  for (let c = 0; c < MASK_W; c++) {
    const lon = (((c + 0.5) / MASK_W) * 360 - 180) * DEG;
    cosDl[c] = Math.cos(lon - sub.lon);
  }

  for (let r = 0; r < MASK_H; r++) {
    const lat = (90 - ((r + 0.5) / MASK_H) * 180) * DEG;
    const a = Math.sin(lat) * sinS;
    const b = Math.cos(lat) * cosS;
    let i = r * MASK_W * 4;
    for (let c = 0; c < MASK_W; c++, i += 4) {
      const k = ((a + b * cosDl[c] + 1) * (STEPS / 2) + 0.5) | 0;
      dark[i + 3] = DARK_ALPHA[k];
      lights[i + 3] = LIGHTS_ALPHA[k];
    }
  }
}

/** Пересчёт масок для подсолнечной точки (широта и долгота в радианах). */
export function updateNightMasks(masks: NightMasks, sub: { lat: number; lon: number }): void {
  fillNightAlpha(masks.darkPixels.data, masks.lightsPixels.data, sub);
  masks.dark.getContext('2d')!.putImageData(masks.darkPixels, 0, 0);
  masks.lights.getContext('2d')!.putImageData(masks.lightsPixels, 0, 0);
}
