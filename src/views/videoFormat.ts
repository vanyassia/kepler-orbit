/**
 * Запись видео: выбор формата и размера кадра. Чистые функции — без браузерных объектов, покрыты тестами.
 */

/**
 * Форматы по порядку предпочтения. MP4 (H.264) открывается везде: QuickTime, PowerPoint, Keynote, телефоны.
 * Safari и новый Chrome пишут MP4, Firefox и старый Chrome — только WebM.
 */
export const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.640028',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

/** Первый формат, который браузер умеет писать; '' — пусть браузер выберет сам. */
export function pickVideoType(isSupported: (type: string) => boolean): string {
  for (const t of VIDEO_TYPES) {
    try {
      if (isSupported(t)) return t;
    } catch {
      /* старый браузер бросает исключение на незнакомую строку */
    }
  }
  return '';
}

/** Расширение файла по типу, который выдал MediaRecorder. */
export function videoExtension(type: string): 'mp4' | 'webm' {
  return /mp4/i.test(type) ? 'mp4' : 'webm';
}

/** Длинная сторона кадра видео: Full HD — хватает для проектора, файл небольшой, кодек справляется на телефоне. */
export const VIDEO_MAX_SIDE = 1920;

/**
 * Размер кадра видео по размеру вида: пропорции сохраняются, длинная сторона — не больше maxSide,
 * обе стороны чётные (кодек H.264 нечётные не принимает).
 */
export function videoSize(width: number, height: number, maxSide = VIDEO_MAX_SIDE): { width: number; height: number } {
  const k = Math.min(1, maxSide / Math.max(width, height, 1));
  const even = (x: number) => Math.max(2, 2 * Math.round((x * k) / 2));
  return { width: even(width), height: even(height) };
}

/** Поток видео: около 0,13 бита на пиксель кадра при 30 кадрах в секунду, но от 2 до 12 Мбит/с. */
export function videoBitrate(width: number, height: number): number {
  return Math.round(Math.min(12e6, Math.max(2e6, width * height * 30 * 0.13)));
}

/** «0:07» — секунды записи для плашки. */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
