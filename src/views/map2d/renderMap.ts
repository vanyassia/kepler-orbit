/**
 * Отрисовка 2D-карты на Canvas. Порядок слоёв (снизу вверх):
 * снимок (или схема) → ночь и огни городов → сетка → границы → терминатор →
 * трасса → подсолнечная точка → города → начала витков → спутник.
 */
import { geoCircle } from 'd3-geo';
import type { City } from '../../data/cities';
import type { Region } from '../../data/regions';
import { REGION_COLOR } from '../../data/regions';
import type { TrackPoint } from '../../physics/groundTrack';
import { splitAtAntimeridian } from '../../physics/groundTrack';
import type { Layers } from '../../state/store';
import type { BorderPaths } from './geo';
import { tracePath, WORLD_H, WORLD_W } from './geo';
import type { NightMasks } from './nightMask';
import type { Revolutions, TrackWindow } from '../trackCache';
import { revolutionColor } from '../trackCache';
import { fmtDuration } from '../../ui/format';

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
  satLabel: string;
  /** Витки нашей модели: цвет трассы и подписи начала витков. */
  revs: Revolutions | null;
  /** Моменты узлов (начал витков) с точными подспутниковыми точками — для подписей. */
  nodePoints: { offset: number; point: TrackPoint }[];
  cities: City[];
  hoverCity: City | null;
  /** Регионы тела (пусто у Земли или при выключенном слое) и радиус тела, км. */
  regions: Region[];
  bodyRadius: number;
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

  // 4а. Регионы Луны и Марса: контур — сферический круг диаметра объекта
  if (sc.regions.length) drawRegionOutlines(ctx, sc.regions, sc.bodyRadius, px);

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

  // 6. Трасса с цветом по виткам — во всю яркость по всему окну
  if (sc.track) {
    const color = (tau: number) => revolutionColor(sc.revs ? sc.revs.offsetAt(tau) : 0);
    drawTrack(ctx, sc.track.past, px, false, color);
    drawTrack(ctx, sc.track.future, px, true, color);
  }
  ctx.restore();

  // Далее — в экранных координатах (чёткие значки и подписи)
  setScreen(ctx, v);
  if (layers.grid) drawGridLabels(ctx, v);
  drawSun(ctx, v, sc.subsolar);
  const placed: Rect[] = [];
  if (layers.cities) drawCities(ctx, v, sc.cities, sc.hoverCity, placed);
  if (sc.regions.length) drawRegionLabels(ctx, v, sc.regions, sc.bodyRadius, placed);
  if (sc.track) drawNodeLabels(ctx, v, sc.nodePoints);
  if (sc.track) drawTrackEnds(ctx, v, sc.track);
  if (sc.track) drawSatellite(ctx, v, sc.track.current, sc.satLabel);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Трасса: прошлое — сплошной линией, будущее — пунктиром. Участок рисуется кусками
 * одного цвета (виток); пунктир непрерывен между кусками благодаря смещению штрихов.
 */
function drawTrack(
  ctx: CanvasRenderingContext2D,
  pts: TrackPoint[],
  px: number,
  future: boolean,
  colorAt: (tau: number) => string,
  widthPx = future ? 1.6 : 1.8,
  dash: [number, number] = [7, 5],
) {
  if (pts.length < 2) return;
  let dashOffset = 0;
  let pieceStart = 0;
  const key = (i: number) => {
    const mid = (pts[i].timeMs + pts[Math.min(i + 1, pts.length - 1)].timeMs) / 2;
    return colorAt(mid);
  };
  let current = key(0);
  for (let i = 1; i <= pts.length - 1; i++) {
    const next = i < pts.length - 1 ? key(i) : null;
    if (next !== current) {
      dashOffset += strokePiece(ctx, pts.slice(pieceStart, i + 1), px, future, current, dashOffset, widthPx, dash);
      pieceStart = i;
      current = next ?? current;
    }
  }
}

