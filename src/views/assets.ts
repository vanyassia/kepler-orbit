/**
 * Текстуры Земли и их загрузка. Одно и то же изображение используется
 * и 2D-картой, и 3D-глобусом — файл скачивается один раз.
 */
import { useEffect, useState } from 'react';
import type { BodyId } from '../physics/bodies';
import { askWorker, newImageId, OFF_THREAD } from './imageClient';

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
  venus2k: `${base}textures/venus_2k.webp`,
  venus8k: `${base}textures/venus_8k.webp`,
  venusClouds2k: `${base}textures/venus_clouds_2k.webp`,
  venusClouds4k: `${base}textures/venus_clouds_4k.webp`,
  saturn2k: `${base}textures/saturn_2k.webp`,
  saturn4k: `${base}textures/saturn_4k.webp`,
  mercury2k: `${base}textures/mercury_2k.webp?v=2`,
  mercury4k: `${base}textures/mercury_4k.webp?v=2`,
} as const;

/** Значки тел в переключателе: 160×80 пикселей, а не полные снимки. */
export const BODY_THUMB: Record<BodyId, string> = {
  earth: `${base}textures/thumb_earth.webp`,
  moon: `${base}textures/thumb_moon.webp`,
  mars: `${base}textures/thumb_mars.webp`,
  venus: `${base}textures/thumb_venus.webp`,
  saturn: `${base}textures/thumb_saturn.webp`,
  mercury: `${base}textures/thumb_mercury.webp?v=2`,
};

/**
 * Лёгкий режим: устройство с сенсорным экраном или с памятью ≤ 4 ГБ. Там грузятся только версии 2K:
 * текстура 8K весит 7–8 МБ и занимает в видеопамяти около 170 МБ — на телефоне это лишний трафик
 * и риск потери WebGL-контекста.
 */
export const LIGHT_DEVICE =
  typeof window !== 'undefined' &&
  (window.matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 1
    || ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4);

/** Снимок поверхности тела: сначала лёгкий, затем подробный (в лёгком режиме — только лёгкий). */
export const SURFACE: Record<BodyId, readonly string[]> = LIGHT_DEVICE
  ? { earth: [TEXTURES.day2k], moon: [TEXTURES.moon2k], mars: [TEXTURES.mars2k], venus: [TEXTURES.venus2k], saturn: [TEXTURES.saturn2k], mercury: [TEXTURES.mercury2k] }
  : {
      earth: [TEXTURES.day2k, TEXTURES.day8k],
      moon: [TEXTURES.moon2k, TEXTURES.moon6k],
      mars: [TEXTURES.mars2k, TEXTURES.mars8k],
      venus: [TEXTURES.venus2k, TEXTURES.venus8k],
      saturn: [TEXTURES.saturn2k, TEXTURES.saturn4k],
      mercury: [TEXTURES.mercury2k, TEXTURES.mercury4k],
    };

/** Ночные огни Земли. */
export const NIGHT_LIGHTS: readonly string[] = LIGHT_DEVICE ? [TEXTURES.night2k] : [TEXTURES.night2k, TEXTURES.night8k];

/** Плотный облачный слой Венеры (2K → 4K). */
export const VENUS_CLOUDS: readonly string[] = LIGHT_DEVICE
  ? [TEXTURES.venusClouds2k]
  : [TEXTURES.venusClouds2k, TEXTURES.venusClouds4k];

/** Подпись об источниках снимков. */
export const SURFACE_CREDIT: Record<BodyId, string> = {
  earth: 'NASA Blue Marble, Black Marble; Natural Earth',
  moon: 'Solar System Scope (CC BY 4.0) по данным NASA LRO',
  mars: 'Solar System Scope (CC BY 4.0) по данным NASA',
  venus: 'Solar System Scope (CC BY 4.0) по данным NASA Magellan',
  saturn: 'Облачный слой: Solar System Scope (CC BY 4.0)',
  mercury: 'Мозаика MESSENGER: NASA / JHU APL / USGS',
};

/** Подпись об источнике облачного слоя Венеры. */
export const VENUS_CLOUDS_CREDIT = 'Облачный слой: Solar System Scope (CC BY 4.0)';

/** Подпись об источнике активного снимка тела. */
export function surfaceCredit(body: BodyId, venusClouds = false): string {
  return body === 'venus' && venusClouds ? VENUS_CLOUDS_CREDIT : SURFACE_CREDIT[body];
}

const loadingImages = new Map<string, Promise<HTMLImageElement>>();

/** Загрузка и декодирование изображения (декодирование — вне основного потока). */
export function loadImage(url: string, priority: 'high' | 'low' = 'high'): Promise<HTMLImageElement> {
  let p = loadingImages.get(url);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = priority;
      img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
      img.onerror = () => reject(new Error(`Не удалось загрузить ${url}`));
      img.src = url;
    });
    void p.then(() => loadingImages.delete(url), () => loadingImages.delete(url));
    loadingImages.set(url, p);
  }
  return p;
}

/** Снимок для карты: готовые уменьшенные копии по возрастанию и полный файл, который грузится только при сильном приближении. */
export interface MapImage {
  levels: (ImageBitmap | HTMLImageElement)[];
  fullUrl: string | null;
  closed?: boolean;
}

/** Копии готовит отдельный поток: пересчёт 8K до размера экрана здесь занял бы 0,3 с. */
function loadMapImage(url: string): Promise<MapImage> {
  const plain = () => loadImage(url).then((img) => ({ levels: [img], fullUrl: null }));
  if (!OFF_THREAD) return plain();
  return askWorker<{ id: number; levels: ImageBitmap[]; complete: boolean }>({ type: 'levels', id: newImageId(), url }).then(
    ({ levels, complete }) => ({ levels, fullUrl: complete ? null : url }),
    (e) => {
      console.warn('Снимок карты загружается обычным способом:', url, e);
      return plain();
    },
  );
}

/** Полный снимок нужен, когда самая большая копия уже уже видимой ширины карты. */
export function ensureFullImage(img: MapImage, px: number, onReady: () => void) {
  const url = img.fullUrl;
  if (!url || img.closed || px <= img.levels[img.levels.length - 1].width) return;
  img.fullUrl = null;
  void askWorker<{ id: number; levels: ImageBitmap[]; complete: boolean }>({ type: 'full', id: newImageId(), url }).then(
    ({ levels: [full] }) => {
      if (img.closed) {
        full.close();
        return;
      }
      img.levels = [...img.levels, full];
      onReady();
    },
    (e) => console.warn('Полный снимок карты недоступен:', url, e),
  );
}

/** Прогрессивная загрузка для карты: возвращает лучшее из уже подготовленного. */
export function useProgressiveImage(urls: readonly string[]): MapImage | null {
  const [image, setImage] = useState<{ key: string; img: MapImage } | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    const loaded: MapImage[] = [];
    const close = (img: MapImage) => {
      img.closed = true;
      for (const level of img.levels) if ('close' in level) level.close();
      img.levels = [];
    };
    setImage(null);
    void (async () => {
      for (const url of urls) {
        const next = await loadMapImage(url).catch(() => null);
        if (!next) continue;
        if (!alive) {
          close(next);
          return;
        }
        loaded.push(next);
        setImage({ key, img: next });
      }
    })();
    return () => {
      alive = false;
      for (const img of loaded) close(img);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return image?.key === key ? image.img : null;
}
