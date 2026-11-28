/** Связь с потоком подготовки снимков (imageWorker): запрос — ответ. */
import type { ImageReply, ImageRequest } from './imageChunks';

/** Есть ли всё нужное для работы вне основного потока; иначе снимки грузятся обычным способом. */
export const OFF_THREAD = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: ImageReply) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>();

function restart(failed: Worker, reason: string) {
  if (worker !== failed) return;
  worker = null;
  failed.terminate();
  for (const w of waiting.values()) {
    clearTimeout(w.timeout);
    w.reject(new Error(reason));
  }
  waiting.clear();
}

function getWorker(): Worker {
  if (!worker) {
    const current = new Worker(new URL('./imageWorker.ts', import.meta.url), { type: 'module' });
    worker = current;
    current.onmessage = ({ data }: MessageEvent<ImageReply>) => {
      if (worker !== current) return;
      const w = waiting.get(data.id);
      if (!w) return;
      clearTimeout(w.timeout);
      waiting.delete(data.id);
      if ('error' in data) w.reject(new Error(data.error));
      else w.resolve(data);
    };
    current.onerror = () => restart(current, 'Поток подготовки снимков остановился');
    current.onmessageerror = () => restart(current, 'Не удалось прочитать снимок из фонового потока');
  }
  return worker;
}

export const newImageId = () => nextId++;

export function askWorker<T extends ImageReply>(msg: ImageRequest): Promise<T> {
  // Адреса снимков относительны странице, а поток считал бы их от своего файла
  const absolute = 'url' in msg ? { ...msg, url: new URL(msg.url, document.baseURI).href } : msg;
  return new Promise((resolve, reject) => {
    const current = getWorker();
    const timeout = setTimeout(() => restart(current, 'Поток подготовки снимков не ответил вовремя'), 30_000);
    waiting.set(msg.id, { resolve: resolve as (r: ImageReply) => void, reject, timeout });
    try {
      current.postMessage(absolute);
    } catch {
      restart(current, 'Не удалось отправить запрос в фоновый поток');
    }
  });
}

export const tellWorker = (msg: ImageRequest) => worker?.postMessage(msg);