/** Обводка куска трассы; возвращает его длину (для непрерывного пунктира). */
function strokePiece(
  ctx: CanvasRenderingContext2D,
  pts: TrackPoint[],
  px: number,
  future: boolean,
  color: string,
  dashOffset: number,
  widthPx: number,
  dash: [number, number],
): number {
  let length = 0;
  ctx.beginPath();
  for (const seg of splitAtAntimeridian(pts)) {
    seg.forEach((p, i) => {
      const x = p.lon + 180;
      const y = 90 - p.lat;
      if (i === 0) ctx.moveTo(x, y);
      else {
        length += Math.hypot(x - (seg[i - 1].lon + 180), y - (90 - seg[i - 1].lat));
        ctx.lineTo(x, y);
      }
    });
  }
  const [r, g, b] = hexToRgb(color);
  ctx.lineJoin = 'round';
  ctx.lineCap = future ? 'butt' : 'round';
  // Подсветка под линией
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.16)`;
  ctx.lineWidth = 5 * px;
  ctx.stroke();
  ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
  ctx.lineWidth = widthPx * px;
  if (future) {
    ctx.setLineDash([dash[0] * px, dash[1] * px]);
    ctx.lineDashOffset = dashOffset;
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  return length;
}

/** Начала следующих витков (восходящие узлы на экваторе): «+1», «+2»… */
function drawNodeLabels(ctx: CanvasRenderingContext2D, v: View, nodes: { offset: number; point: TrackPoint }[]) {
  ctx.font = '600 11px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const { offset, point } of nodes) {
    const [x, y] = toScreen(v, point.lon, point.lat);
    if (x < -40 || x > v.w + 40 || y < -20 || y > v.h + 20) continue;
    const color = revolutionColor(offset);
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = COLORS.halo;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    ctx.fillStyle = color;
    textWithHalo(ctx, `+${offset}`, x + 6, y - 9);
  }
}

/** Концы окна трассы: сколько времени назад начинается и через сколько кончается показанная трасса. */
function drawTrackEnds(ctx: CanvasRenderingContext2D, v: View, track: TrackWindow) {
  const t = track.current.timeMs;
  const first = track.past[0];
  const last = track.future[track.future.length - 1];
  const ends: [TrackPoint | undefined, string][] = [
    [track.past.length > 2 ? first : undefined, `−${fmtDuration((t - first.timeMs) / 1000)}`],
    [track.future.length > 2 ? last : undefined, `+${fmtDuration((last.timeMs - t) / 1000)}`],
  ];
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const [p, text] of ends) {
    if (!p) continue;
    const [x, y] = toScreen(v, p.lon, p.lat);
    if (x < -40 || y < -20 || x > v.w + 40 || y > v.h + 20) continue;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200, 220, 245, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(200, 220, 245, 0.85)';
    textWithHalo(ctx, text, x + 7, y);
  }
}

/** Угловой радиус региона, градусы: половина диаметра, делённая на радиус тела. */
const regionRadiusDeg = (r: Region, R: number) => ((r.diameterKm / 2 / R) * 180) / Math.PI;

function drawRegionOutlines(ctx: CanvasRenderingContext2D, regions: Region[], R: number, px: number) {
  ctx.save();
  ctx.lineWidth = px;
  ctx.setLineDash([3 * px, 3 * px]);
  for (const r of regions) {
    if (!r.outline) continue;
    ctx.beginPath();
    tracePath(ctx, geoCircle().center([r.lon, r.lat]).radius(regionRadiusDeg(r, R)).precision(2)());
    ctx.strokeStyle = REGION_COLOR[r.kind] + '73'; // ~45 % непрозрачности
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Подписи регионов: крупнее — для больших; подпись появляется, когда регион на экране
 * шире 46 пикселей, и не ставится поверх уже занятого места (города, места посадок).
 */
function drawRegionLabels(ctx: CanvasRenderingContext2D, v: View, regions: Region[], R: number, placed: Rect[]) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of regions) {
    const sizePx = 2 * regionRadiusDeg(r, R) * v.s;
    if (sizePx < 46) continue;
    const [x, y] = toScreen(v, r.lon, r.lat);
    if (x < -100 || y < -20 || x > v.w + 100 || y > v.h + 20) continue;
    const fs = Math.round(Math.min(15, Math.max(10, 8 + sizePx / 60)));
    ctx.font = `500 ${fs}px Tektur, "IBM Plex Mono", sans-serif`;
    const tw = ctx.measureText(r.title).width;
    // Место занято (город, место посадки) — пробуем чуть ниже и чуть выше центра региона
    const shift = Math.min(sizePx / 4, fs * 1.6);
    const ly = [y, y + shift, y - shift].find((yy) => !overlaps(placed, [x - tw / 2 - 2, yy - fs / 2 - 1, x + tw / 2 + 2, yy + fs / 2 + 1]));
    if (ly === undefined) continue;
    placed.push([x - tw / 2 - 2, ly - fs / 2 - 1, x + tw / 2 + 2, ly + fs / 2 + 1]);
    ctx.fillStyle = REGION_COLOR[r.kind];
    ctx.globalAlpha = r.kind === 'crater' || r.kind === 'mons' ? 0.8 : 0.92;
    textWithHalo(ctx, r.title, x, ly);
    ctx.globalAlpha = 1;
  }
}

function textWithHalo(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.halo;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function drawGridLabels(ctx: CanvasRenderingContext2D, v: View) {
  ctx.font = '400 11px "IBM Plex Mono", monospace';
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

type Rect = [number, number, number, number];
const overlaps = (placed: Rect[], r: Rect) => placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);

function drawCities(ctx: CanvasRenderingContext2D, v: View, cities: City[], hover: City | null, placed: Rect[]) {
  const showCapitalLabels = v.k >= 1.8;
  // Подписи без наложений: выделенные места — первыми, затем остальные по порядку списка
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
      const rect: Rect = [left ? lx - tw : lx, y - 7, left ? lx : lx + tw, y + 7];
      if (!ru && hover !== c && overlaps(placed, rect)) continue;
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
