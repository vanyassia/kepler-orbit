/**
 * «Толстая» линия (Line2) с заранее выделенным буфером: точки обновляются на месте
 * без создания новых массивов и GPU-буферов. В видеокарту уходит только изменившаяся часть:
 * при полной пересборке — занятые точки, при сдвиге конца линии — один отрезок.
 */
import { DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBufferAttribute, Sphere, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/** Отправить в видеокарту count элементов массива начиная со start. */
function upload(buffer: InstancedInterleavedBuffer, start: number, count: number) {
  buffer.addUpdateRange(start, count);
  buffer.needsUpdate = true;
}

export class DynamicLine extends Line2 {
  readonly capacity: number;
  private readonly seg: InstancedInterleavedBuffer;
  private readonly dist: InstancedInterleavedBuffer;
  private col: InstancedInterleavedBuffer | null = null;
  /** Число отрезков в линии. */
  private n = 0;

  /** @param capacity наибольшее число точек ломаной */
  constructor(capacity: number, material: LineMaterial) {
    const geometry = new LineGeometry();
    super(geometry, material);
    this.capacity = capacity;
    this.seg = new InstancedInterleavedBuffer(new Float32Array(capacity * 6), 6, 1).setUsage(DynamicDrawUsage);
    this.dist = new InstancedInterleavedBuffer(new Float32Array(capacity * 2), 2, 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('instanceStart', new InterleavedBufferAttribute(this.seg, 3, 0));
    geometry.setAttribute('instanceEnd', new InterleavedBufferAttribute(this.seg, 3, 3));
    geometry.setAttribute('instanceDistanceStart', new InterleavedBufferAttribute(this.dist, 1, 0));
    geometry.setAttribute('instanceDistanceEnd', new InterleavedBufferAttribute(this.dist, 1, 1));
    geometry.instanceCount = 0;
    geometry.boundingSphere = new Sphere(new Vector3(), 1e4);
    this.frustumCulled = false;
  }

  /**
   * @param xyz плоский массив координат точек [x0, y0, z0, x1, …]
   * @param count число точек
   * @param rgb цвета точек [r0, g0, b0, …] в линейном пространстве (необязательно);
   *            при первом вызове с цветами материал переключается на цвета вершин
   */
  setPoints(xyz: ArrayLike<number>, count: number, rgb?: ArrayLike<number>): void {
    const n = Math.max(0, Math.min(count, this.capacity) - 1);
    const s = this.seg.array as Float32Array;
    const d = this.dist.array as Float32Array;
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const a = i * 3;
      const b = a + 3;
      const o = i * 6;
      s[o] = xyz[a];
      s[o + 1] = xyz[a + 1];
      s[o + 2] = xyz[a + 2];
      s[o + 3] = xyz[b];
      s[o + 4] = xyz[b + 1];
      s[o + 5] = xyz[b + 2];
      d[i * 2] = acc;
      acc += Math.hypot(xyz[b] - xyz[a], xyz[b + 1] - xyz[a + 1], xyz[b + 2] - xyz[a + 2]);
      d[i * 2 + 1] = acc;
    }
    if (rgb) {
      if (!this.col) {
        this.col = new InstancedInterleavedBuffer(new Float32Array(this.capacity * 6), 6, 1).setUsage(DynamicDrawUsage);
        this.geometry.setAttribute('instanceColorStart', new InterleavedBufferAttribute(this.col, 3, 0));
        this.geometry.setAttribute('instanceColorEnd', new InterleavedBufferAttribute(this.col, 3, 3));
        const m = this.material as LineMaterial;
        m.vertexColors = true;
        m.color.set(0xffffff);
        m.needsUpdate = true;
      }
      const c = this.col.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const a = i * 3;
        const o = i * 6;
        c[o] = rgb[a];
        c[o + 1] = rgb[a + 1];
        c[o + 2] = rgb[a + 2];
        c[o + 3] = rgb[a + 3];
        c[o + 4] = rgb[a + 4];
        c[o + 5] = rgb[a + 5];
      }
      upload(this.col, 0, n * 6);
    }
    upload(this.seg, 0, n * 6);
    upload(this.dist, 0, n * 2);
    this.n = n;
    (this.geometry as LineGeometry).instanceCount = n;
  }

  /** Сдвиг начала линии. Штрихи отсчитываются от него, поэтому смещаются и расстояния дальше по линии. */
  moveFirst(x: number, y: number, z: number): void {
    if (this.n === 0) return;
    const s = this.seg.array as Float32Array;
    const d = this.dist.array as Float32Array;
    s[0] = x;
    s[1] = y;
    s[2] = z;
    const delta = Math.hypot(s[3] - x, s[4] - y, s[5] - z) - d[1];
    d[1] += delta;
    for (let i = 2; i < this.n * 2; i++) d[i] += delta;
    upload(this.seg, 0, 3);
    upload(this.dist, 1, this.n * 2 - 1);
  }

  /** Сдвиг конца линии. */
  moveLast(x: number, y: number, z: number): void {
    if (this.n === 0) return;
    const s = this.seg.array as Float32Array;
    const d = this.dist.array as Float32Array;
    const o = (this.n - 1) * 6;
    s[o + 3] = x;
    s[o + 4] = y;
    s[o + 5] = z;
    const e = this.n * 2 - 1;
    d[e] = d[e - 1] + Math.hypot(x - s[o], y - s[o + 1], z - s[o + 2]);
    upload(this.seg, o + 3, 3);
    upload(this.dist, e, 1);
  }
}
