import { Crosshair, Maximize, Minus, Plus } from 'lucide-react';
import { select } from 'd3-selection';
import 'd3-transition';
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { zoom, zoomIdentity } from 'd3-zoom';
import { useEffect, useRef, useState } from 'react';
import { cityShown, type City } from '../../data/cities';
import { PLACES } from '../../data/landmarks';
import { naturalSatellite } from '../../data/orbiters';
import { REGIONS } from '../../data/regions';
import { BODIES } from '../../physics/bodies';
import { greenwichToGeo } from '../../physics/frames';
import { RAD } from '../../physics/constants';
import { circleAround } from '../../physics/passes';
import { passRadiusOf, passTargetOf, useAppStore } from '../../state/store';
import { LayersMenu, RevsControl } from '../../ui/LayersMenu';
import { PassChip } from '../../ui/PassFinder';
import { fmt, fmtLat, fmtLon } from '../../ui/format';
import { satelliteTitle } from '../../ui/satelliteTitle';
import { ensureFullImage, LIGHT_DEVICE, NIGHT_LIGHTS, SURFACE, SURFACE_CREDIT, useProgressiveImage } from '../assets';
import { registerSnapshot } from '../snapshot';
import { frameDue, peakAngularRateDeg, simMsPerShift } from '../frameRate';
import { pickLevel } from '../imageChunks';
import { orbitSource, Revolutions, revolutionColor, TrackCache, trackSpan } from '../trackCache';
import type { BorderPaths } from './geo';
import { loadBorders } from './geo';
import { followStep, lonStep } from './follow';
import { createNightMasks, updateNightMasks } from './nightMask';
import type { MapScene, PassZone, View } from './renderMap';
import { renderBase, renderLines, renderMap, smoothingFor, toScreen, toWorldLonLat } from './renderMap';
import styles from './MapView.module.css';

const MAX_ZOOM = 20;

