/**
 * Текстуры глобуса из общего кэша изображений (тот же файл, что и у 2D-карты).
 * Дневная текстура загружается прогрессивно: 2K → 8K → 16K (режим «Ультра», если позволяет GPU).
 */
import { useEffect, useMemo, useState } from 'react';
import type { WebGLRenderer } from 'three';
import { LinearMipmapLinearFilter, NoColorSpace, RedFormat, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import type { Quality } from '../../state/store';
import type { BodyId } from '../../physics/bodies';
import { LIGHT_DEVICE, loadInOrder, NIGHT_LIGHTS, SURFACE, TEXTURES } from '../assets';

/** color — цветной снимок; data — числа, а не цвет (рельеф); mask — один канал (облака, океаны): вчетверо меньше видеопамяти. */
type TextureKind = 'color' | 'data' | 'mask';

function makeTexture(img: HTMLImageElement, kind: TextureKind, anisotropy: number): Texture {
  const t = new Texture(img);
  t.colorSpace = kind === 'color' ? SRGBColorSpace : NoColorSpace;
  if (kind === 'mask') {
    t.format = RedFormat;
    t.internalFormat = 'R8';
  }
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
}

const NONE: string[] = [];

/**
 * Загружает текстуру, когда она появится; лучшая доступная версия заменяет предыдущую.
 * Старая версия освобождает видеопамять; пустой список — текстура не нужна (другое тело).
 */
function useTex(urls: string[], kind: TextureKind, anisotropy: number, lead = false): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    if (urls.length === 0) setTex(null);
    void loadInOrder(urls, (img) => setTex(makeTexture(img, kind, anisotropy)), () => alive, lead);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, anisotropy]);
  // После смены текстуры материал уже переключён на новую — старую можно освободить
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}

export function useEarthTextures(quality: Quality, gl: WebGLRenderer, body: BodyId = 'earth'): EarthTextures {
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const ultraOk = gl.capabilities.maxTextureSize >= 16384;
  const dayUrls = useMemo(
    () =>
      body !== 'earth'
        ? [...SURFACE[body]]
        : quality === 'ultra' && ultraOk && !LIGHT_DEVICE
          ? [TEXTURES.day2k, TEXTURES.day8k, TEXTURES.day16k]
          : [...SURFACE.earth],
    [quality, ultraOk, body],
  );
  const day = useTex(dayUrls, 'color', anisotropy, true);
  // Остальное — когда глобус уже виден, чтобы первый снимок не делил канал с тяжёлыми файлами.
  // Огни, облака, рельеф и маска океанов есть только у Земли — для Луны и Марса не скачиваются
  const shown = !!day;
  const earth = shown && body === 'earth';
  const night = useTex(earth ? [...NIGHT_LIGHTS] : NONE, 'color', anisotropy);
  const clouds = useTex(earth ? [TEXTURES.clouds] : NONE, 'mask', anisotropy);
  const normal = useTex(earth ? [TEXTURES.normal] : NONE, 'data', anisotropy);
  const specular = useTex(earth ? [TEXTURES.specular] : NONE, 'mask', 1);
  const stars = useTex(shown ? [TEXTURES.stars] : NONE, 'color', 1);
  return { day, night, clouds, normal, specular, stars };
}
