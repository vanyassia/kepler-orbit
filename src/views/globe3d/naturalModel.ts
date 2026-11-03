/**
 * Естественные спутники на глобусе вместо модели аппарата: Луна — шар со снимком поверхности,
 * Фобос и Деймос — неровные вытянутые тела с кратерами. Освещаются тем же светом Солнца,
 * что и модель аппарата, поэтому видна фаза.
 *
 * Все три всегда повёрнуты к планете одной стороной. Оси модели: +x — к центру планеты
 * (у Луны там середина видимой стороны, у Фобоса и Деймоса — длинная ось), +y — на север по нормали
 * к орбите, +z — третья ось (вдоль орбиты). Геометрия единичного радиуса растягивается по полуосям.
 */
import { Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import type { NaturalSatellite } from '../../data/orbiters';
import { TEXTURES } from '../assets';

interface Shape {
  /** Полуоси, км: к планете, к полюсу, вдоль орбиты. */
  radii: [number, number, number];
  /** Радиус на экране, если в настоящем масштабе тело меньше, пикселей. */
  minPx: number;
}

export const NATURAL_SHAPES: Record<NaturalSatellite, Shape> = {
  moon: { radii: [1737.4, 1737.4, 1737.4], minPx: 18 },
  // Фобос 26 × 22,8 × 18,2 км, Деймос 15 × 12,2 × 10,4 км (NASA); Деймос меньше и на экране
  phobos: { radii: [13, 9.1, 11.4], minPx: 13 },
  deimos: { radii: [7.5, 5.2, 6.1], minPx: 10 },
};

/** Кратеры: широта и долгота (от оси на планету к переднему по ходу краю, как западная), угловой радиус (°) и глубина. */
const CRATERS: Record<'phobos' | 'deimos', [number, number, number, number][]> = {
  // Самый крупный — Стикни (1° ю. ш., 49° з. д.): между точкой под Марсом и передним краем
  phobos: [
    [-1, 49, 32, 0.11],
    [-30, -40, 14, 0.05],
    [40, 150, 16, 0.05],
    [-55, 100, 12, 0.04],
    [20, -110, 18, 0.05],
    [-10, 200, 10, 0.04],
    [60, 30, 10, 0.03],
  ],
  deimos: [
    [10, 20, 22, 0.05],
    [-40, 130, 16, 0.04],
    [35, -90, 14, 0.03],
    [-5, 210, 18, 0.04],
  ],
};

/** Неровная поверхность: несколько гармоник и вмятины кратеров, без случайных чисел — форма всегда одна. */
function lumpyGeometry(kind: 'phobos' | 'deimos'): SphereGeometry {
  const geo = new SphereGeometry(1, 64, 40);
  const pos = geo.attributes.position;
  const v = new Vector3();
  const c = new Vector3();
  const craters = CRATERS[kind].map(([lat, lon, size, depth]) => {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180;
    return { dir: new Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)), cos: Math.cos((size * Math.PI) / 180), depth };
  });
  const seed = kind === 'phobos' ? 0 : 1.7;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1 + 0.045 * Math.sin(3 * v.x + 2 * v.y + seed) * Math.cos(2 * v.z - v.x) + 0.025 * Math.sin(7 * v.y + 5 * v.z + seed);
    for (const k of craters) {
      const d = v.dot(c.copy(k.dir));
      if (d > k.cos) {
        // Чаша: глубже к центру, с плавным краем
        const x = (d - k.cos) / (1 - k.cos);
        r -= k.depth * Math.sin(Math.min(1, x * 1.6) * Math.PI * 0.5) ** 2;
      }
    }
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  geo.computeVertexNormals();
  return geo;
}

function createMesh(kind: NaturalSatellite): Mesh {
  const mesh =
    kind === 'moon'
      ? new Mesh(new SphereGeometry(1, 48, 24), new MeshStandardMaterial({ color: '#d8d4cc', roughness: 1, metalness: 0 }))
      : // Тёмный реголит: у Фобоса альбедо около 0,07, Деймос чуть светлее
        new Mesh(lumpyGeometry(kind), new MeshStandardMaterial({ color: kind === 'phobos' ? '#8a7f74' : '#9a8f83', roughness: 1, metalness: 0 }));
  mesh.visible = false;
  return mesh;
}

export function createNaturalModels(): Record<NaturalSatellite, Mesh> {
  return { moon: createMesh('moon'), phobos: createMesh('phobos'), deimos: createMesh('deimos') };
}

/** Снимок поверхности Луны грузится, только когда её впервые выбрали. */
export function loadMoonSurface(mesh: Mesh, onLoad: () => void) {
  const material = mesh.material as MeshStandardMaterial;
  if (material.map || mesh.userData.loading) return;
  mesh.userData.loading = true;
  new TextureLoader().load(
    TEXTURES.moon2k,
    (tex) => {
      tex.colorSpace = SRGBColorSpace;
      material.map = tex;
      material.color.set('#ffffff');
      material.needsUpdate = true;
      onLoad();
    },
    undefined,
    () => {
      mesh.userData.loading = false;
      console.warn('Снимок Луны не загрузился, шар остаётся однотонным');
    },
  );
}

const toPlanet = new Vector3();
const north = new Vector3();
const third = new Vector3();
const basis = new Matrix4();

/**
 * Поворот и размер: одна сторона к планете, север — по нормали к орбите; настоящий размер,
 * но на экране не меньше minPx.
 * @param dir направление от центра планеты на спутник (единичный)
 * @param side fwd × dir из расчёта модели аппарата — обратная нормаль к орбите
 * @param kmToScene единиц сцены в километре (1 / радиус планеты)
 * @param ppu пикселей экрана на единицу сцены у спутника
 */
export function placeNatural(mesh: Mesh, kind: NaturalSatellite, dir: Vector3, side: Vector3, kmToScene: number, ppu: number) {
  toPlanet.copy(dir).negate();
  north.copy(side).negate();
  third.crossVectors(toPlanet, north);
  mesh.quaternion.setFromRotationMatrix(basis.makeBasis(toPlanet, north, third));
  const { radii, minPx } = NATURAL_SHAPES[kind];
  const k = Math.max(kmToScene, minPx / (ppu * Math.max(...radii)));
  mesh.scale.set(radii[0] * k, radii[1] * k, radii[2] * k);
}
