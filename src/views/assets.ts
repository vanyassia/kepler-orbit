/**
 * Текстуры Земли и их загрузка. Одно и то же изображение используется
 * и 2D-картой, и 3D-глобусом — файл скачивается один раз.
 */
import { useEffect, useState } from 'react';
import type { BodyId } from '../physics/bodies';

const base = import.meta.env.BASE_URL;

export const TEXTURES = {
  day2k: `${base}textures/earth_day_2k.jpg`,
  day8k: `${base}textures/earth_day_8k.jpg`,
  day16k: `${base}textures/earth_day_16k.jpg`,
  night2k: `${base}textures/earth_night_2k.jpg`,
  night8k: `${base}textures/earth_night_8k.jpg`,
  clouds: `${base}textures/earth_clouds_4k.jpg`,
  normal: `${base}textures/earth_normal_4k.jpg`,
  specular: `${base}textures/earth_specular_2k.jpg`,
  stars: `${base}textures/stars_4k.jpg`,
  moon2k: `${base}textures/moon_2k.jpg`,
  moon6k: `${base}textures/moon_6k.jpg`,
  mars2k: `${base}textures/mars_2k.jpg`,
  mars8k: `${base}textures/mars_8k.jpg`,
} as const;

/** Снимок поверхности тела: сначала лёгкий, затем подробный. */
export const SURFACE: Record<BodyId, readonly string[]> = {
  earth: [TEXTURES.day2k, TEXTURES.day8k],
  moon: [TEXTURES.moon2k, TEXTURES.moon6k],
  mars: [TEXTURES.mars2k, TEXTURES.mars8k],
};

/** Подпись об источниках снимков. */
export const SURFACE_CREDIT: Record<BodyId, string> = {
  earth: 'NASA Blue Marble, Black Marble; Natural Earth',
  moon: 'Solar System Scope (CC BY 4.0) по данным NASA LRO',
  mars: 'Solar System Scope (CC BY 4.0) по данным NASA',
};

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Загрузка и декодирование изображения (декодирование — вне основного потока). */
export function loadImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
      img.onerror = () => reject(new Error(`Не удалось загрузить ${url}`));
      img.src = url;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/**
 * Прогрессивная загрузка: сначала лёгкая версия (появляется сразу), затем подробная.
 * Возвращает лучшее из уже загруженных изображений.
 */
export function useProgressiveImage(urls: readonly string[]): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    let best = -1;
    urls.forEach((url, idx) => {
      loadImage(url)
        .then((im) => {
          if (alive && idx > best) {
            best = idx;
            setImg(im);
          }
        })
        .catch(() => {
          /* более подробная версия может отсутствовать — остаёмся на предыдущей */
        });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return img;
}
