/**
 * Подписи на 3D-сцене: обычные DOM-элементы в одном контейнере поверх холста.
 * Каждый кадр мировая точка проецируется на экран; подписи, закрытые телом, гаснут.
 *
 * Раскладка без наложений, как на 2D-карте: подписи ставятся по приоритету
 * (спутник — первым), каждая пробует свои позиции относительно точки привязки
 * и занимает первую, не задевающую уже поставленные. Не поместилась — скрывается.
 */
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { occludedByEarth } from './coords';

/**
 * Позиция подписи относительно точки привязки: [fx, fy, px, py] →
 * сдвиг левого верхнего угла = (fx·ширина + px, fy·высота + py), px.
 */
export type LabelOffset = readonly [number, number, number, number];

export const OFFSET = {
  right: [0, -0.5, 10, 0],
  left: [-1, -0.5, -10, 0],
  center: [-0.5, -0.5, 0, 0],
  above: [-0.5, -1.5, 0, -2],
  below: [-0.5, 0.5, 0, 2],
} as const satisfies Record<string, LabelOffset>;

export interface LabelSpec {
  id: string;
  text: string;
  className: string;
  /** Записывает мировые координаты точки привязки в out; null — подпись сейчас не показывать. */
  anchor: (out: Vector3) => Vector3 | null;
  /** Меньше — важнее: ставится раньше и рисуется поверх. */
  priority: number;
  /** Допустимые позиции в порядке предпочтения; по умолчанию — справа, затем слева. */
  offsets?: readonly LabelOffset[];
  /** Показывать даже при наложении (подпись спутника). */
  always?: boolean;
  /**
   * Для подписей на поверхности: минимальный косинус угла между нормалью и направлением
   * на камеру. У края диска надписи сильно наклонены и слипаются — их лучше скрыть.
   */
  minFacing?: number;
}

const DEFAULT_OFFSETS: readonly LabelOffset[] = [OFFSET.right, OFFSET.left];
/** Зазор между подписями, px */
const GAP = 3;

interface Item {
  spec: LabelSpec;
  el: HTMLDivElement;
  w: number;
  h: number;
  dirty: boolean;
  /** Индекс позиции в прошлом кадре: пробуется первой, чтобы подписи не прыгали. */
  last: number;
}

export class LabelLayer {
  private items = new Map<string, Item>();
  private order: Item[] = [];
  private readonly p = new Vector3();
  private readonly ndc = new Vector3();
  private readonly toCam = new Vector3();
  private readonly placed: number[] = [];

  constructor(private readonly container: HTMLDivElement) {
    // После загрузки шрифтов ширина подписей меняется — перемерить
    document.fonts?.ready.then(() => this.items.forEach((it) => (it.dirty = true)));
  }

  /** Синхронизация набора подписей (вызывается при изменении состава). */
  setSpecs(specs: LabelSpec[]): void {
    const ids = new Set(specs.map((s) => s.id));
    for (const [id, it] of this.items) {
      if (!ids.has(id)) {
        it.el.remove();
        this.items.delete(id);
      }
    }
    for (const s of specs) {
      let it = this.items.get(s.id);
      if (!it) {
        const el = document.createElement('div');
        this.container.appendChild(el);
        it = { spec: s, el, w: 0, h: 0, dirty: true, last: 0 };
        this.items.set(s.id, it);
      }
      it.spec = s;
      if (it.el.className !== s.className) {
        it.el.className = s.className;
        it.dirty = true;
      }
      if (it.el.textContent !== s.text) {
        it.el.textContent = s.text;
        it.dirty = true;
      }
      it.el.style.zIndex = String(Math.max(0, 10 - s.priority));
    }
    // sort стабилен: внутри одного приоритета сохраняется порядок specs (регионы — от крупных)
    this.order = [...this.items.values()].sort((a, b) => a.spec.priority - b.spec.priority);
  }

  setText(id: string, text: string): void {
    const it = this.items.get(id);
    if (it && it.el.textContent !== text) {
      it.el.textContent = text;
      it.dirty = true;
    }
  }

  update(camera: Camera, width: number, height: number): void {
    // Сначала все чтения размеров (одна перекомпоновка), потом только запись стилей
    for (const it of this.order) {
      if (it.dirty) {
        it.w = it.el.offsetWidth;
        it.h = it.el.offsetHeight;
        it.dirty = false;
      }
    }

    const placed = this.placed;
    placed.length = 0;
    for (const it of this.order) {
      const s = it.spec;
      const el = it.el;
      if (!s.anchor(this.p)) {
        el.dataset.hidden = 'true';
        continue;
      }
      this.ndc.copy(this.p).project(camera);
      const behind = this.ndc.z > 1 || this.ndc.z < -1;
      let hidden = behind || occludedByEarth(this.p, camera.position, 0.996);
      if (!hidden && s.minFacing !== undefined) {
        const facing = this.toCam.subVectors(camera.position, this.p).normalize().dot(this.p) / this.p.length();
        hidden = facing < s.minFacing;
      }
      if (hidden) {
        el.dataset.hidden = 'true';
        continue;
      }

      const x = ((this.ndc.x + 1) / 2) * width;
      const y = ((1 - this.ndc.y) / 2) * height;
      const offsets = s.offsets ?? DEFAULT_OFFSETS;
      let chosen = -1;
      for (let k = 0; k < offsets.length; k++) {
        const i = (it.last + k) % offsets.length;
        const [fx, fy, px, py] = offsets[i];
        const l = x + fx * it.w + px;
        const t = y + fy * it.h + py;
        if (l < 0 || t < 0 || l + it.w > width || t + it.h > height) continue;
        if (!this.overlaps(l, t, it.w, it.h)) {
          chosen = i;
          break;
        }
      }
      if (chosen < 0 && s.always) chosen = it.last < offsets.length ? it.last : 0;
      if (chosen < 0) {
        el.dataset.hidden = 'true';
        continue;
      }

      it.last = chosen;
      const [fx, fy, px, py] = offsets[chosen];
      const l = x + fx * it.w + px;
      const t = y + fy * it.h + py;
      placed.push(l - GAP, t - GAP, l + it.w + GAP, t + it.h + GAP);
      el.dataset.hidden = 'false';
      el.style.transform = `translate3d(${l.toFixed(1)}px, ${t.toFixed(1)}px, 0)`;
    }
  }

  private overlaps(l: number, t: number, w: number, h: number): boolean {
    const p = this.placed;
    for (let i = 0; i < p.length; i += 4) {
      if (l < p[i + 2] && l + w > p[i] && t < p[i + 3] && t + h > p[i + 1]) return true;
    }
    return false;
  }

  dispose(): void {
    for (const it of this.items.values()) it.el.remove();
    this.items.clear();
    this.order = [];
  }
}
