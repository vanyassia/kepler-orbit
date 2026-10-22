/**
 * Отрисовка 2D-карты на Canvas. Порядок слоёв (снизу вверх):
 * снимок (или схема) → ночь и огни городов → сетка → границы → терминатор →
 * зона видимости → трасса → подсолнечная точка → города → спутник.
 */
import { geoCircle } from 'd3-geo';
import type { City } from '../../data/cities';
import { RAD } from '../../physics/constants';
import type { TrackPoint } from '../../physics/groundTrack';
import { splitAtAntimeridian } from '../../physics/groundTrack';
import type { Layers } from '../../state/store';
import type { BorderPaths } from './geo';
import { tracePath, WORLD_H, WORLD_W } from './geo';
import type { NightMasks } from './nightMask';
import type { TrackWindow } from '../trackCache';

export const COLORS = {
  bg: '#081120',
  ocean: '#0b1d33',
  land: '#16304d',
  orbit: '#46d6ff',
  sat: '#ffb547',
  ruCity: '#ff5d5d',
  sun: '#ffd27a',
  text: '#e6eef8',
  textDim: '#9fb2ca',
  halo: 'rgba(5, 12, 24, 0.85)',
};

/** Преобразование мировых координат в экранные (CSS-пиксели). */
export interface View {
  /** Масштаб: CSS-пикселей на градус. */
  s: number;
  /** Сдвиг начала мировых координат, CSS-пиксели. */
  ox: number;
  oy: number;
  /** Размер холста, CSS-пиксели. */
  w: number;
  h: number;
  dpr: number;
  /** Масштаб d3-zoom (1 — вся карта). */
  k: number;
}

export const toScreen = (v: View, lon: number, lat: number): [number, number] => [v.ox + v.s * (lon + 180), v.oy + v.s * (90 - lat)];
export const toWorldLonLat = (v: View, sx: number, sy: number): [number, number] => [(sx - v.ox) / v.s - 180, 90 - (sy - v.oy) / v.s];

function setWorld(ctx: CanvasRenderingContext2D, v: View) {
  ctx.setTransform(v.dpr * v.s, 0, 0, v.dpr * v.s, v.dpr * v.ox, v.dpr * v.oy);
}
function setScreen(ctx: CanvasRenderingContext2D, v: View) {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
}

export interface MapScene {
  view: View;
  layers: Layers;
  day: HTMLImageElement | null;
  night: HTMLImageElement | null;
  borders: BorderPaths | null;
  masks: NightMasks;
  /** Слой огней городов, заранее совмещённый с маской (размер холста). */
  lightsLayer: HTMLCanvasElement | null;
  /** Подсолнечная точка, градусы. */
  subsolar: { lat: number; lon: number };
  track: TrackWindow | null;
  /** Центральный угол зоны радиовидимости, рад. */
  visibilityBeta: number;
  satLabel: string;
  cities: City[];
  hoverCity: City | null;
}

