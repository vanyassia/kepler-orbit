/**
 * Модели первых аппаратов для глобуса вместо общей модели (satelliteModel.ts): «Восток» и Спутник-1.
 *
 * Оси те же, что у общей модели и у МКС: x — по ходу полёта, y — от центра тела (зенит),
 * z — по нормали к плоскости орбиты. Размеры — в метрах, делённых на 10, по опубликованным данным.
 */
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';

/** Длина «Востока» вдоль хода полёта (от сопла до концов антенн), в единицах модели. */
export const VOSTOK_SPAN = 0.6;
/** Длина Спутника-1 вдоль хода полёта (от шара до концов антенн), в единицах модели. */
export const SPUTNIK_SPAN = 0.62;

/** Усечённый конус вдоль оси x: радиус r0 в точке x0, радиус r1 в точке x1. */
function coneX(x0: number, r0: number, x1: number, r1: number, mat: MeshStandardMaterial): Mesh {
  // Верх цилиндра three.js (+y) после поворота на −90° вокруг z смотрит в +x
  const m = new Mesh(new CylinderGeometry(r1, r0, x1 - x0, 32), mat);
  m.rotation.z = -Math.PI / 2;
  m.position.x = (x0 + x1) / 2;
  return m;
}

/** Тонкий стержень (антенна) от точки from в направлении dir длиной len. */
function rod(from: Vector3, dir: Vector3, len: number, r: number, mat: MeshStandardMaterial): Mesh {
  const d = dir.clone().normalize();
  const m = new Mesh(new CylinderGeometry(r, r, len, 6), mat);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d));
  m.position.copy(from).addScaledVector(d, len / 2);
  return m;
}

/**
 * «Восток»: впереди шар спускаемого аппарата (диаметр 2,3 м) с иллюминатором и антеннами,
 * за ним приборный отсек из двух конусов (длина 2,25 м, наибольший диаметр 2,43 м),
 * на их стыке кольцо шаровых баллонов со сжатым газом, сзади — сопло тормозного двигателя.
 */
export function createVostokModel(): Group {
  const model = new Group();
  const capsule = new MeshStandardMaterial({ color: '#8d939c', metalness: 0.45, roughness: 0.55 });
  const service = new MeshStandardMaterial({ color: '#d3d9e1', metalness: 0.5, roughness: 0.45 });
  const bottle = new MeshStandardMaterial({ color: '#eef1f5', metalness: 0.55, roughness: 0.35 });
  const nozzle = new MeshStandardMaterial({ color: '#4b525c', metalness: 0.6, roughness: 0.5 });
  const glass = new MeshStandardMaterial({ color: '#1d3554', metalness: 0.2, roughness: 0.15, emissive: '#081424' });
  const antenna = new MeshStandardMaterial({ color: '#e3e8ef', metalness: 0.7, roughness: 0.35 });

  // Спускаемый аппарат
  const sphere = new Mesh(new SphereGeometry(0.115, 40, 24), capsule);
  sphere.position.x = 0.07;
  model.add(sphere);
  // Иллюминатор — со стороны зенита, чуть впереди
  const porthole = new Mesh(new SphereGeometry(0.026, 16, 8), glass);
  porthole.position.set(0.07 + 0.115 * Math.cos(1.0) * 0.6, 0.115 * Math.sin(1.0), 0.04);
  porthole.scale.set(1, 0.35, 1);
  porthole.lookAt(sphere.position);
  model.add(porthole);

  // Приборный отсек: два конуса основаниями друг к другу
  model.add(coneX(-0.13, 0.1215, -0.03, 0.055, service));
  model.add(coneX(-0.25, 0.06, -0.13, 0.1215, service));
  // Кольцо из 16 шаровых баллонов на стыке
  const ball = new SphereGeometry(0.024, 12, 8);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const b = new Mesh(ball, bottle);
    b.position.set(-0.13, Math.cos(a) * 0.128, Math.sin(a) * 0.128);
    model.add(b);
  }
  // Сопло тормозного двигателя
  model.add(coneX(-0.29, 0.045, -0.25, 0.028, nozzle));

  // Штыревые антенны впереди шара
  for (const s of [-1, 1]) model.add(rod(new Vector3(0.16, s * 0.06, 0), new Vector3(1, s * 0.35, 0), 0.14, 0.008, antenna));
  return model;
}

/**
 * Спутник-1: полированный шар диаметром 58 см и четыре штыревые антенны (две по 2,9 м и две по 2,4 м),
 * отведённые назад под углом около 35° к оси.
 */
export function createSputnikModel(): Group {
  const model = new Group();
  // Без карты окружения полностью металлический шар выглядел бы тёмным — металл «наполовину»
  const shell = new MeshStandardMaterial({ color: '#e6eaf0', metalness: 0.6, roughness: 0.22 });
  const antenna = new MeshStandardMaterial({ color: '#e3e8ef', metalness: 0.7, roughness: 0.35 });
  const r = 0.029 * 3; // шар чуть крупнее настоящего, иначе на фоне антенн он теряется
  const center = new Vector3(0.06, 0, 0);
  const ball = new Mesh(new SphereGeometry(r, 40, 24), shell);
  ball.position.copy(center);
  model.add(ball);

  const half = (35 * Math.PI) / 180;
  for (const [sy, sz, len] of [
    [1, 1, 0.5],
    [-1, -1, 0.5],
    [1, -1, 0.42],
    [-1, 1, 0.42],
  ] as const) {
    const out = new Vector3(0, sy, sz).normalize();
    // Основание — на передней половине шара, направление — назад и в сторону
    const base = center.clone().addScaledVector(new Vector3(0.45, 0, 0).add(out.clone().multiplyScalar(0.85)).normalize(), r);
    const dir = new Vector3(-Math.cos(half), 0, 0).addScaledVector(out, Math.sin(half));
    model.add(rod(base, dir, len, 0.009, antenna)); // толще настоящих, иначе на экране их не видно
  }
  return model;
}
