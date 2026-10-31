import { describe, expect, it } from 'vitest';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { InterleavedBufferAttribute } from 'three';
import { DynamicLine } from '../globe3d/DynamicLine';

const pts = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1]);
const make = (rgb = false) => {
  const l = new DynamicLine(16, new LineMaterial());
  l.setPoints(pts, 4, rgb ? new Float32Array(12).fill(0.5) : undefined);
  return l;
};
const attr = (l: DynamicLine, name: string) => l.geometry.getAttribute(name) as InterleavedBufferAttribute;
const distances = (l: DynamicLine) => {
  const d = attr(l, 'instanceDistanceStart').data;
  return Array.from(d.array.slice(0, 6));
};

describe('Линия с обновлением на месте', () => {
  it('число отрезков и накопленные расстояния', () => {
    const l = make();
    expect(l.geometry.instanceCount).toBe(3);
    expect(distances(l)).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it('в видеокарту уходит только занятая часть буфера', () => {
    const l = make(true);
    const seg = attr(l, 'instanceStart').data;
    expect(seg.updateRanges).toEqual([{ start: 0, count: 18 }]);
    expect(attr(l, 'instanceDistanceStart').data.updateRanges).toEqual([{ start: 0, count: 6 }]);
    expect(attr(l, 'instanceColorStart').data.updateRanges).toEqual([{ start: 0, count: 18 }]);
  });

  it('сдвиг начала линии: штрихи остаются привязаны к началу, дальние точки не меняются', () => {
    const l = make();
    l.moveFirst(0.5, 0, 0);
    const seg = attr(l, 'instanceStart').data.array;
    expect(Array.from(seg.slice(0, 6))).toEqual([0.5, 0, 0, 1, 0, 0]);
    expect(distances(l)).toEqual([0, 0.5, 0.5, 1.5, 1.5, 2.5]);
  });

  it('сдвиг конца линии меняет один отрезок', () => {
    const l = make();
    l.moveLast(1, 1, 0.5);
    const seg = attr(l, 'instanceStart').data.array;
    expect(Array.from(seg.slice(12, 18))).toEqual([1, 1, 0, 1, 1, 0.5]);
    expect(distances(l)).toEqual([0, 1, 1, 2, 2, 2.5]);
  });

  it('точек больше ёмкости — линия обрезается, а не портит память', () => {
    const l = new DynamicLine(3, new LineMaterial());
    l.setPoints(pts, 4);
    expect(l.geometry.instanceCount).toBe(2);
  });

  it('сдвиг концов пустой линии ничего не делает', () => {
    const l = new DynamicLine(3, new LineMaterial());
    expect(() => {
      l.moveFirst(1, 1, 1);
      l.moveLast(1, 1, 1);
    }).not.toThrow();
    expect(l.geometry.instanceCount).toBe(0);
  });
});
