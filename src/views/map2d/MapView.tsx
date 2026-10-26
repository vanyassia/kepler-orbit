import { Crosshair, Maximize, Minus, Plus } from 'lucide-react';
import { select } from 'd3-selection';
import 'd3-transition';
import type { ZoomBehavior, ZoomTransform } from 'd3-zoom';
import { zoom, zoomIdentity } from 'd3-zoom';
import { useEffect, useRef, useState } from 'react';
import type { City } from '../../data/cities';
import { PLACES } from '../../data/landmarks';
import { REGIONS } from '../../data/regions';
import { BODIES } from '../../physics/bodies';
import { greenwichToGeo } from '../../physics/frames';
import { RAD } from '../../physics/constants';
import { visibilityAngle } from '../../physics/groundTrack';
import { useAppStore } from '../../state/store';
import { LayersMenu, RevsControl } from '../../ui/LayersMenu';
import { fmt, fmtLat, fmtLon } from '../../ui/format';
import { satelliteTitle } from '../../ui/satelliteTitle';
import { SURFACE, SURFACE_CREDIT, TEXTURES, useProgressiveImage } from '../assets';
import { orbitSource, Revolutions, revolutionColor, TrackCache } from '../trackCache';
import type { BorderPaths } from './geo';
import { loadBorders } from './geo';
import { createNightMasks, updateNightMasks } from './nightMask';
import type { View } from './renderMap';
import { renderMap, toScreen, toWorldLonLat } from './renderMap';
import styles from './MapView.module.css';

const MAX_ZOOM = 20;

/** Базовое вписывание карты 2:1 в холст (без масштабирования пользователем). */
function baseFit(w: number, h: number) {
  const s0 = Math.min(w / 360, h / 180);
  return { s0, ox0: (w - 360 * s0) / 2, oy0: (h - 180 * s0) / 2 };
}

