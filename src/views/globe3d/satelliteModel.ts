/**
 * Модель аппарата для глобуса — та же, что значок на карте: корпус в золотистой теплоизоляции,
 * две синие солнечные панели с ячейками на штангах и антенна-тарелка, обращённая к телу.
 *
 * Оси модели: x — по ходу полёта, y — от центра тела (зенит), z — по нормали к плоскости орбиты
 * (вдоль неё вытянуты панели). Размах панелей — SATELLITE_SPAN единиц; на экране модель
 * держит постоянный размер, масштаб задаётся в кадре.
 */
import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
} from 'three';

/** Размах модели от края до края панелей, в единицах модели. */
export const SATELLITE_SPAN = 1.2;

/** Ячейки солнечной панели: синие квадраты в светлой сетке. */
function panelTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 128, 64);
  g.addColorStop(0, '#2c6fbe');
  g.addColorStop(0.5, '#163b72');
  g.addColorStop(1, '#25609f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = 'rgba(160, 210, 255, 0.55)';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 128; x += 128 / 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(128, 32);
  ctx.stroke();
  ctx.strokeStyle = '#c9d4e2';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 128, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function createSatelliteModel(): Group {
  const model = new Group();
  const foil = new MeshStandardMaterial({ color: '#e8a93d', metalness: 0.7, roughness: 0.35, emissive: '#3a2406' });
  const metal = new MeshStandardMaterial({ color: '#c9d4e2', metalness: 0.6, roughness: 0.4 });
  const dish = new MeshStandardMaterial({ color: '#f3f6fa', metalness: 0.1, roughness: 0.5 });
  const panelFace = new MeshStandardMaterial({ map: panelTexture(), metalness: 0.3, roughness: 0.45, emissive: '#06142a' });
  const panelEdge = new MeshStandardMaterial({ color: '#1c3f6e', metalness: 0.3, roughness: 0.6 });

  // Корпус
  model.add(new Mesh(new BoxGeometry(0.34, 0.22, 0.22), foil));

  // Штанги и панели (верх и низ панели — ячейки, торцы — тёмные)
  const panelGeo = new BoxGeometry(0.3, 0.012, 0.42);
  const panelMats = [panelEdge, panelEdge, panelFace, panelFace, panelEdge, panelEdge];
  for (const side of [-1, 1]) {
    const strut = new Mesh(new CylinderGeometry(0.012, 0.012, 0.08, 8), metal);
    strut.rotation.x = Math.PI / 2;
    strut.position.z = side * 0.15;
    model.add(strut);
    const panel = new Mesh(panelGeo, panelMats);
    panel.position.z = side * (0.19 + 0.21);
    model.add(panel);
  }

  // Антенна: штырь и тарелка, обращённая к телу (вниз по −y)
  const mast = new Mesh(new CylinderGeometry(0.01, 0.01, 0.08, 8), metal);
  mast.position.y = -0.15;
  model.add(mast);
  const reflector = new Mesh(new ConeGeometry(0.1, 0.05, 20, 1, true), dish);
  reflector.position.y = -0.2;
  model.add(reflector);
  return model;
}
