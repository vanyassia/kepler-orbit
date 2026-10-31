/**
 * Текстуры глобуса. Дневная загружается прогрессивно: 2K → 8K → 16K (режим «Ультра», если позволяет GPU).
 * Снимки уходят в видеокарту порциями (streamTexture), поэтому смена тела не останавливает кадры.
 */
import { useEffect, useMemo, useState } from 'react';
import type { WebGLRenderer } from 'three';
import { LinearMipmapLinearFilter, NoColorSpace, RedFormat, RepeatWrapping, SRGBColorSpace, Texture } from 'three';
import type { Quality } from '../../state/store';
import type { BodyId } from '../../physics/bodies';
import { LIGHT_DEVICE, loadImage, NIGHT_LIGHTS, SURFACE, TEXTURES } from '../assets';
import type { TextureKind } from './streamTexture';
import { releaseTexture, streamTexture } from './streamTexture';

/** Обычная загрузка целиком: запасной путь для браузеров без OffscreenCanvas. */
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
 * epoch растёт после потери WebGL-контекста: снимки в видеокарте пропали, грузим заново.
 */
function useTex(renderer: WebGLRenderer, urls: string[], kind: TextureKind, anisotropy: number, epoch: number): Texture | null {
  const [tex, setTex] = useState<Texture | null>(null);
  const key = urls.join('|');
  useEffect(() => {
    let alive = true;
    const isAlive = () => alive;
    if (urls.length === 0) setTex(null);
    void (async () => {
      for (const url of urls) {
        let t = await streamTexture(renderer, url, kind, anisotropy, isAlive);
        if (t === undefined && alive) {
          const img = await loadImage(url).catch(() => null);
          t = img && makeTexture(img, kind, anisotropy);
        }
        if (!alive) {
          if (t) releaseTexture(renderer, t);
          return;
        }
        if (t) setTex(t);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, anisotropy, epoch]);
  // После смены текстуры материал уже переключён на новую — старую можно освободить
  useEffect(() => () => {
    if (tex) releaseTexture(renderer, tex);
  }, [tex, renderer]);
  return tex;
}

export function useEarthTextures(quality: Quality, gl: WebGLRenderer, body: BodyId = 'earth'): EarthTextures {
  const anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
  const ultraOk = gl.capabilities.maxTextureSize >= 16384;
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const canvas = gl.domElement;
    const restored = () => setEpoch((n) => n + 1);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => canvas.removeEventListener('webglcontextrestored', restored);
  }, [gl]);
  const dayUrls = useMemo(
    () =>
      body !== 'earth'
        ? [...SURFACE[body]]
        : quality === 'ultra' && ultraOk && !LIGHT_DEVICE
          ? [TEXTURES.day2k, TEXTURES.day8k, TEXTURES.day16k]
          : [...SURFACE.earth],
    [quality, ultraOk, body],
  );
  const day = useTex(gl, dayUrls, 'color', anisotropy, epoch);
  // Остальное — когда глобус уже виден, чтобы первый снимок не делил канал с тяжёлыми файлами.
  // Огни, облака, рельеф и маска океанов есть только у Земли — для Луны и Марса не скачиваются
  const shown = !!day;
  const earth = shown && body === 'earth';
  const night = useTex(gl, earth ? [...NIGHT_LIGHTS] : NONE, 'color', anisotropy, epoch);
  const clouds = useTex(gl, earth ? [TEXTURES.clouds] : NONE, 'mask', anisotropy, epoch);
  const normal = useTex(gl, earth ? [TEXTURES.normal] : NONE, 'data', anisotropy, epoch);
  const specular = useTex(gl, earth ? [TEXTURES.specular] : NONE, 'mask', 1, epoch);
  const stars = useTex(gl, shown ? [TEXTURES.stars] : NONE, 'color', 1, epoch);
  return { day, night, clouds, normal, specular, stars };
}
