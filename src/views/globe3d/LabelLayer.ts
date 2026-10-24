/**
 * Подписи на 3D-сцене: обычные DOM-элементы в одном контейнере поверх холста.
 * Каждый кадр мировая точка проецируется на экран; подписи, закрытые Землёй, гаснут.
 */
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { occludedByEarth } from './coords';

export interface LabelSpec {
  id: string;
  text: string;
  className: string;
  /** Записывает мировые координаты точки привязки в out; null — подпись сейчас не показывать. */
  anchor: (out: Vector3) => Vector3 | null;
}

export class LabelLayer {
  private els = new Map<string, HTMLDivElement>();
  private specs: LabelSpec[] = [];
  private readonly p = new Vector3();
  private readonly ndc = new Vector3();

  constructor(private readonly container: HTMLDivElement) {}

  /** Синхронизация набора подписей (вызывается при изменении состава). */
  setSpecs(specs: LabelSpec[]): void {
    this.specs = specs;
    const ids = new Set(specs.map((s) => s.id));
    for (const [id, el] of this.els) {
      if (!ids.has(id)) {
        el.remove();
        this.els.delete(id);
      }
    }
    for (const s of specs) {
      let el = this.els.get(s.id);
      if (!el) {
        el = document.createElement('div');
        this.container.appendChild(el);
        this.els.set(s.id, el);
      }
      el.className = s.className;
      if (el.textContent !== s.text) el.textContent = s.text;
    }
  }

  setText(id: string, text: string): void {
    const el = this.els.get(id);
    if (el && el.textContent !== text) el.textContent = text;
  }

  update(camera: Camera, width: number, height: number): void {
    for (const s of this.specs) {
      const el = this.els.get(s.id);
      if (!el) continue;
      if (!s.anchor(this.p)) {
        el.dataset.hidden = 'true';
        continue;
      }
      this.ndc.copy(this.p).project(camera);
      const behind = this.ndc.z > 1 || this.ndc.z < -1;
      const hidden = behind || occludedByEarth(this.p, camera.position, 0.996);
      el.dataset.hidden = String(hidden);
      if (!behind) {
        const x = ((this.ndc.x + 1) / 2) * width;
        const y = ((1 - this.ndc.y) / 2) * height;
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    }
  }

  dispose(): void {
    for (const el of this.els.values()) el.remove();
    this.els.clear();
  }
}
