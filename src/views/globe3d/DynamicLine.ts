/**
 * «Толстая» линия (Line2) с заранее выделенным буфером: точки обновляются на месте
 * каждый кадр без создания новых массивов и GPU-буферов.
 */
import { DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBufferAttribute, Sphere, Vector3 } from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

export class DynamicLine extends Line2 {
  readonly capacity: number;
  private readonly seg: InstancedInterleavedBuffer;
  private readonly dist: InstancedInterleavedBuffer;

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
   */
  setPoints(xyz: ArrayLike<number>, count: number): void {
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
    this.seg.needsUpdate = true;
    this.dist.needsUpdate = true;
    (this.geometry as LineGeometry).instanceCount = n;
  }
}
