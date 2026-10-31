/** Обмен с потоком подготовки снимков, нарезка снимка на порции и выбор копии для карты. */

export type ImageRequest =
  | { type: 'open'; id: number; url: string }
  | { type: 'chunk'; id: number; y: number; rows: number; channels: 1 | 4 }
  | { type: 'close'; id: number }
  | { type: 'levels'; id: number; url: string }
  | { type: 'full'; id: number; url: string };

export type ImageReply =
  | { id: number; width: number; height: number }
  | { id: number; y: number; rows: number; data: Uint8Array }
  | { id: number; levels: ImageBitmap[]; complete: boolean }
  | { id: number; error: string };

/** Порция за один кадр: примерно столько байт копируется в видеокарту без заметной паузы. */
export const CHUNK_BYTES = 4 * 1024 * 1024;

/** Сколько строк шириной width помещается в порцию (не меньше одной). */
export const rowsPerChunk = (width: number, channels: 1 | 4): number => Math.max(1, Math.floor(CHUNK_BYTES / (width * channels)));

/** Число уровней детализации снимка: от полного размера до одного пикселя. */
export const mipLevels = (width: number, height: number): number => Math.floor(Math.log2(Math.max(width, height))) + 1;

/** Порции снимка высотой height: начальная строка и число строк, последняя может быть короче. */
export function planChunks(height: number, rows: number): { y: number; rows: number }[] {
  const out: { y: number; rows: number }[] = [];
  for (let y = 0; y < height; y += rows) out.push({ y, rows: Math.min(rows, height - y) });
  return out;
}

/** Красный канал из RGBA: для масок хватает одного канала, вчетверо меньше видеопамяти. */
export function redChannel(rgba: Uint8ClampedArray): Uint8Array {
  const red = new Uint8Array(rgba.length / 4);
  for (let k = 0; k < red.length; k++) red[k] = rgba[k * 4];
  return red;
}

/** Шаг копий для карты — √2: копия не больше чем в 1,41 раза шире экрана, простого сглаживания достаточно. */
const LEVELS = [1024, 1448, 2048, 2896, 4096];

/** Ширины копий снимка по возрастанию; снимок до 4096 пикселей входит в них сам, больший грузится по требованию. */
export function levelWidths(fullWidth: number): number[] {
  const smaller = LEVELS.filter((w) => w < fullWidth);
  return fullWidth <= LEVELS[LEVELS.length - 1] ? [...smaller, fullWidth] : smaller;
}

/** Наименьшая копия, закрывающая ширину px; если таких нет — самая большая из имеющихся. */
export function pickLevel<T extends { width: number }>(levels: readonly T[], px: number): T {
  return levels.find((l) => l.width >= px) ?? levels[levels.length - 1];
}
