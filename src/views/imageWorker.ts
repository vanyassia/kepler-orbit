/// <reference lib="webworker" />
/**
 * Подготовка снимков вне основного потока: скачивание, декодирование, порции строк для глобуса
 * и уменьшенные копии для карты. Основной поток занят только показом кадров.
 */
import { levelWidths, redChannel, type ImageReply, type ImageRequest } from './imageChunks';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const images = new Map<number, ImageBitmap>();

async function decode(url: string): Promise<ImageBitmap> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
}

async function open(id: number, url: string) {
  const bitmap = await decode(url);
  images.set(id, bitmap);
  return { id, width: bitmap.width, height: bitmap.height };
}

/** Порция строк снизу вверх: так их ждёт WebGL (иначе снимок оказался бы перевёрнут). */
function chunk(id: number, y: number, rows: number, channels: 1 | 4) {
  const bitmap = images.get(id)!;
  const canvas = new OffscreenCanvas(bitmap.width, rows);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, -1, 0, rows);
  ctx.drawImage(bitmap, 0, bitmap.height - y - rows, bitmap.width, rows, 0, 0, bitmap.width, rows);
  const rgba = ctx.getImageData(0, 0, bitmap.width, rows).data;
  const data = channels === 1 ? redChannel(rgba) : new Uint8Array(rgba.buffer);
  return { id, y, rows, data };
}

/** Копии для карты: каждая строится из предыдущей, большей. */
async function levels(id: number, url: string) {
  const full = await decode(url);
  const out: ImageBitmap[] = [];
  let from: ImageBitmap = full;
  for (const width of levelWidths(full.width).reverse()) {
    if (width === full.width) {
      out.unshift(full);
      continue;
    }
    const canvas = new OffscreenCanvas(width, Math.round((width * full.height) / full.width));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(from, 0, 0, canvas.width, canvas.height);
    from = canvas.transferToImageBitmap();
    out.unshift(from);
  }
  const hasFull = out.includes(full);
  if (!hasFull) full.close();
  return { id, levels: out, complete: hasFull };
}

scope.onmessage = async ({ data: msg }: MessageEvent<ImageRequest>) => {
  try {
    if (msg.type === 'open') scope.postMessage((await open(msg.id, msg.url)) satisfies ImageReply);
    else if (msg.type === 'chunk') {
      const reply = chunk(msg.id, msg.y, msg.rows, msg.channels);
      scope.postMessage(reply satisfies ImageReply, [reply.data.buffer as ArrayBuffer]);
    } else if (msg.type === 'levels') {
      const reply = await levels(msg.id, msg.url);
      scope.postMessage(reply satisfies ImageReply, reply.levels);
    } else if (msg.type === 'full') {
      const full = await decode(msg.url);
      scope.postMessage({ id: msg.id, levels: [full], complete: true } satisfies ImageReply, [full]);
    } else {
      images.get(msg.id)?.close();
      images.delete(msg.id);
    }
  } catch (e) {
    scope.postMessage({ id: msg.id, error: String(e) } satisfies ImageReply);
  }
};
