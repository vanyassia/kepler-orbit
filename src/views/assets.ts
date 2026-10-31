/**
 * Текстуры Земли и их загрузка. Одно и то же изображение используется
 * и 2D-картой, и 3D-глобусом — файл скачивается один раз.
 */
import { useEffect, useState } from 'react';
import type { BodyId } from '../physics/bodies';

const base = import.meta.env.BASE_URL;

export const TEXTURES = {
  day2k: `${base}textures/earth_day_2k.webp`,
  day8k: `${base}textures/earth_day_8k.webp`,
  day16k: `${base}textures/earth_day_16k.jpg`, // WebP не вмещает 16384 пикселя по ширине
  night2k: `${base}textures/earth_night_2k.webp`,
  night8k: `${base}textures/earth_night_8k.webp`,
  clouds: `${base}textures/earth_clouds_4k.webp`,
  normal: `${base}textures/earth_normal_4k.webp`,
  specular: `${base}textures/earth_specular_2k.webp`,
  stars: `${base}textures/stars_4k.webp`,
  moon2k: `${base}textures/moon_2k.webp`,
  moon6k: `${base}textures/moon_6k.webp`,
  mars2k: `${base}textures/mars_2k.webp`,
  mars8k: `${base}textures/mars_8k.jpg`, // зернистый снимок: в WebP того же качества почти не становится легче
} as const;

/** Значки тел в переключателе: 160×80 пикселей, а не полные снимки. */
export const BODY_THUMB: Record<BodyId, string> = {
  earth: `${base}textures/thumb_earth.webp`,
  moon: `${base}textures/thumb_moon.webp`,
  mars: `${base}textures/thumb_mars.webp`,
};

/**
 * Лёгкий режим: устройство с сенсорным экраном или с памятью ≤ 4 ГБ. Там грузятся только версии 2K:
 * текстура 8K весит 7–8 МБ и занимает в видеопамяти около 170 МБ — на телефоне это лишний трафик
 * и риск потери WebGL-контекста.
 */
export const LIGHT_DEVICE =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4);

/** Снимок поверхности тела: сначала лёгкий, затем подробный (в лёгком режиме — только лёгкий). */
export const SURFACE: Record<BodyId, readonly string[]> = LIGHT_DEVICE
  ? { earth: [TEXTURES.day2k], moon: [TEXTURES.moon2k], mars: [TEXTURES.mars2k] }
  : {
      earth: [TEXTURES.day2k, TEXTURES.day8k],
      moon: [TEXTURES.moon2k, TEXTURES.moon6k],
      mars: [TEXTURES.mars2k, TEXTURES.mars8k],
    };

/** Ночные огни Земли. */
export const NIGHT_LIGHTS: readonly string[] = LIGHT_DEVICE ? [TEXTURES.night2k] : [TEXTURES.night2k, TEXTURES.night8k];

/** Подпись об источниках снимков. */
export const SURFACE_CREDIT: Record<BodyId, string> = {
  earth: 'NASA Blue Marble, Black Marble; Natural Earth',
  moon: 'Solar System Scope (CC BY 4.0) по данным NASA LRO',
  mars: 'Solar System Scope (CC BY 4.0) по данным NASA',
};

const cache = new Map<string, Promise<HTMLImageElement>>();

/** Загрузка и декодирование изображения (декодирование — вне основного потока). */
export function loadImage(url: string, priority: 'high' | 'low' = 'high'): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = priority;
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
 * Версии снимка по очереди, от лёгкой к подробной: лёгкая появляется сразу и не делит канал
 * с тяжёлыми. Версия, которую не удалось скачать, пропускается — остаётся предыдущая.
 */
export async function loadInOrder(urls: readonly string[], onImage: (img: HTMLImageElement) => void, alive: () => boolean, lead = true): Promise<void> {
  for (const [idx, url] of urls.entries()) {
    if (!alive()) return;
    const img = await loadImage(url, lead && idx === 0 ? 'high' : 'low').catch(() => null);
    if (img && alive()) onImage(img);
  }
}

/** Прогрессивная загрузка: возвращает лучшее из уже загруженных изображений. */
export function useProgressiveImage(urls: readonly string[]): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    void loadInOrder(urls, setImg, () => alive);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return img;
}
