/** Связь с потоком подготовки снимков (imageWorker): запрос — ответ. */
import type { ImageReply, ImageRequest } from './imageChunks';

/** Есть ли всё нужное для работы вне основного потока; иначе снимки грузятся обычным способом. */
export const OFF_THREAD = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: ImageReply) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<ImageReply>) => {
      const w = waiting.get(data.id);
      waiting.delete(data.id);
      if ('error' in data) w?.reject(new Error(data.error));
      else w?.resolve(data);
    };
    worker.onerror = () => {
      for (const w of waiting.values()) w.reject(new Error('Поток подготовки снимков остановился'));
      waiting.clear();
    };
  }
  return worker;
}

export const newImageId = () => nextId++;

export function askWorker<T extends ImageReply>(msg: ImageRequest): Promise<T> {
  // Адреса снимков относительны странице, а поток считал бы их от своего файла
  const absolute = 'url' in msg ? { ...msg, url: new URL(msg.url, document.baseURI).href } : msg;
  return new Promise((resolve, reject) => {
    waiting.set(msg.id, { resolve: resolve as (r: ImageReply) => void, reject });
    getWorker().postMessage(absolute);
  });
}

export const tellWorker = (msg: ImageRequest) => getWorker().postMessage(msg);