/** Ближайший видимый город (место) не дальше maxPx пикселей экрана от точки (sx, sy). */
function nearestCity(view: View, sx: number, sy: number, maxPx: number): City | null {
  let best: City | null = null;
  let bestD = maxPx;
  for (const c of PLACES[useAppStore.getState().body]) {
    if (!cityShown(c, view.s)) continue;
    const [cx, cy] = toScreen(view, c.lon, c.lat);
    const d = Math.hypot(cx - sx, cy - sy);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}
/**
 * Подгонять карту по высоте: на сенсорном экране (телефон, планшет) и в узкой панели. На компьютере
 * широкая колонка «Обоих видов» остаётся целой картой мира.
 */
const FIT_MAX_WIDTH = 700;
const fitByHeight = (w: number) => w < FIT_MAX_WIDTH || matchMedia('(pointer: coarse)').matches;

/** Базовое вписывание карты 2:1 в холст (без масштабирования пользователем). */
function baseFit(w: number, h: number) {
  const s0 = Math.min(w / 360, h / 180);
  return { s0, ox0: (w - 360 * s0) / 2, oy0: (h - 180 * s0) / 2 };
}

export default function MapView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  /** Высота легенды и строки источников снизу — подписи долгот ставятся над ними. */
  const bottomInsetRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const hoverRef = useRef<City | null>(null);
  const dirtyRef = useRef(true);
  /** Пока пользователь сам не двигал карту, она подгоняется под панель (на телефоне — по высоте, к спутнику). */
  const autoFitRef = useRef(true);
  /** Шаг слежения за спутником (на телефоне и в узкой панели), вызывается из цикла кадров. */
  const followRef = useRef<((nowMs: number) => void) | null>(null);
  /** До этого момента слежение не вмешивается: идёт анимация «К спутнику». */
  const followHoldRef = useRef(0);
  const [borders, setBorders] = useState<BorderPaths | null>(null);

  const body = useAppStore((s) => s.body);
  const day = useProgressiveImage(SURFACE[body]);
  // Ночные огни и границы государств — только у Земли
  const night = useProgressiveImage(body === 'earth' ? NIGHT_LIGHTS : []);
  const fineBordersRef = useRef(false);
  const fineLoadedRef = useRef(false);
  // Подробные границы; грубые не должны их перезаписать, если придут позже
  const loadFineBorders = () => {
    if (fineBordersRef.current) return;
    fineBordersRef.current = true;
    loadBorders('fine').then(
      (b) => {
        fineLoadedRef.current = true;
        setBorders(b);
      },
      () => {
        fineBordersRef.current = false;
      },
    );
  };

  useEffect(() => {
    if (body !== 'earth' || borders) return;
    loadBorders('coarse').then((b) => !fineLoadedRef.current && setBorders(b), () => {});
    // На компьютере сразу следом — подробные (1:50 млн); на телефоне — только при приближении
    if (!LIGHT_DEVICE) loadFineBorders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, borders]);

  // Цикл кадров живёт всё время, новые снимки и границы читает отсюда
  const dataRef = useRef({ day, night, borders });
  // Перерисовка при смене изображений/данных
  useEffect(() => {
    dataRef.current = { day, night, borders };
    dirtyRef.current = true;
  }, [day, night, borders]);
  useEffect(
    () =>
      useAppStore.subscribe((s, p) => {
        if (
          s.body !== p.body ||
          s.layers !== p.layers ||
          s.orbit !== p.orbit ||
          s.revsBack !== p.revsBack ||
          s.revsForward !== p.revsForward ||
          s.passTargets !== p.passTargets ||
          s.passRadius !== p.passRadius
        )
          dirtyRef.current = true;
      }),
    [],
  );

  // Картинка для выгрузки: холст карты хранит последний кадр, его можно копировать в любой момент
  useEffect(
    () =>
      registerSnapshot('map', {
        // Пока холст не получил размер панели, карты на нём ещё нет
        canvas: () => (useAppStore.getState().view === '3d' || sizeRef.current.w === 0 ? null : canvasRef.current),
        background: '#081120',
      }),
    [],
  );

  // Высота легенды и строки источников (легенда скрыта на узких экранах — тогда 0)
  useEffect(() => {
    const measure = () => {
      const h = Math.max(legendRef.current?.offsetHeight ?? 0, footerRef.current?.offsetHeight ?? 0);
      const next = h > 0 ? h + 16 : 0;
      if (next !== bottomInsetRef.current) {
        bottomInsetRef.current = next;
        dirtyRef.current = true;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (legendRef.current) ro.observe(legendRef.current);
    if (footerRef.current) ro.observe(footerRef.current);
    return () => ro.disconnect();
  }, []);

  // Размер холста и масштабирование колесом/перетаскиванием (d3-zoom)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const z = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .on('zoom', (e: { transform: ZoomTransform; sourceEvent: unknown }) => {
        transformRef.current = e.transform;
        if (e.sourceEvent) autoFitRef.current = false; // карту двигали пальцем, колесом или мышью
        dirtyRef.current = true;
        // При приближении — подробные границы (1:50 млн), один раз
        if (e.transform.k >= 2) loadFineBorders();
      });
    zoomRef.current = z;
    const applyExtent = () => {
      const { w, h } = sizeRef.current;
      const { s0, ox0, oy0 } = baseFit(w, h);
      z.extent([
        [0, 0],
        [w, h],
      ]).translateExtent([
        [ox0, oy0],
        [ox0 + 360 * s0, oy0 + 180 * s0],
      ]);
    };
    // Узкая высокая панель: карта приближается до высоты панели и встаёт по центру на спутник, щипком — вся карта
    const fitted = (): ZoomTransform => {
      const { w, h } = sizeRef.current;
      const k = Math.min(MAX_ZOOM, (2 * h) / w);
      if (!fitByHeight(w) || k <= 1) return zoomIdentity;
      const st = useAppStore.getState();
      const lon = st.orbit ? orbitSource(st.orbit).at(st.simTime)?.lon ?? 0 : 0;
      const { s0, ox0, oy0 } = baseFit(w, h);
      return zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-(ox0 + s0 * (lon + 180)), -(oy0 + s0 * 90));
    };
    // zoom.transform сам не ограничивает сдвиг краями карты — ограничиваем тем же правилом, что и жесты
    const clamp = (t: ZoomTransform) => {
      const { w, h } = sizeRef.current;
      return z.constrain()(t, [[0, 0], [w, h]], z.translateExtent());
    };
    // Слежение: пока карту не трогали, спутник у края кадра плавно возвращается к середине.
    // Положение запоминается в градусах, поэтому сдвиг самой карты не путается со скоростью спутника
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let prev: { orbit: unknown; lon: number; lat: number; ms: number } | null = null;
    let activeX = false;
    let activeY = false;
    // Сглаженная скорость спутника по карте, px/с: время модели меняется не в каждом кадре
    let speedX = 0;
    let speedY = 0;
    followRef.current = (nowMs) => {
      const { w, h } = sizeRef.current;
      const st = useAppStore.getState();
      const p = autoFitRef.current && fitByHeight(w) && nowMs >= followHoldRef.current && st.orbit ? orbitSource(st.orbit).at(st.simTime) : null;
      if (!p) {
        prev = null;
        activeX = activeY = false;
        return;
      }
      const t = transformRef.current;
      const { s0, ox0, oy0 } = baseFit(w, h);
      const s = s0 * t.k;
      const x = t.x + t.k * ox0 + s * (p.lon + 180);
      const y = t.y + t.k * oy0 + s * (90 - p.lat);
      const dt = prev ? (nowMs - prev.ms) / 1000 : 0;
      let jump = !prev || prev.orbit !== st.orbit || dt <= 0;
      let movedX = 0;
      let movedY = 0;
      if (prev && !jump) {
        // Переход через ±180° и скачки времени — без плавного проезда через всю карту
        const { delta, wrapped } = lonStep(prev.lon, p.lon);
        movedX = delta * s;
        movedY = (prev.lat - p.lat) * s;
        jump = wrapped || Math.abs(movedX) > w / 2 || Math.abs(movedY) > h / 2;
      }
      prev = { orbit: st.orbit, lon: p.lon, lat: p.lat, ms: nowMs };
      if (jump) {
        movedX = movedY = speedX = speedY = 0;
      } else {
        const a = 1 - Math.exp(-dt / 0.5);
        speedX += (Math.abs(movedX) / dt - speedX) * a;
        speedY += (Math.abs(movedY) / dt - speedY) * a;
      }
      const smooth = !jump && !reducedMotion.matches;
      const fx = followStep({ x, moved: movedX, speed: speedX, size: w, dt, active: activeX, smooth });
      const fy = followStep({ x: y, moved: movedY, speed: speedY, size: h, dt, active: activeY, smooth });
      activeX = fx.active;
      activeY = fy.active;
      if (fx.shift === 0 && fy.shift === 0) return;
      const next = clamp(zoomIdentity.translate(t.x + fx.shift, t.y + fy.shift).scale(t.k));
      // У края карты сдвигать некуда — не перерисовывать кадр впустую
      if (Math.abs(next.x - t.x) < 0.01 && Math.abs(next.y - t.y) < 0.01) return;
      select(canvas).call(z.transform, next);
    };
    const unsubscribe = useAppStore.subscribe((s, p) => {
      if (s.orbit !== p.orbit && autoFitRef.current && sizeRef.current.w > 0) select(canvas).call(z.transform, clamp(fitted()));
    });
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return; // панель скрыта: холст и его снимок остаются до возвращения
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { w: width, h: height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      applyExtent();
      // Ограничить сдвиг после изменения размера (или заново подогнать, если карту ещё не трогали)
      select(canvas).call(z.transform, clamp(autoFitRef.current ? fitted() : transformRef.current));
      dirtyRef.current = true;
    });
    ro.observe(wrap);
    select(canvas).call(z).on('dblclick.zoom', null);
    return () => {
      followRef.current = null;
      ro.disconnect();
      unsubscribe();
      select(canvas).on('.zoom', null);
    };
  }, []);

  // Цикл отрисовки
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const masks = createNightMasks();
    const lights = document.createElement('canvas');
    // Снимок огней в масштабе вида: тяжёлое уменьшение 8K — только при смене вида, а не с каждой маской
    const lightsScaled = document.createElement('canvas');
    // Снимок и линии меняются только с видом и слоями: готовые холсты копируются в кадр вместо перерисовки
    const base = document.createElement('canvas');
    const lines = document.createElement('canvas');
    let staticKey = '';
    const trackCache = new TrackCache();
    let revs: Revolutions | null = null;
    let revsRevision = -1;
    let nodePoints: MapScene['nodePoints'] = [];
    let lastSub = { lat: NaN, lon: NaN };
    let lastMaskAt = 0;
    let lightsKey = '';
    let baseSource: ImageBitmap | HTMLImageElement | null = null;
    let lightsSource: ImageBitmap | HTMLImageElement | null = null;
    let lastTime = NaN;
    let lastDraw = 0;
    let stepMs = 0;
    // Фон метки спутника — цвет панелей темы (--bg-1), перечитывается при смене тела
    let labelBg = 'rgba(12, 24, 41, 0.9)';
    let labelBgBody = '';
    // Круг поиска пролётов пересчитывается только при смене места, радиуса или тела
    let passZone: PassZone | null = null;
    let passKey = '';
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const st = useAppStore.getState();
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0 || st.view === '3d') return;
      // Сдвиг за спутником (если нужен) помечает кадр к перерисовке
      followRef.current?.(performance.now());
      if (st.simTime === lastTime && !dirtyRef.current) return;
      // Ход времени: одна карта — на каждый кадр экрана, вместе с глобусом — через кадр, ровно по 33 мс при 60 Гц
      // (порог ниже периода: при пороге 33 мс кадры чередовались через 34 и 51 мс). Масштаб, слои и наведение — сразу
      const nowMs = performance.now();
      const sinceDraw = nowMs - lastDraw;
      const minGap = st.view === 'split' ? 25 : 12;
      if (!dirtyRef.current && (sinceDraw < minGap || !frameDue(st.speed, Math.abs(st.simTime - lastTime), sinceDraw, stepMs))) return;
      lastDraw = nowMs;
      lastTime = st.simTime;
      dirtyRef.current = false;

      const t = transformRef.current;
      const { s0, ox0, oy0 } = baseFit(w, h);
      const view: View = { s: s0 * t.k, ox: t.x + t.k * ox0, oy: t.y + t.k * oy0, w, h, dpr, k: t.k };
      stepMs = st.orbit ? simMsPerShift(peakAngularRateDeg(st.orbit) * view.s) : Infinity;

      const earth = st.body === 'earth';
      const { imagery, grid, borders: bordersOn } = st.layers;
      const { day, night, borders } = dataRef.current;
      // Ширина всей карты на экране в пикселях: под неё подбираются копии снимков
      const worldPx = 360 * view.s * dpr;
      const redraw = () => {
        dirtyRef.current = true;
      };
      if (day) ensureFullImage(day, worldPx, redraw);
      if (night) ensureFullImage(night, worldPx, redraw);
      const daySource = day && pickLevel(day.levels, worldPx);
      const nightSource = night && pickLevel(night.levels, worldPx);

      const nextStaticKey = `${canvas.width}x${canvas.height}|${view.s}|${view.ox}|${view.oy}|${imagery}|${grid}|${bordersOn}|${earth}|${!!borders}`;
      if (nextStaticKey !== staticKey || daySource !== baseSource) {
        staticKey = nextStaticKey;
        baseSource = daySource;
        const scene = { view, layers: st.layers, day: daySource, borders: earth ? borders : null };
        base.width = lines.width = canvas.width;
        base.height = lines.height = canvas.height;
        renderBase(base.getContext('2d', { alpha: false })!, scene);
        renderLines(lines.getContext('2d')!, scene);
      }

      // Маски ночи пересчитываются, когда Солнце сместилось больше чем на 0,05°
      // Подсолнечная точка на текущем теле: направление на Солнце → вращающаяся система тела
      const b = BODIES[st.body];
      const sunGeo = greenwichToGeo(b.toFixed(b.sunDirection(st.simTime), st.simTime), 0);
      const subRad = { lat: sunGeo.lat, lon: sunGeo.lon };
      const sub = { lat: subRad.lat * RAD, lon: subRad.lon * RAD };
      // (при быстрой перемотке — не чаще 20 раз в секунду)
      let masksChanged = false;
      const moved = !(Math.abs(sub.lat - lastSub.lat) < 0.05 && Math.abs(sub.lon - lastSub.lon) < 0.05);
      if (moved && (nowMs - lastMaskAt > 50 || Number.isNaN(lastSub.lat))) {
        updateNightMasks(masks, subRad);
        lastSub = sub;
        lastMaskAt = nowMs;
        masksChanged = true;
      }

      // Слой огней городов = ночной снимок в масштабе вида × маска
      const key = `${canvas.width}x${canvas.height}|${view.s}|${view.ox}|${view.oy}`;
      if (earth && nightSource && st.layers.night) {
        const world = [dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy] as const;
        if (key !== lightsKey || nightSource !== lightsSource) {
          lightsKey = key;
          lightsSource = nightSource;
          masksChanged = true;
          lightsScaled.width = lights.width = canvas.width;
          lightsScaled.height = lights.height = canvas.height;
          const sctx = lightsScaled.getContext('2d')!;
          sctx.setTransform(...world);
          sctx.imageSmoothingQuality = smoothingFor(nightSource);
          sctx.drawImage(nightSource, 0, 0, 360, 180);
        }
        if (masksChanged) {
          const lctx = lights.getContext('2d')!;
          lctx.setTransform(1, 0, 0, 1, 0, 0);
          lctx.globalCompositeOperation = 'copy';
          lctx.drawImage(lightsScaled, 0, 0);
          lctx.setTransform(...world);
          lctx.globalCompositeOperation = 'destination-in';
          lctx.drawImage(masks.lights, 0, 0, 360, 180);
        }
      }

      const o = st.orbit;
      const span = o ? trackSpan(o, st.revsBack, st.revsForward) : null;
      const track = o && span ? trackCache.get(orbitSource(o), st.simTime, span.back, span.forward) : null;
      // Витки: границы — восходящие узлы; подписи ставятся в начале каждого следующего витка.
      // Считаются заново, когда окно трассы сдвинулось на шаг сетки
      if (o && span && track && track.revision !== revsRevision) {
        revsRevision = track.revision;
        const r = new Revolutions(o, st.simTime, span.back, span.forward);
        const windowEnd = st.simTime + span.forward * o.T * 1000;
        revs = r;
        nodePoints = r.nodes.filter((n) => n > st.simTime && n <= windowEnd).map((n) => ({ offset: r.offsetAt(n), point: orbitSource(o).at(n)! }));
      }
      // Точка пролётов — только если пользователь поставил её щелчком по карте
      const target = passTargetOf(st, st.body);
      const radiusKm = passRadiusOf(st, st.body);
      const nextPassKey = target ? `${st.body}|${target.lat}|${target.lon}|${target.name}|${radiusKm}` : '';
      if (nextPassKey !== passKey) {
        passKey = nextPassKey;
        passZone = target && {
          lat: target.lat,
          lon: target.lon,
          custom: target.name === null,
          circle: circleAround(target, radiusKm, b.radius),
          radiusLabel: `${fmt(radiusKm)} км`,
        };
      }
      const title = st.record ? satelliteTitle(st.record.elements).title : '';
      renderMap(ctx, {
        view,
        layers: st.layers,
        base,
        lines,
        masks,
        // Ночные огни — только у Земли
        lightsLayer: earth && nightSource ? lights : null,
        subsolar: sub,
        track,
        satLabel: track ? `${title}, ${fmt(track.current.h, 0)} км` : '',
        satNatural: st.record ? naturalSatellite(st.record.elements) : null,
        revs,
        nodePoints,
        cities: PLACES[st.body],
        regions: st.layers.regions ? REGIONS[st.body] : [],
        bodyRadius: b.radius,
        labelBg: (() => {
          if (labelBgBody !== st.body && document.documentElement.dataset.body === st.body) {
            labelBgBody = st.body;
            const hex = getComputedStyle(document.documentElement).getPropertyValue('--bg-1').trim();
            if (/^#[0-9a-f]{6}$/i.test(hex)) {
              const n = parseInt(hex.slice(1), 16);
              labelBg = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.9)`;
            }
          }
          return labelBg;
        })(),
        bottomInset: bottomInsetRef.current,
        hoverCity: hoverRef.current,
        passZone,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Координаты под курсором и подсветка города
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { w, h } = sizeRef.current;
    const t = transformRef.current;
    const { s0, ox0, oy0 } = baseFit(w, h);
    const view = { s: s0 * t.k, ox: t.x + t.k * ox0, oy: t.y + t.k * oy0 } as View;
    const [lon, lat] = toWorldLonLat(view, sx, sy);
    if (coordsRef.current) {
      coordsRef.current.textContent = Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? `${fmtLat(lat, 2)}   ${fmtLon(lon, 2)} · щелчок — пролёты над точкой` : '';
    }
    const best = nearestCity(view, sx, sy, 10);
    if (best !== hoverRef.current) {
      hoverRef.current = best;
      dirtyRef.current = true;
    }
  };

  // Щелчок по карте ставит точку для поиска пролётов (рядом с городом — сам город).
  // После перетаскивания карты щелчка нет: d3-zoom его гасит
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const st = useAppStore.getState();
    // В режиме показа касание только возвращает кнопку выхода, точку не ставит
    if (st.presenting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { w, h } = sizeRef.current;
    const t = transformRef.current;
    const { s0, ox0, oy0 } = baseFit(w, h);
    const view = { s: s0 * t.k, ox: t.x + t.k * ox0, oy: t.y + t.k * oy0 } as View;
    const [lon, lat] = toWorldLonLat(view, e.clientX - rect.left, e.clientY - rect.top);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    // На сенсорном экране наведения нет — ищем город рядом с местом касания, с запасом на палец
    const city = nearestCity(view, e.clientX - rect.left, e.clientY - rect.top, matchMedia('(pointer: coarse)').matches ? 18 : 10);
    st.setPassTarget(city ? { name: city.name, lat: city.lat, lon: city.lon } : { name: null, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 });
  };

  const zoomBy = (factor: number) => {
    autoFitRef.current = false;
    const canvas = canvasRef.current!;
    if (zoomRef.current) select(canvas).transition().duration(250).call(zoomRef.current.scaleBy, factor);
  };
  // Клавиатура (альтернатива перетаскиванию и колесу): стрелки сдвигают карту, «+» и «−» меняют масштаб
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const z = zoomRef.current;
    if (!z || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = transformRef.current.k;
    const STEP = 80; // px экрана за нажатие
    const pan: Record<string, [number, number]> = { ArrowLeft: [STEP, 0], ArrowRight: [-STEP, 0], ArrowUp: [0, STEP], ArrowDown: [0, -STEP] };
    if (pan[e.key]) {
      const [dx, dy] = pan[e.key];
      // Без анимации: при быстрых повторных нажатиях переходы d3 прерывали бы друг друга и сдвиг терялся
      select(e.currentTarget).call(z.translateBy, dx / k, dy / k);
    } else if (e.key === '+' || e.key === '=') zoomBy(1.6);
    else if (e.key === '-' || e.key === '−') zoomBy(1 / 1.6);
    else if (e.key === '0') resetZoom();
    else return;
    e.preventDefault();
  };
  const resetZoom = () => {
    autoFitRef.current = false;
    const canvas = canvasRef.current!;
    if (zoomRef.current) select(canvas).transition().duration(300).call(zoomRef.current.transform, zoomIdentity);
  };
  const centerOnSatellite = () => {
    const st = useAppStore.getState();
    if (!st.orbit || !zoomRef.current) return;
    const tr = orbitSource(st.orbit).at(st.simTime)!;
    const { w, h } = sizeRef.current;
    // На телефоне и в узкой панели карта снова следит за спутником (после анимации наведения);
    // на компьютере с широкой картой — как раньше, без слежения
    autoFitRef.current = fitByHeight(w);
    followHoldRef.current = performance.now() + 450;
    const { s0, ox0, oy0 } = baseFit(w, h);
    const k = Math.max(3, transformRef.current.k);
    const bx = ox0 + s0 * (tr.lon + 180);
    const by = oy0 + s0 * (90 - tr.lat);
    select(canvasRef.current!)
      .transition()
      .duration(400)
      .call(zoomRef.current.transform, zoomIdentity.translate(w / 2, h / 2).scale(k).translate(-bx, -by));
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onClick={onClick}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          hoverRef.current = null;
          dirtyRef.current = true;
          if (coordsRef.current) coordsRef.current.textContent = '';
        }}
        role="application"
        aria-roledescription="карта"
        aria-label="Карта с трассой спутника. Стрелки — сдвиг, плюс и минус — масштаб, ноль — вся карта"
        tabIndex={0}
        onKeyDown={onKeyDown}
      />
      <PassChip />
      <div className={styles.toolbar} data-chrome="">
        <LayersMenu keys={body === 'earth' ? ['imagery', 'night', 'borders', 'grid', 'cities'] : ['regions', 'imagery', 'night', 'grid', 'cities']}>
          <RevsControl />
        </LayersMenu>
        <div className={styles.zoom}>
          <button type="button" className={styles.zoomStep} onClick={() => zoomBy(1.6)} aria-label="Приблизить" title="Приблизить">
            <Plus size={16} />
          </button>
          <button type="button" className={styles.zoomStep} onClick={() => zoomBy(1 / 1.6)} aria-label="Отдалить" title="Отдалить">
            <Minus size={16} />
          </button>
          <button type="button" onClick={centerOnSatellite} aria-label="К спутнику" title="К спутнику">
            <Crosshair size={16} />
          </button>
          <button type="button" onClick={resetZoom} aria-label="Вся карта" title="Вся карта">
            <Maximize size={15} />
          </button>
        </div>
      </div>
      <Legend listRef={legendRef} />
      <div className={styles.footer} ref={footerRef}>
        <span ref={coordsRef} className={`${styles.coords} num`} data-chrome="" />
        <span className={styles.credit}>{SURFACE_CREDIT[body]}</span>
      </div>
    </div>
  );
}

/** Условные обозначения: цвета витков (сколько показано вперёд), прочие значки. */
function Legend({ listRef }: { listRef: React.Ref<HTMLUListElement> }) {
  const chosen = useAppStore((s) => s.revsForward);
  const orbit = useAppStore((s) => s.orbit);
  // У очень долгих орбит (Луна) окно короче витка: следующих витков на трассе нет
  const forward = orbit ? Math.floor(trackSpan(orbit, 0, chosen).forward) : chosen;
  const revs = Array.from({ length: Math.min(forward, 3) }, (_, k) => k + 1);
  const line = (color: string, dashed: boolean, opacity = 1) => (
    <svg width="22" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeOpacity={opacity} strokeWidth="2" strokeDasharray={dashed ? '5 3' : undefined} />
    </svg>
  );
  return (
    <ul ref={listRef} className={styles.legend} aria-label="Условные обозначения">
      <li>
        {line(revolutionColor(-1), false)}
        прошедшие
      </li>
      <li>
        {line(revolutionColor(0), true)}
        текущий виток
      </li>
      {revs.map((k) => (
        <li key={k}>
          {line(revolutionColor(k), true)}
          {`+${k}`}
        </li>
      ))}
      {forward >= 4 && (
        <li>
          {line(revolutionColor(4), true)}
          {forward === 4 ? '+4' : `+4…+${forward}`}
        </li>
      )}
      <li>
        <svg width="14" height="14" aria-hidden="true">
          <circle cx="7" cy="7" r="3.5" fill="var(--sun)" />
        </svg>
        Солнце в зените
      </li>
    </ul>
  );
}
