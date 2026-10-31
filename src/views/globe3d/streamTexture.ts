/**
 * Загрузка снимка в видеокарту порциями. Обычная загрузка 8K целиком останавливает кадры на 0,3–0,6 с —
 * заметный фриз при каждом переключении тела. Здесь пиксели готовит отдельный поток (imageWorker),
 * а в видеокарту уходит одна порция за кадр.
 */
import type { WebGLRenderer } from 'three';
import { ExternalTexture, NoColorSpace, SRGBColorSpace, Texture } from 'three';
import { mipLevels, planChunks, rowsPerChunk } from '../imageChunks';
import { askWorker, newImageId, OFF_THREAD, tellWorker } from '../imageClient';

/** color — цветной снимок; data — числа, а не цвет (рельеф); mask — один канал (облака, океаны). */
export type TextureKind = 'color' | 'data' | 'mask';

/** Очередь кадров: все снимки делят её, поэтому за кадр копируется ровно одна порция. */
const turns: (() => void)[] = [];
let scheduled = false;
function pump() {
  scheduled = false;
  turns.shift()?.();
  if (turns.length && !scheduled) {
    scheduled = true;
    requestAnimationFrame(pump);
  }
}
const nextTurn = () =>
  new Promise<void>((resolve) => {
    turns.push(resolve);
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(pump);
    }
  });

async function stream(renderer: WebGLRenderer, url: string, kind: TextureKind, anisotropy: number, alive: () => boolean): Promise<Texture | null> {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const state = renderer.state;
  const id = newImageId();
  const { width, height } = await askWorker<{ id: number; width: number; height: number }>({ type: 'open', id, url });
  const channels = kind === 'mask' ? 1 : 4;
  const glTex = gl.createTexture();
  const bind = () => {
    state.bindTexture(gl.TEXTURE_2D, glTex);
    state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    state.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    state.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  };
  try {
    bind();
    gl.texStorage2D(gl.TEXTURE_2D, mipLevels(width, height), kind === 'mask' ? gl.R8 : kind === 'color' ? gl.SRGB8_ALPHA8 : gl.RGBA8, width, height);
    // По долготе снимок замкнут (облака сдвигаются по u) — повторяем, а не растягиваем край
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso && anisotropy > 1) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, anisotropy);
    state.unbindTexture();

    for (const part of planChunks(height, rowsPerChunk(width, channels))) {
      const { data } = await askWorker<{ id: number; y: number; rows: number; data: Uint8Array }>({ type: 'chunk', id, channels, ...part });
      await nextTurn();
      if (!alive()) {
        gl.deleteTexture(glTex);
        return null;
      }
      bind();
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, part.y, width, part.rows, channels === 1 ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, data);
      state.unbindTexture();
    }
    await nextTurn();
    if (!alive()) {
      gl.deleteTexture(glTex);
      return null;
    }
    bind();
    gl.generateMipmap(gl.TEXTURE_2D);
    state.unbindTexture();
    const t = new ExternalTexture(glTex);
    t.colorSpace = kind === 'color' ? SRGBColorSpace : NoColorSpace;
    return t;
  } catch (e) {
    gl.deleteTexture(glTex);
    throw e;
  } finally {
    tellWorker({ type: 'close', id });
  }
}

/** Освобождает видеопамять снимка, в том числе созданного вне three.js. */
export function releaseTexture(renderer: WebGLRenderer, t: Texture) {
  t.dispose();
  if (t instanceof ExternalTexture && t.sourceTexture) renderer.getContext().deleteTexture(t.sourceTexture as WebGLTexture);
}

/** Снимок по частям; null — снимок уже не нужен, undefined — потоки недоступны, грузить обычным способом. */
export async function streamTexture(renderer: WebGLRenderer, url: string, kind: TextureKind, anisotropy: number, alive: () => boolean): Promise<Texture | null | undefined> {
  if (!OFF_THREAD) return undefined;
  try {
    return await stream(renderer, url, kind, anisotropy, alive);
  } catch (e) {
    console.warn('Снимок загружается обычным способом:', url, e);
    return undefined;
  }
}
