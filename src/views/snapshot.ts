/**
 * Картинка вида (PNG): карта или глобус ровно как на экране, с подписью спутника и времени.
 *
 * Виды регистрируют здесь функцию, которая отдаёт готовый холст. Глобус рисует кадры по требованию,
 * и после показа содержимое холста WebGL браузер уже может стереть, поэтому его функция сначала
 * перерисовывает кадр и сразу же (в той же задаче) копирует его. Подписи глобуса — обычные
 * DOM-элементы поверх холста, их приходится дорисовать на копии по их положению и стилю.
 */
export type SnapshotKind = 'map' | 'globe';

interface Source {
  /** Готовый холст текущего кадра (копировать сразу, в той же задаче). */
  canvas: () => HTMLCanvasElement | null;
  /** Слой подписей поверх холста, если подписи — DOM-элементы. */
  labels?: () => HTMLElement | null;
  /** Фон под прозрачными участками холста. */
  background?: string;
}

const sources = new Map<SnapshotKind, Source>();

export function registerSnapshot(kind: SnapshotKind, source: Source): () => void {
  sources.set(kind, source);
  return () => {
    if (sources.get(kind) === source) sources.delete(kind);
  };
}

export const canSnapshot = (kind: SnapshotKind) => sources.has(kind);

export interface SnapshotCaption {
  /** Верхняя строка: спутник и время. */
  title: string;
  /** Нижняя строка справа: источники снимков поверхности. */
  credit: string;
}

/** Копия вида с подписями; null — вид ещё не открыт или холст пустой. */
export function captureView(kind: SnapshotKind, caption: SnapshotCaption): HTMLCanvasElement | null {
  const src = sources.get(kind);
  const from = src?.canvas();
  if (!src || !from || from.width === 0 || from.height === 0) return null;
  const out = document.createElement('canvas');
  out.width = from.width;
  out.height = from.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = src.background ?? '#04060a';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(from, 0, 0);
  const scale = from.width / Math.max(1, from.getBoundingClientRect().width);
  const labels = src.labels?.();
  if (labels) drawDomLabels(ctx, labels, scale);
  drawCaption(ctx, caption, scale);
  return out;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Подписи из DOM: плашка, рамка, текст и тень — по вычисленному стилю каждого элемента. */
function drawDomLabels(ctx: CanvasRenderingContext2D, container: HTMLElement, scale: number) {
  const box = container.getBoundingClientRect();
  const items = [...container.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.hidden !== 'true' && !!el.textContent);
  // Порядок наложения — как на экране (z-index)
  items.sort((a, b) => (Number(a.style.zIndex) || 0) - (Number(b.style.zIndex) || 0));
  for (const el of items) {
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) === 0 || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    const x = (r.left - box.left) * scale;
    const y = (r.top - box.top) * scale;
    const w = r.width * scale;
    const h = r.height * scale;
    if (x + w < 0 || y + h < 0 || x > ctx.canvas.width || y > ctx.canvas.height) continue;
    ctx.save();
    ctx.globalAlpha = Number(cs.opacity) || 1;
    const radius = (parseFloat(cs.borderTopLeftRadius) || 0) * scale;
    const plate = () => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius);
      else ctx.rect(x, y, w, h);
    };
    if (!isTransparent(cs.backgroundColor)) {
      ctx.fillStyle = 'rgb(8 17 32 / 0.8)';
      ctx.fillStyle = cs.backgroundColor;
      plate();
      ctx.fill();
    }
    const border = parseFloat(cs.borderTopWidth) || 0;
    if (border > 0 && cs.borderTopStyle !== 'none') {
      ctx.strokeStyle = cs.borderTopColor;
      ctx.lineWidth = border * scale;
      plate();
      ctx.stroke();
    }
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize) * scale}px ${cs.fontFamily}`;
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'middle';
    if (cs.textShadow && cs.textShadow !== 'none') {
      ctx.shadowColor = '#04080f';
      ctx.shadowBlur = 4 * scale;
    }
    const left = x + ((parseFloat(cs.paddingLeft) || 0) + border) * scale;
    ctx.fillText(el.textContent ?? '', left, y + h / 2);
    ctx.restore();
  }
}

const isTransparent = (c: string) => c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c) || /\/\s*0\)$/.test(c);

/** Подпись снимка: спутник и время слева сверху, источники снимков справа снизу. */
function drawCaption(ctx: CanvasRenderingContext2D, caption: SnapshotCaption, scale: number) {
  const { width, height } = ctx.canvas;
  const pad = 10 * scale;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${13 * scale}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
  const tw = ctx.measureText(caption.title).width;
  const th = 26 * scale;
  ctx.fillStyle = 'rgb(4 6 10 / 0.72)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(pad, pad, tw + 2 * pad, th, 6 * scale);
  else ctx.rect(pad, pad, tw + 2 * pad, th);
  ctx.fill();
  ctx.fillStyle = '#e6eef8';
  ctx.fillText(caption.title, 2 * pad, pad + th / 2);

  // На узкой картинке (телефон) строка источников уменьшается, чтобы влезть целиком
  const creditFont = (px: number) => `400 ${px}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
  ctx.font = creditFont(11 * scale);
  const fit = Math.min(1, (width - 2 * pad) / Math.max(1, ctx.measureText(caption.credit).width));
  if (fit < 1) ctx.font = creditFont(11 * scale * fit);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgb(230 238 248 / 0.75)';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3 * scale;
  ctx.fillText(caption.credit, width - pad, height - pad - 6 * scale);
  ctx.restore();
}