export function renderMap(ctx: CanvasRenderingContext2D, sc: MapScene): void {
  const { view: v, layers } = sc;
  setScreen(ctx, v);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, v.w, v.h);

  // Обрезаем всё по прямоугольнику карты
  ctx.save();
  setWorld(ctx, v);
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, WORLD_H);
  ctx.clip();

  // 1. Подложка: спутниковый снимок или схема
  ctx.imageSmoothingQuality = 'high';
  if (layers.imagery && sc.day) {
    ctx.drawImage(sc.day, 0, 0, WORLD_W, WORLD_H);
  } else {
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    if (sc.borders) {
      ctx.fillStyle = COLORS.land;
      ctx.fill(sc.borders.land);
    }
  }

  // 2. Ночная сторона
  if (layers.night) {
    ctx.drawImage(sc.masks.dark, 0, 0, WORLD_W, WORLD_H);
    if (sc.lightsLayer && layers.imagery) {
      setScreen(ctx, v);
      ctx.globalCompositeOperation = 'lighter';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sc.lightsLayer, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      setWorld(ctx, v);
    }
  }

  const px = 1 / v.s; // один CSS-пиксель в мировых единицах

  // 3. Сетка 15°
  if (layers.grid) {
    ctx.beginPath();
    for (let lon = 15; lon < 360; lon += 15) {
      ctx.moveTo(lon, 0);
      ctx.lineTo(lon, WORLD_H);
    }
    for (let lat = 15; lat < 180; lat += 15) {
      ctx.moveTo(0, lat);
      ctx.lineTo(WORLD_W, lat);
    }
    ctx.strokeStyle = 'rgba(200, 225, 255, 0.11)';
    ctx.lineWidth = px;
    ctx.stroke();
    // Экватор и нулевой меридиан
    ctx.beginPath();
    ctx.moveTo(0, 90);
    ctx.lineTo(WORLD_W, 90);
    ctx.moveTo(180, 0);
    ctx.lineTo(180, WORLD_H);
    ctx.strokeStyle = 'rgba(200, 225, 255, 0.22)';
    ctx.stroke();
  }

  // 4. Границы государств и береговая линия
  if (layers.borders && sc.borders) {
    ctx.lineJoin = 'round';
    ctx.strokeStyle = layers.imagery ? 'rgba(235, 242, 255, 0.38)' : 'rgba(150, 190, 235, 0.45)';
    ctx.lineWidth = 0.7 * px;
    ctx.stroke(sc.borders.borders);
    if (!layers.imagery) {
      ctx.strokeStyle = 'rgba(150, 190, 235, 0.6)';
      ctx.stroke(sc.borders.coast);
    }
  }

  // 5. Линия терминатора (h☉ = 0)
  if (layers.night) {
    ctx.beginPath();
    tracePath(ctx, geoCircle().center([sc.subsolar.lon + 180, -sc.subsolar.lat]).radius(90)());
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.strokeStyle = 'rgba(255, 210, 122, 0.55)';
    ctx.lineWidth = px;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 6. Зона радиовидимости
  if (layers.visibility && sc.track) {
    const c = sc.track.current;
    ctx.beginPath();
    tracePath(ctx, geoCircle().center([c.lon, c.lat]).radius(sc.visibilityBeta * RAD).precision(1)());
    ctx.fillStyle = 'rgba(255, 181, 71, 0.09)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 181, 71, 0.75)';
    ctx.lineWidth = 1.2 * px;
    ctx.setLineDash([5 * px, 3 * px]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 7. Трасса: прошлое — сплошной линией, будущее — пунктиром
  if (sc.track) {
    drawTrack(ctx, sc.track.past, px, false);
    drawTrack(ctx, sc.track.future, px, true);
  }
  ctx.restore();

  // Далее — в экранных координатах (чёткие значки и подписи)
  setScreen(ctx, v);
  if (layers.grid) drawGridLabels(ctx, v);
  drawSun(ctx, v, sc.subsolar);
  if (layers.cities) drawCities(ctx, v, sc.cities, sc.hoverCity);
  if (sc.track) drawSatellite(ctx, v, sc.track.current, sc.satLabel);
}

function drawTrack(ctx: CanvasRenderingContext2D, pts: TrackPoint[], px: number, future: boolean) {
  const segments = splitAtAntimeridian(pts);
  ctx.beginPath();
  for (const seg of segments) {
    seg.forEach((p, i) => (i === 0 ? ctx.moveTo(p.lon + 180, 90 - p.lat) : ctx.lineTo(p.lon + 180, 90 - p.lat)));
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Подсветка под линией
  ctx.strokeStyle = future ? 'rgba(70, 214, 255, 0.16)' : 'rgba(70, 214, 255, 0.12)';
  ctx.lineWidth = 5 * px;
  ctx.stroke();
  ctx.strokeStyle = future ? 'rgba(70, 214, 255, 0.95)' : 'rgba(70, 214, 255, 0.6)';
  ctx.lineWidth = (future ? 1.6 : 1.8) * px;
  if (future) ctx.setLineDash([7 * px, 5 * px]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function textWithHalo(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.halo;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function drawGridLabels(ctx: CanvasRenderingContext2D, v: View) {
  ctx.font = '400 10px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(200, 220, 245, 0.75)';
  const left = Math.max(v.ox, 0);
  const bottom = Math.min(v.oy + v.s * WORLD_H, v.h);
  // Шаг подписей: не теснее ~60 пикселей
  const step = v.s * 15 >= 60 ? 15 : v.s * 30 >= 60 ? 30 : 60;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let lat = -90 + step; lat < 90; lat += step) {
    const [, y] = toScreen(v, 0, lat);
    if (y < 14 || y > v.h - 14) continue;
    textWithHalo(ctx, `${Math.abs(lat)}°${lat > 0 ? 'с' : lat < 0 ? 'ю' : ''}`, left + 4, y);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let lon = -180 + step; lon < 180; lon += step) {
    const [x] = toScreen(v, lon, 0);
    if (x < 30 || x > v.w - 30) continue;
    textWithHalo(ctx, `${Math.abs(lon)}°${lon > 0 ? 'в' : lon < 0 ? 'з' : ''}`, x, bottom - 3);
  }
}

function drawSun(ctx: CanvasRenderingContext2D, v: View, sub: { lat: number; lon: number }) {
  const [x, y] = toScreen(v, sub.lon, sub.lat);
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = COLORS.sun;
  ctx.fillStyle = COLORS.sun;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(255, 210, 122, 0.9)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    ctx.moveTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5);
    ctx.lineTo(Math.cos(a) * 10.5, Math.sin(a) * 10.5);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCities(ctx: CanvasRenderingContext2D, v: View, cities: City[], hover: City | null) {
  const showCapitalLabels = v.k >= 1.8;
  // Подписи без наложений: российские города — первыми, затем столицы по порядку списка
  const placed: [number, number, number, number][] = [];
  const overlaps = (r: [number, number, number, number]) =>
    placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  for (const c of cities) {
    const [x, y] = toScreen(v, c.lon, c.lat);
    if (x < -20 || y < -20 || x > v.w + 20 || y > v.h + 20) continue;
    const ru = !!c.highlight;
    ctx.beginPath();
    ctx.arc(x, y, ru ? 4 : 2.4, 0, Math.PI * 2);
    ctx.fillStyle = ru ? COLORS.ruCity : '#ffffff';
    ctx.lineWidth = ru ? 2 : 1.4;
    ctx.strokeStyle = COLORS.halo;
    ctx.stroke();
    ctx.fill();
    if (ru) {
      ctx.beginPath();
      ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 93, 93, 0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (ru || showCapitalLabels || hover === c) {
      ctx.font = ru ? '600 12px "IBM Plex Mono", monospace' : '500 11px "IBM Plex Mono", monospace';
      ctx.fillStyle = ru ? '#ffd9d6' : COLORS.text;
      ctx.textBaseline = 'middle';
      const left = c.labelSide === 'left';
      ctx.textAlign = left ? 'right' : 'left';
      const lx = x + (left ? -1 : 1) * (ru ? 10 : 6);
      const tw = ctx.measureText(c.name).width;
      const rect: [number, number, number, number] = [left ? lx - tw : lx, y - 7, left ? lx : lx + tw, y + 7];
      if (!ru && hover !== c && overlaps(rect)) continue;
      placed.push(rect);
      textWithHalo(ctx, c.name, lx, y);
    }
  }
}

function drawSatellite(ctx: CanvasRenderingContext2D, v: View, p: TrackPoint, label: string) {
  const [x, y] = toScreen(v, p.lon, p.lat);
  ctx.save();
  // Ореол
  const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
  g.addColorStop(0, 'rgba(255, 181, 71, 0.45)');
  g.addColorStop(1, 'rgba(255, 181, 71, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 22, 0, Math.PI * 2);
  ctx.fill();
  // Значок КА: ромб с «панелями»
  ctx.translate(x, y);
  ctx.fillStyle = COLORS.sat;
  ctx.strokeStyle = '#1d1300';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(-11, -2.5, 6, 5);
  ctx.rect(5, -2.5, 6, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -5.5);
  ctx.lineTo(5.5, 0);
  ctx.lineTo(0, 5.5);
  ctx.lineTo(-5.5, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();

  // Подпись
  ctx.font = '600 12px "IBM Plex Mono", monospace';
  const w = ctx.measureText(label).width + 16;
  const lx = Math.min(Math.max(x + 14, 4), v.w - w - 4);
  const ly = Math.max(y - 34, 4);
  ctx.fillStyle = 'rgba(12, 24, 41, 0.88)';
  ctx.strokeStyle = 'rgba(255, 181, 71, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(lx, ly, w, 22, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.sat;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, lx + 8, ly + 11.5);
}
