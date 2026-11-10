/**
 * Модель МКС для глобуса вместо общей модели аппарата (satelliteModel.ts).
 *
 * Как у настоящей станции в обычной ориентации полёта: модули вытянуты по ходу полёта
 * (впереди американский сегмент с «Гармонией», «Коламбусом» и «Кибо», сзади — «Заря» и «Звезда»
 * со своими синими панелями), над ними поперёк хода — длинная ферма, на её концах по четыре
 * пары золотистых солнечных панелей, у середины фермы — белые радиаторы.
 *
 * Оси те же, что у общей модели: x — по ходу полёта, y — от центра тела (зенит), z — по нормали
 * к плоскости орбиты (вдоль неё — ферма). Размах от края до края фермы — ISS_SPAN единиц.
 */
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';

/** Размах модели вдоль фермы, в единицах модели. */
export const ISS_SPAN = 1.2;

/** Солнечная батарея МКС: два золотистых полотна с ячейками и мачта посередине. */
function arrayTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  for (const [y0, y1] of [
    [0, 28],
    [36, 64],
  ]) {
    const g = ctx.createLinearGradient(0, y0, 256, y1);
    g.addColorStop(0, '#e9b45a');
    g.addColorStop(0.5, '#a8702a');
    g.addColorStop(1, '#d49a45');
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, 256, y1 - y0);
  }
  // Ячейки
  ctx.strokeStyle = 'rgba(70, 40, 8, 0.55)';
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 256 / 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  // Мачта между полотнами
  ctx.fillStyle = '#d9dee6';
  ctx.fillRect(0, 29, 256, 6);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Цилиндр модуля, вытянутый по оси x (по ходу полёта) от x0 до x1. */
function moduleX(x0: number, x1: number, r: number, mat: MeshStandardMaterial): Mesh {
  const m = new Mesh(new CylinderGeometry(r, r, x1 - x0, 16), mat);
  m.rotation.z = Math.PI / 2;
  m.position.x = (x0 + x1) / 2;
  return m;
}

/** Цилиндр модуля, вытянутый по оси z (поперёк хода) от z0 до z1, в точке x. */
function moduleZ(x: number, z0: number, z1: number, r: number, mat: MeshStandardMaterial): Mesh {
  const m = new Mesh(new CylinderGeometry(r, r, Math.abs(z1 - z0), 16), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, 0, (z0 + z1) / 2);
  return m;
}

export function createIssModel(): Group {
  const model = new Group();
  const hull = new MeshStandardMaterial({ color: '#eef1f5', metalness: 0.25, roughness: 0.55 });
  const hullRu = new MeshStandardMaterial({ color: '#d5dae2', metalness: 0.3, roughness: 0.5 });
  const metal = new MeshStandardMaterial({ color: '#aeb8c6', metalness: 0.65, roughness: 0.4 });
  const radiator = new MeshStandardMaterial({ color: '#f7f8fa', metalness: 0.05, roughness: 0.7, emissive: '#1a1c20' });
  const arrayFace = new MeshStandardMaterial({ map: arrayTexture(), metalness: 0.35, roughness: 0.4, emissive: '#2a1804' });
  const arrayEdge = new MeshStandardMaterial({ color: '#6b4612', metalness: 0.3, roughness: 0.6 });
  const ruPanel = new MeshStandardMaterial({ color: '#244f8f', metalness: 0.3, roughness: 0.45, emissive: '#06142a' });

  // Модули по ходу полёта: сзади «Звезда» и «Заря», впереди «Юнити», «Дестини» и «Гармония»
  model.add(moduleX(-0.44, -0.24, 0.042, hullRu)); // Звезда
  model.add(moduleX(-0.24, -0.06, 0.04, hullRu)); // Заря
  model.add(moduleX(-0.06, 0.02, 0.036, hull)); // Юнити
  model.add(moduleX(0.02, 0.2, 0.038, hull)); // Дестини
  model.add(moduleX(0.2, 0.28, 0.034, hull)); // Гармония
  // Поперёк у «Гармонии»: «Коламбус» и более длинный «Кибо»
  model.add(moduleZ(0.24, 0.03, 0.14, 0.032, hull));
  model.add(moduleZ(0.24, -0.03, -0.18, 0.036, hull));
  // Синие панели «Звезды»
  for (const side of [-1, 1]) {
    const p = new Mesh(new BoxGeometry(0.05, 0.004, 0.13), ruPanel);
    p.position.set(-0.4, 0, side * 0.115);
    model.add(p);
  }

  // Ферма поперёк хода, над «Дестини» (со стороны зенита)
  const trussY = 0.07;
  const truss = new Mesh(new BoxGeometry(0.034, 0.034, ISS_SPAN - 0.04), metal);
  truss.position.set(0.06, trussY, 0);
  model.add(truss);
  const pylon = new Mesh(new CylinderGeometry(0.012, 0.012, trussY, 8), metal);
  pylon.position.set(0.06, trussY / 2, 0);
  model.add(pylon);

  // Радиаторы у середины фермы: белые панели назад по ходу
  for (const side of [-1, 1]) {
    for (const k of [0, 1]) {
      const r = new Mesh(new BoxGeometry(0.17, 0.004, 0.05), radiator);
      r.position.set(-0.04, trussY - 0.02, side * (0.14 + k * 0.065));
      model.add(r);
    }
  }

  // Солнечные батареи: по две на каждом конце фермы, каждая — два крыла вперёд и назад от фермы
  const wingLen = 0.34;
  const wingGeo = new BoxGeometry(wingLen, 0.006, 0.085);
  const wingMats = [arrayEdge, arrayEdge, arrayFace, arrayFace, arrayEdge, arrayEdge];
  for (const side of [-1, 1]) {
    for (const z of [0.4, 0.53]) {
      for (const dir of [-1, 1]) {
        const w = new Mesh(wingGeo, wingMats);
        w.position.set(0.06 + dir * (0.03 + wingLen / 2), trussY, side * z);
        model.add(w);
      }
    }
  }
  return model;
}
