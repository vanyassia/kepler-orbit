import {
  BoxGeometry, type BufferGeometry, CylinderGeometry, Group, LatheGeometry, Matrix4, Mesh,
  MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Размер корпуса с соплами и облучателем вдоль оси тарелки, в единицах модели. */
export const CASSINI_SPAN = 5.2;

const UP = new Vector3(0, 1, 0);
type Point = [number, number, number];

/**
 * Орбитальный аппарат на заключительном этапе миссии после отделения «Гюйгенса».
 * Силуэт и пропорции по GIF и схеме NASA/JPL: https://science.nasa.gov/resource/cassini-diagram-no-1/
 * Тонкие детали утолщены, штанга магнитометра укорочена для показа в масштабе глобуса.
 */
export function createCassiniModel(): Group {
  const model = new Group();
  model.name = 'Кассини';
  model.visible = false;

  const metal = new MeshStandardMaterial({ color: '#aab4c0', roughness: 0.54, metalness: 0.24, emissive: '#10151b' });
  const reflector = new MeshStandardMaterial({ color: '#eeefea', roughness: 0.51, metalness: 0.07, emissive: '#191c20' });
  const dark = new MeshStandardMaterial({ color: '#454c59', roughness: 0.63, metalness: 0.18, emissive: '#090b0e' });
  const foil = new MeshStandardMaterial({ color: '#d8ab48', roughness: 0.41, metalness: 0.34, emissive: '#281904' });
  const bronze = new MeshStandardMaterial({ color: '#8e6546', roughness: 0.6, metalness: 0.27, emissive: '#160e08' });
  const glass = new MeshStandardMaterial({ color: '#253542', roughness: 0.3, metalness: 0.26 });
  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();

  const add = (material: MeshStandardMaterial, geometry: BufferGeometry, at: Point = [0, 0, 0]) => {
    geometry.translate(...at);
    const vertices = geometry.index ? geometry.toNonIndexed() : geometry;
    if (vertices !== geometry) geometry.dispose();
    const batch = batches.get(material);
    if (batch) batch.push(vertices);
    else batches.set(material, [vertices]);
  };
  const box = (mat: MeshStandardMaterial, size: Point, at: Point) => add(mat, new BoxGeometry(...size), at);
  const turn = new Quaternion();
  const transform = new Matrix4();
  const rod = (mat: MeshStandardMaterial, from: Point, to: Point, radius: number) => {
    const start = new Vector3(...from);
    const direction = new Vector3(...to).sub(start);
    const length = direction.length();
    const middle = start.addScaledVector(direction, 0.5);
    turn.setFromUnitVectors(UP, direction.normalize());
    add(mat, new CylinderGeometry(radius, radius, length, 6).applyMatrix4(transform.makeRotationFromQuaternion(turn)), [middle.x, middle.y, middle.z]);
  };

  // Приборный отсек и узкие стыковочные кольца трёх ярусов.
  add(metal, new CylinderGeometry(0.93, 1.04, 3.13, 12), [0, -0.2, 0]);
  for (const [y, radius, height] of [[1.2, 1.08, 0.23], [0, 1.06, 0.12], [-1.63, 1.13, 0.26]]) {
    add(dark, new CylinderGeometry(radius, radius, height, 12), [0, y, 0]);
  }
  add(metal, new CylinderGeometry(0.64, 0.94, 0.38, 12), [0, 1.53, 0]);
  box(metal, [1.38, 0.59, 0.48], [0, 0.96, 1.02]);
  box(dark, [1.19, 0.41, 0.16], [0, 0.96, 1.32]);
  box(metal, [0.58, 1.13, 0.59], [-0.95, 0.19, 0.55]);
  box(foil, [0.48, 0.63, 0.56], [0.96, 0.31, 0.59]);
  box(foil, [0.92, 0.95, 0.26], [-0.19, -0.67, -1.02]);
  box(dark, [0.72, 0.87, 0.45], [0.65, -0.53, 0.9]);
  box(metal, [0.4, 0.55, 0.49], [-0.49, 0.28, -0.95]);
  add(metal, new CylinderGeometry(0.27, 0.31, 0.24, 16).rotateX(Math.PI / 2), [0, 0.95, 1.47]);
  add(glass, new CylinderGeometry(0.18, 0.18, 0.035, 16).rotateX(Math.PI / 2), [0, 0.95, 1.61]);
  add(foil, new SphereGeometry(0.27, 16, 10), [-0.21, -0.52, 1.05]);
  for (const x of [-0.68, 0.65]) {
    rod(metal, [x, -1.39, 0.87], [-x, 0.62, 1.05], 0.034);
  }

  // Четырёхметровая парабола, усиленный обод и центральный облучатель на трёх опорах.
  const profile = [
    [0.1, 1.7], [0.58, 1.73], [1.08, 1.83], [1.56, 1.99], [2, 2.24],
    [2, 2.34], [1.56, 2.09], [1.08, 1.94], [0.58, 1.84], [0.1, 1.81], [0.1, 1.7],
  ];
  add(reflector, new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), 40));
  add(metal, new TorusGeometry(1.98, 0.05, 6, 40).rotateX(Math.PI / 2), [0, 2.3, 0]);
  add(foil, new CylinderGeometry(0.095, 0.16, 0.46, 12), [0, 2.64, 0]);
  for (let i = 0; i < 3; i++) {
    const a = i * (2 * Math.PI / 3);
    rod(reflector, [1.16 * Math.cos(a), 1.97, 1.16 * Math.sin(a)], [0, 2.78, 0], 0.043);
  }

  // Три цилиндрических генератора с рёбрами и два сопла двигателей.
  for (const [x, z] of [[-0.94, 0.71], [0.99, -0.6], [-0.48, -1.03]]) {
    add(bronze, new CylinderGeometry(0.25, 0.25, 0.86, 12), [x, -1.38, z]);
    for (const y of [-1.74, -1.56, -1.38, -1.2, -1.02]) {
      add(dark, new CylinderGeometry(0.28, 0.28, 0.05, 12), [x, y, z]);
    }
  }
  for (const x of [-0.31, 0.31]) {
    add(metal, new CylinderGeometry(0.13, 0.24, 0.43, 16), [x, -2.04, 0]);
    add(dark, new CylinderGeometry(0.19, 0.19, 0.025, 16), [x, -2.26, 0]);
  }

  // Штанга магнитометра из секций фермы и тонкие антенны плазменного прибора.
  const boomSections = [1, 1.7, 2.45, 3.2, 3.95, 4.7];
  for (let i = 1; i < boomSections.length; i++) {
    const from = -boomSections[i - 1];
    const to = -boomSections[i];
    for (const z of [-0.1, 0.1]) {
      rod(metal, [from, 0.16, z], [to, 0.16, z], 0.032);
      rod(metal, [from, 0.16, z], [to, 0.16, -z], 0.022);
    }
  }
  for (const x of [-2.45, -4.7]) box(foil, [0.23, 0.23, 0.25], [x, 0.16, 0]);
  for (const [from, to] of [
    [[0.91, 1.05, 0.58], [3.28, 2.82, 1.53]],
    [[-0.86, 1.05, 0.58], [-3.37, 2.67, 1.52]],
    [[0.1, 0.98, -1.02], [0.51, 1.78, -3.83]],
  ] as [Point, Point][]) {
    rod(metal, from, to, 0.025);
  }

  // По одному мешу на материал: модель рисуется несколькими вызовами даже на телефоне.
  for (const [material, parts] of batches) {
    const geometry = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    if (!geometry) throw new Error('Не удалось собрать геометрию «Кассини»');
    model.add(new Mesh(geometry, material));
  }
  return model;
}

/** Меши и материалы принадлежат этой модели и освобождаются вместе с ней. */
export function disposeCassiniModel(model: Group): void {
  for (const mesh of model.children) {
    if (mesh instanceof Mesh) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}

/** Радиус от точки крепления модели до её дальней вершины, включая антенны. */
export function cassiniModelRadius(model: Group): number {
  let radiusSq = 0;
  for (const mesh of model.children) {
    if (!(mesh instanceof Mesh)) continue;
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      radiusSq = Math.max(radiusSq, p.getX(i) ** 2 + p.getY(i) ** 2 + p.getZ(i) ** 2);
    }
  }
  return Math.sqrt(radiusSq);
}
