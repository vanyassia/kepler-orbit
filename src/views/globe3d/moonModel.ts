/**
 * Луна как спутник Земли на глобусе: шар со снимком поверхности вместо модели аппарата.
 * Освещается тем же светом Солнца, что и модель аппарата, поэтому видна фаза.
 *
 * Оси шара: +x — к Земле (в центре снимка долгота 0, середина видимой стороны), +y — на север
 * по нормали к орбите. Радиус шара — 1 единица; размер задаётся в кадре.
 */
import { Matrix4, Mesh, MeshStandardMaterial, SphereGeometry, SRGBColorSpace, TextureLoader, Vector3 } from 'three';
import { TEXTURES } from '../assets';

/** Радиус Луны на экране, если в настоящем масштабе она меньше, пикселей. */
export const MOON_MIN_RADIUS_PX = 18;

export function createMoonModel(): Mesh {
  const material = new MeshStandardMaterial({ color: '#d8d4cc', roughness: 1, metalness: 0 });
  const mesh = new Mesh(new SphereGeometry(1, 48, 24), material);
  mesh.visible = false;
  return mesh;
}

/** Снимок поверхности грузится, только когда Луну впервые выбрали. */
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

const toEarth = new Vector3();
const north = new Vector3();
const third = new Vector3();
const basis = new Matrix4();

/**
 * Поворот шара: видимая сторона к Земле, север — по нормали к орбите.
 * @param dir направление от центра Земли на Луну (единичный)
 * @param side fwd × dir из расчёта модели аппарата — обратная нормаль к орбите
 */
export function orientMoon(mesh: Mesh, dir: Vector3, side: Vector3) {
  toEarth.copy(dir).negate();
  north.copy(side).negate();
  third.crossVectors(toEarth, north);
  mesh.quaternion.setFromRotationMatrix(basis.makeBasis(toEarth, north, third));
}
