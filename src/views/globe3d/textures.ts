/**
 * Текстуры глобуса из общего кэша изображений (тот же файл, что и у 2D-карты).
 * Дневная текстура загружается прогрессивно: 2K → 8K → 16K (режим «Ультра», если позволяет GPU).
 */
import { useEffect, useMemo, useState } from 'react';
import type { WebGLRenderer } from 'three';
import { LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import type { Quality } from '../../state/store';
import { loadImage, TEXTURES } from '../assets';

function makeTexture(img: HTMLImageElement, color: boolean, anisotropy: number): Texture {
  const t = new Texture(img);
  t.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  t.anisotropy = anisotropy;
  t.minFilter = LinearMipmapLinearFilter;
  // По долготе текстура замкнута (облака сдвигаются по u) — повторяем, а не растягиваем край
  t.wrapS = RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

export interface EarthTextures {
  day: Texture | null;
  night: Texture | null;
  clouds: Texture | null;
  normal: Texture | null;
  specular: Texture | null;
  stars: Texture | null;
  /** Разрешение загруженной дневной текстуры по ширине, пикселей. */
  dayWidth: number;
}

/** Загружает текстуру, когда она появится; лучшая доступная версия заменяет предыдущую. */
function useTex(urls: string[], color: boolean, anisotropy: number): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    let best = -1;
    urls.forEach((url, idx) =>
      loadImage(url)
        .then((img) => {
          if (!alive || idx <= best) return;
          best = idx;
          setTex((prev) => {
            prev?.dispose();
            return makeTexture(img, color, anisotropy);
          });
        })
        .catch(() => {}),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, color, anisotropy]);
  return tex;
}

export function useEarthTextures(quality: Quality, gl: WebGLRenderer): EarthTextures {
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const ultraOk = gl.capabilities.maxTextureSize >= 16384;
  const dayUrls = useMemo(
    () => (quality === 'ultra' && ultraOk ? [TEXTURES.day2k, TEXTURES.day8k, TEXTURES.day16k] : [TEXTURES.day2k, TEXTURES.day8k]),
    [quality, ultraOk],
  );
  const day = useTex(dayUrls, true, anisotropy);
  const night = useTex([TEXTURES.night2k, TEXTURES.night8k], true, anisotropy);
  const clouds = useTex([TEXTURES.clouds], false, anisotropy);
  const normal = useTex([TEXTURES.normal], false, anisotropy);
  const specular = useTex([TEXTURES.specular], false, 1);
  const stars = useTex([TEXTURES.stars], true, 1);
  return { day, night, clouds, normal, specular, stars, dayWidth: (day?.image as HTMLImageElement | undefined)?.naturalWidth ?? 0 };
}