export function MapView() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coordsRef = useRef<HTMLSpanElement>(null);
  const zoomRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const hoverRef = useRef<City | null>(null);
  const dirtyRef = useRef(true);
  const [borders, setBorders] = useState<BorderPaths | null>(null);

  const body = useAppStore((s) => s.body);
  const day = useProgressiveImage(SURFACE[body]);
  const night = useProgressiveImage([TEXTURES.night2k, TEXTURES.night8k]);

  useEffect(() => {
    loadBorders().then(setBorders, () => setBorders(null));
  }, []);

  // Перерисовка при смене изображений/данных
  useEffect(() => {
    dirtyRef.current = true;
  }, [day, night, borders]);
  useEffect(
    () =>
      useAppStore.subscribe((s, p) => {
        if (s.body !== p.body || s.layers !== p.layers || s.orbit !== p.orbit || s.revsBack !== p.revsBack || s.revsForward !== p.revsForward) dirtyRef.current = true;
      }),
    [],
  );

  // Размер холста и масштабирование колесом/перетаскиванием (d3-zoom)
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const z = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, MAX_ZOOM])
      .on('zoom', (e: { transform: ZoomTransform }) => {
        transformRef.current = e.transform;
        dirtyRef.current = true;
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
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      sizeRef.current = { w: width, h: height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      applyExtent();
      select(canvas).call(z.transform, transformRef.current); // ограничить сдвиг после изменения размера
      dirtyRef.current = true;
    });
    ro.observe(wrap);
    select(canvas).call(z).on('dblclick.zoom', null);
    return () => {
      ro.disconnect();
      select(canvas).on('.zoom', null);
    };
  }, []);

  // Цикл отрисовки
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const masks = createNightMasks();
    const lights = document.createElement('canvas');
    const trackCache = new TrackCache();
    let lastSub = { lat: NaN, lon: NaN };
    let lastMaskAt = 0;
    let lightsKey = '';
    let lastTime = NaN;
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const st = useAppStore.getState();
      const { w, h, dpr } = sizeRef.current;
      if (w === 0 || h === 0) return;
      if (st.simTime === lastTime && !dirtyRef.current) return;
      lastTime = st.simTime;
      dirtyRef.current = false;

      const t = transformRef.current;
      const { s0, ox0, oy0 } = baseFit(w, h);
      const view: View = { s: s0 * t.k, ox: t.x + t.k * ox0, oy: t.y + t.k * oy0, w, h, dpr, k: t.k };

      // Маски ночи пересчитываются, когда Солнце сместилось больше чем на 0,05°
      // Подсолнечная точка на текущем теле: направление на Солнце → вращающаяся система тела
      const b = BODIES[st.body];
      const sunGeo = greenwichToGeo(b.toFixed(b.sunDirection(st.simTime), st.simTime), 0);
      const subRad = { lat: sunGeo.lat, lon: sunGeo.lon };
      const sub = { lat: subRad.lat * RAD, lon: subRad.lon * RAD };
      // (при быстрой перемотке — не чаще 20 раз в секунду)
      let masksChanged = false;
      const nowMs = performance.now();
      const moved = !(Math.abs(sub.lat - lastSub.lat) < 0.05 && Math.abs(sub.lon - lastSub.lon) < 0.05);
      if (moved && (nowMs - lastMaskAt > 50 || Number.isNaN(lastSub.lat))) {
        updateNightMasks(masks, subRad);
        lastSub = sub;
        lastMaskAt = nowMs;
        masksChanged = true;
      }

      // Слой огней городов = ночной снимок × маска; пересобирается при изменении вида или маски
      const key = `${canvas.width}x${canvas.height}|${view.s}|${view.ox}|${view.oy}|${night?.src}`;
      const earth = st.body === 'earth';
      if (earth && night && st.layers.night && (masksChanged || key !== lightsKey)) {
        lightsKey = key;
        lights.width = canvas.width;
        lights.height = canvas.height;
        const lctx = lights.getContext('2d')!;
        lctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
        lctx.globalCompositeOperation = 'source-over';
        lctx.imageSmoothingQuality = 'high';
        lctx.drawImage(night, 0, 0, 360, 180);
        lctx.globalCompositeOperation = 'destination-in';
        lctx.drawImage(masks.lights, 0, 0, 360, 180);
      }

      const o = st.orbit;
      const track = o ? trackCache.get(orbitSource(o), st.simTime, st.revsBack, st.revsForward) : null;
      // Витки: границы — восходящие узлы; подписи ставятся в начале каждого следующего витка
      const revs = o ? new Revolutions(o, st.simTime, st.revsBack, st.revsForward) : null;
      const windowEnd = st.simTime + st.revsForward * (o?.T ?? 0) * 1000;
      const nodePoints =
        revs && o
          ? revs.nodes
              .filter((n) => n > st.simTime && n <= windowEnd)
              .map((n) => ({ offset: revs.offsetAt(n), point: orbitSource(o).at(n)! }))
          : [];
      const title = st.record ? satelliteTitle(st.record.elements).title : '';
      renderMap(ctx, {
        view,
        layers: st.layers,
        day,
        night,
        // Границы, ночные огни — только у Земли
        borders: earth ? borders : null,
        masks,
        lightsLayer: earth && night ? lights : null,
        subsolar: sub,
        track,
        visibilityBeta: track ? visibilityAngle(track.current.h, 0, b.radius) : 0,
        satLabel: track ? `${title}, ${fmt(track.current.h, 0)} км` : '',
        revs,
        nodePoints,
        cities: PLACES[st.body],
        regions: st.layers.regions ? REGIONS[st.body] : [],
        bodyRadius: b.radius,
        hoverCity: hoverRef.current,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [day, night, borders]);

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
      coordsRef.current.textContent = Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? `${fmtLat(lat, 2)}   ${fmtLon(lon, 2)}` : '';
    }
    let best: City | null = null;
    let bestD = 10;
    for (const c of PLACES[useAppStore.getState().body]) {
      const [cx, cy] = toScreen(view, c.lon, c.lat);
      const d = Math.hypot(cx - sx, cy - sy);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best !== hoverRef.current) {
      hoverRef.current = best;
      dirtyRef.current = true;
    }
  };

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current!;
    if (zoomRef.current) select(canvas).transition().duration(250).call(zoomRef.current.scaleBy, factor);
  };
  const resetZoom = () => {
    const canvas = canvasRef.current!;
    if (zoomRef.current) select(canvas).transition().duration(300).call(zoomRef.current.transform, zoomIdentity);
  };
  const centerOnSatellite = () => {
    const st = useAppStore.getState();
    if (!st.orbit || !zoomRef.current) return;
    const tr = orbitSource(st.orbit).at(st.simTime)!;
    const { w, h } = sizeRef.current;
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
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          hoverRef.current = null;
          dirtyRef.current = true;
          if (coordsRef.current) coordsRef.current.textContent = '';
        }}
        aria-label="Карта мира с трассой спутника"
        role="img"
      />
      <div className={styles.toolbar}>
        <LayersMenu keys={body === 'earth' ? ['imagery', 'night', 'borders', 'grid', 'cities', 'visibility'] : ['regions', 'imagery', 'night', 'grid', 'cities', 'visibility']}>
          <RevsControl />
        </LayersMenu>
        <div className={styles.zoom}>
          <button type="button" onClick={() => zoomBy(1.6)} aria-label="Приблизить" title="Приблизить">
            <Plus size={16} />
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.6)} aria-label="Отдалить" title="Отдалить">
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
      <Legend />
      <div className={styles.footer}>
        <span ref={coordsRef} className={`${styles.coords} num`} />
        <span className={styles.credit}>{SURFACE_CREDIT[body]}</span>
      </div>
    </div>
  );
}

/** Условные обозначения: цвета витков (сколько показано вперёд), прочие значки. */
function Legend() {
  const forward = useAppStore((s) => s.revsForward);
  const revs = Array.from({ length: Math.min(forward, 3) }, (_, k) => k + 1);
  const line = (color: string, dashed: boolean, opacity = 1) => (
    <svg width="22" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="21" y2="4" stroke={color} strokeOpacity={opacity} strokeWidth="2" strokeDasharray={dashed ? '5 3' : undefined} />
    </svg>
  );
  return (
    <ul className={styles.legend} aria-label="Условные обозначения">
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
          <circle cx="7" cy="7" r="5.5" fill="rgb(255 181 71 / 0.15)" stroke="var(--sat)" strokeDasharray="3 2" />
        </svg>
        зона видимости
      </li>
      <li>
        <svg width="14" height="14" aria-hidden="true">
          <circle cx="7" cy="7" r="3.5" fill="var(--sun)" />
        </svg>
        Солнце в зените
      </li>
    </ul>
  );
}
