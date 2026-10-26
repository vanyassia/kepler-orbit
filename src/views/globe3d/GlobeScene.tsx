/**
 * Сцена 3D-вида.
 *  - Корень сцены — АГЭСК: орбита (неподвижный эллипс задачи двух тел), спутник, Солнце, звёзды.
 *  - Группа «Земля» повёрнута на звёздное время S: внутри неё ГСК — текстура, трасса, города.
 */
import { Line, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import type { Group, Mesh, Sprite } from 'three';
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DataTexture,
  Matrix4,
  Quaternion,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PLACES } from '../../data/landmarks';
import type { BodyId, CentralBody } from '../../physics/bodies';
import { BODIES } from '../../physics/bodies';
import { visibilityAngle } from '../../physics/groundTrack';
import { orbitEllipse, positionAtTrueAnomaly, propagate } from '../../physics/propagate';
import { useAppStore } from '../../state/store';
import { fmt, fmtDuration } from '../../ui/format';
import { satelliteTitle } from '../../ui/satelliteTitle';
import type { TrackWindow } from '../trackCache';
import { orbitSource, referenceSource, REFERENCE_COLOR, Revolutions, revolutionColor, TrackCache } from '../trackCache';
import { referenceState } from '../../reference/sgp4';
import { axisToScene, geoToLocal, toScene } from './coords';
import { DynamicLine } from './DynamicLine';
import type { LabelSpec } from './LabelLayer';
import { LabelLayer } from './LabelLayer';
import { atmosphereShader, cloudsShader, earthShader } from './shaders';
import { useEarthTextures } from './textures';

const ORBIT_COLOR = '#46d6ff';
const SAT_COLOR = '#ffb547';
const TRACK_R = 1.0025;

/** Текстура 1×1 заданного цвета — заглушка до загрузки изображений. */
function solid(r: number, g: number, b: number) {
  const t = new DataTexture(new Uint8Array([r, g, b, 255]), 1, 1, RGBAFormat);
  t.needsUpdate = true;
  return t;
}

/** Мягкое круглое пятно для спрайтов (спутник, Солнце). */
function glowTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.18, inner);
  g.addColorStop(0.45, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Внешний вид тела на глобусе: дымка у края, сумерки, свечение атмосферы. */
const LOOK: Record<BodyId, { haze: [number, number, number]; hazeStrength: number; dusk: number; nightAmbient: number; atmo: [number, number, number] | null }> = {
  earth: { haze: [0.42, 0.66, 1.0], hazeStrength: 0.65, dusk: 1, nightAmbient: 0, atmo: [0.3, 0.58, 1.0] },
  moon: { haze: [0, 0, 0], hazeStrength: 0, dusk: 0, nightAmbient: 0.07, atmo: null },
  mars: { haze: [0.95, 0.62, 0.42], hazeStrength: 0.28, dusk: 0.5, nightAmbient: 0.06, atmo: [0.62, 0.36, 0.22] },
};

const _m = new Matrix4();
const _ex = new Vector3();
const _ey = new Vector3();
const _ez = new Vector3();

/**
 * Ориентация шара тела в сцене: столбцы матрицы — оси вращающейся системы тела,
 * выраженные в инерциальной системе (формулы (12) и (20)). Для Земли и Луны это
 * поворот на S или W вокруг полюса, для Марса — ещё и поправка между полюсами IAU 2015/2009.
 */
function orientationOf(body: CentralBody, t: number, out: Quaternion): Quaternion {
  axisToScene(body.toInertial({ x: 1, y: 0, z: 0 }, t), _ex);
  axisToScene(body.toInertial({ x: 0, y: 0, z: 1 }, t), _ey);
  axisToScene(body.toInertial({ x: 0, y: -1, z: 0 }, t), _ez);
  return out.setFromRotationMatrix(_m.makeBasis(_ex, _ey, _ez));
}

function lineMaterial(color: string, width: number, opacity: number, dashed = false) {
  const m = new LineMaterial({ color: new Color(color).getHex(), linewidth: width, transparent: opacity < 1, opacity, dashed });
  if (dashed) {
    m.dashSize = 0.022;
    m.gapSize = 0.016;
  }
  return m;
}

export function GlobeScene({ overlay, onReady }: { overlay: React.RefObject<HTMLDivElement | null>; onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as OrbitControlsImpl | null;
  const size = useThree((s) => s.size);

  const orbit = useAppStore((s) => s.orbit);
  const record = useAppStore((s) => s.record);
  const layers = useAppStore((s) => s.layers);
  const quality = useAppStore((s) => s.quality);
  const revsBack = useAppStore((s) => s.revsBack);
  const revsForward = useAppStore((s) => s.revsForward);
  const bodyId = useAppStore((s) => s.body);
  const tex = useEarthTextures(quality, gl, bodyId);

  const earthGroup = useRef<Group>(null!);
  const satGroup = useRef<Group>(null!);
  const sunSprite = useRef<Sprite>(null!);
  const subMarker = useRef<Mesh>(null!);
  const startMarker = useRef<Mesh>(null!);
  const endMarker = useRef<Mesh>(null!);
  const labelLayer = useRef<LabelLayer | null>(null);

  // Материалы с шейдерами и динамические линии создаются один раз
  const mats = useMemo(() => {
    const sunDir = { value: new Vector3(1, 0, 0) };
    const cloudShift = { value: 0 };
    const cloudsMap = { value: solid(0, 0, 0) };
    return {
      earth: new ShaderMaterial({
        ...earthShader,
        uniforms: {
          dayMap: { value: solid(14, 32, 60) },
          nightMap: { value: solid(0, 0, 0) },
          normalMap: { value: solid(128, 128, 255) },
          specMap: { value: solid(0, 0, 0) },
          cloudsMap,
          sunDir,
          cloudShift,
          cloudsOn: { value: 1 },
          nightOn: { value: 1 },
          normalStrength: { value: 0.9 },
          hazeColor: { value: new Vector3(0.42, 0.66, 1.0) },
          hazeStrength: { value: 0.65 },
          duskStrength: { value: 1 },
          nightAmbient: { value: 0 },
        },
      }),
      clouds: new ShaderMaterial({ ...cloudsShader, uniforms: { cloudsMap, sunDir, cloudShift }, transparent: true, depthWrite: false }),
      atmosphere: new ShaderMaterial({
        ...atmosphereShader,
        uniforms: { sunDir, atmoColor: { value: new Vector3(0.3, 0.58, 1.0) } },
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    };
  }, []);

  const lines = useMemo(
    () => ({
      past: new DynamicLine(6000, lineMaterial(ORBIT_COLOR, 1.6, 0.6)),
      future: new DynamicLine(6000, lineMaterial(ORBIT_COLOR, 1.8, 0.95, true)),
      refPast: new DynamicLine(6000, lineMaterial(REFERENCE_COLOR, 1.2, 0.5)),
      refFuture: new DynamicLine(6000, lineMaterial(REFERENCE_COLOR, 1.3, 0.9, true)),
      refLink: new DynamicLine(2, lineMaterial(REFERENCE_COLOR, 1.2, 0.8)),
      visibility: new DynamicLine(130, lineMaterial(SAT_COLOR, 1.3, 0.85)),
      radius: new DynamicLine(2, lineMaterial(SAT_COLOR, 1, 0.45)),
    }),
    [],
  );
  const sprites = useMemo(
    () => ({
      sat: glowTexture('rgba(255,236,200,1)', 'rgba(255,181,71,0.45)'),
      sun: glowTexture('rgba(255,250,235,1)', 'rgba(255,200,110,0.35)'),
    }),
    [],
  );
  const trackCache = useMemo(() => new TrackCache(), []);
  const refCache = useMemo(() => new TrackCache(), []);
  const refGroup = useRef<Group>(null!);
  const refOn = useAppStore((s) => s.layers.reference && !!s.reference);
  /** Начала следующих витков (в ГСК) — для подписей «+k»; null — узла нет в окне. */
  const nodeLocal = useRef<(Vector3 | null)[]>([]);

  // Подстановка загруженных текстур; огни городов, океаны, рельеф и облака — только у Земли
  const blank = useMemo(() => ({ black: solid(0, 0, 0), flat: solid(128, 128, 255) }), []);
  useEffect(() => {
    const u = mats.earth.uniforms;
    const earth = bodyId === 'earth';
    if (tex.day) u.dayMap.value = tex.day;
    u.nightMap.value = earth && tex.night ? tex.night : blank.black;
    u.normalMap.value = earth && tex.normal ? tex.normal : blank.flat;
    u.specMap.value = earth && tex.specular ? tex.specular : blank.black;
    if (tex.clouds) u.cloudsMap.value = tex.clouds;
    const look = LOOK[bodyId];
    u.hazeColor.value.set(...look.haze);
    u.hazeStrength.value = look.hazeStrength;
    u.duskStrength.value = look.dusk;
    u.nightAmbient.value = look.nightAmbient;
    if (look.atmo) mats.atmosphere.uniforms.atmoColor.value.set(...look.atmo);
  }, [tex.day, tex.night, tex.normal, tex.specular, tex.clouds, mats, bodyId, blank]);

  // Глобус готов, когда загружен хотя бы первый (лёгкий) дневной снимок
  useEffect(() => {
    if (tex.day) onReady?.();
  }, [tex.day, onReady]);

  useEffect(() => {
    mats.earth.uniforms.cloudsOn.value = layers.clouds && bodyId === 'earth' ? 1 : 0;
    mats.earth.uniforms.nightOn.value = layers.night ? 1 : 0;
  }, [layers.clouds, layers.night, mats, bodyId]);

  // Статичные элементы орбиты (в АГЭСК эллипс неподвижен)
  const geometry = useMemo(() => {
    if (!orbit) return null;
    const R = orbit.body.radius;
    const pts = orbitEllipse(orbit, 360).map((p) => toScene(p, new Vector3(), R));
    const at = (theta: number) => toScene(positionAtTrueAnomaly(orbit, theta), new Vector3(), R);
    return {
      ellipse: pts,
      ascNode: at(-orbit.omega),
      descNode: at(Math.PI - orbit.omega),
      perigee: at(0),
      apogee: at(Math.PI),
      normal: new Vector3(Math.sin(orbit.raan) * Math.sin(orbit.i), Math.cos(orbit.i), Math.cos(orbit.raan) * Math.sin(orbit.i)).normalize(),
    };
  }, [orbit]);

  const equator = useMemo(() => Array.from({ length: 181 }, (_, k) => new Vector3(Math.cos((k * 2 * Math.PI) / 180) * 1.0015, 0, Math.sin((k * 2 * Math.PI) / 180) * 1.0015)), []);

  // Подписи: слой DOM поверх холста. Создаётся в цикле кадра, когда контейнер уже в документе
  // (дочерние элементы <Canvas> монтируются отдельным реконсилером, порядок эффектов не гарантирован).
  const labelSpecs = useRef<LabelSpec[]>([]);
  useEffect(
    () => () => {
      labelLayer.current?.dispose();
      labelLayer.current = null;
    },
    [],
  );

  useEffect(() => {
    const specs: LabelSpec[] = [];
    const fixed = (v: Vector3) => (out: Vector3) => out.copy(v);
    const onEarth = (v: Vector3) => (out: Vector3) => earthGroup.current.localToWorld(out.copy(v));
    if (orbit) {
      specs.push({ id: 'sat', text: record ? satelliteTitle(record.elements).title : '', className: 'globe-label sat', anchor: (out) => out.copy(satGroup.current.position) });
    }
    if (orbit) {
      // Концы окна трассы (положения маркеров и время обновляются каждый кадр)
      if (revsBack > 0) {
        specs.push({ id: 'track-start', text: '', className: 'globe-label helper', anchor: (out) => out.setFromMatrixPosition(startMarker.current.matrixWorld) });
      }
      specs.push({ id: 'track-end', text: '', className: 'globe-label helper', anchor: (out) => out.setFromMatrixPosition(endMarker.current.matrixWorld) });
      // Начала следующих витков
      for (let k = 1; k <= revsForward; k++) {
        specs.push({
          id: `node-${k}`,
          text: `+${k}`,
          className: `globe-label node node-${k}`,
          anchor: (out) => {
            const p = nodeLocal.current[k];
            return p ? earthGroup.current.localToWorld(out.copy(p)) : null;
          },
        });
      }
      if (refOn) specs.push({ id: 'ref', text: 'SGP4', className: 'globe-label ref', anchor: (out) => (refGroup.current?.visible ? out.copy(refGroup.current.position) : null) });
    }
    if (layers.cities) {
      for (const c of PLACES[bodyId].filter((x) => x.highlight)) {
        specs.push({ id: `city-${c.name}`, text: c.name, className: `globe-label ru${c.labelSide === 'left' ? ' left' : ''}`, anchor: onEarth(geoToLocal(c.lat, c.lon, 1.001)) });
      }
    }
    if (layers.helpers && geometry && orbit) {
      specs.push({ id: 'aries', text: bodyId === 'earth' ? '♈ ось x' : 'ось x — узел экватора', className: 'globe-label helper', anchor: fixed(new Vector3(1.95, 0, 0)) });
      specs.push({ id: 'pole', text: 'ось z', className: 'globe-label helper', anchor: fixed(new Vector3(0, 1.5, 0)) });
      specs.push({ id: 'asc', text: '☊ восходящий узел', className: 'globe-label helper', anchor: fixed(geometry.ascNode) });
      specs.push({ id: 'desc', text: '☋', className: 'globe-label helper', anchor: fixed(geometry.descNode) });
      if (orbit.e > 0.01) {
        specs.push({ id: 'peri', text: 'перигей', className: 'globe-label helper', anchor: fixed(geometry.perigee) });
        specs.push({ id: 'apo', text: 'апогей', className: 'globe-label helper', anchor: fixed(geometry.apogee) });
      }
    }
    labelSpecs.current = specs;
    labelLayer.current?.setSpecs(specs);
  }, [orbit, record, geometry, layers.cities, layers.helpers, revsBack, revsForward, refOn, bodyId]);

  // Плавная перестановка камеры при выборе нового спутника
  const camAnim = useRef<{ from: Vector3; to: Vector3; start: number } | null>(null);
  useEffect(() => {
    if (!orbit || !geometry) return;
    const s = propagate(orbit, useAppStore.getState().simTime);
    const satDir = toScene(s.eci, new Vector3(), orbit.body.radius).normalize();
    const dist = Math.min(26, Math.max(3.4, (orbit.rApogee / orbit.body.radius) * 2.3 + 0.8));
    // Камера сбоку от спутника, чуть выше плоскости экватора — видны и Земля, и плоскость орбиты
    const dir = satDir.clone().add(new Vector3(0, 0.35, 0)).normalize();
    camAnim.current = { from: camera.position.clone(), to: dir.multiplyScalar(dist), start: performance.now() };
  }, [orbit, geometry, camera]);

  const prevSatDir = useRef(new Vector3());
  const prevQ = useRef<Quaternion | null>(null);
  const lastLabelUpdate = useRef(0);
  const buf = useMemo(
    () => ({
      past: new Float32Array(6000 * 3),
      future: new Float32Array(6000 * 3),
      pastRgb: new Float32Array(6000 * 3),
      futureRgb: new Float32Array(6000 * 3),
      refPast: new Float32Array(6000 * 3),
      refFuture: new Float32Array(6000 * 3),
      ring: new Float32Array(130 * 3),
    }),
    [],
  );
  /** Цвета витков в линейном пространстве (для цветов вершин линии). */
  const revColor = useMemo(() => {
    const cache = new Map<number, Color>();
    return (offset: number) => {
      const key = offset < 0 ? -1 : offset;
      let c = cache.get(key);
      if (!c) cache.set(key, (c = new Color(revolutionColor(key))));
      return c;
    };
  }, []);
  const tmp = useMemo(() => ({ v: new Vector3(), w: new Vector3(), q: new Quaternion(), q2: new Quaternion() }), []);

  useFrame(() => {
    const st = useAppStore.getState();
    const t = st.simTime;
    const b = BODIES[st.body];
    // Шар тела повёрнут из инерциальной системы во вращающуюся (S или W, для Марса — с поправкой полюса)
    const orient = orientationOf(b, t, tmp.q2);
    earthGroup.current.quaternion.copy(orient);

    const sd = b.sunDirection(t);
    mats.earth.uniforms.sunDir.value.set(sd.x, sd.z, -sd.y);
    mats.earth.uniforms.cloudShift.value = -((t / 86_400_000) * 0.02) % 1;
    sunSprite.current.position.set(sd.x * 420, sd.z * 420, -sd.y * 420);

    // Анимация камеры к новому спутнику
    const anim = camAnim.current;
    if (anim) {
      const k = Math.min(1, (performance.now() - anim.start) / 1100);
      const e = 1 - Math.pow(1 - k, 3);
      const fromLen = anim.from.length();
      const toLen = anim.to.length();
      tmp.v.copy(anim.from).normalize().lerp(tmp.w.copy(anim.to).normalize(), e).normalize();
      camera.position.copy(tmp.v.multiplyScalar(fromLen + (toLen - fromLen) * e));
      camera.lookAt(0, 0, 0);
      if (k >= 1) camAnim.current = null;
    }

    const o = st.orbit;
    if (o) {
      const s = propagate(o, t);
      const satPos = toScene(s.eci, tmp.v, b.radius);
      satGroup.current.position.copy(satPos);
      const dir = tmp.w.copy(satPos).normalize();

      // Режимы камеры: за спутником / вместе с Землёй
      if (!anim) {
        if (st.camera === 'follow' && prevSatDir.current.lengthSq() > 0) {
          tmp.q.setFromUnitVectors(prevSatDir.current, dir);
          camera.position.applyQuaternion(tmp.q);
        } else if (st.camera === 'earth' && prevQ.current) {
          // Поворот тела за кадр: q_тек · q_пред⁻¹
          tmp.q.copy(orient).multiply(prevQ.current.clone().invert());
          camera.position.applyQuaternion(tmp.q);
        }
        if (st.camera !== 'free') controls?.update();
      }
      prevSatDir.current.copy(dir);
      prevQ.current = (prevQ.current ?? new Quaternion()).copy(orient);

      // Радиус-вектор r: от центра Земли к спутнику
      lines.radius.setPoints([0, 0, 0, satPos.x, satPos.y, satPos.z], 2);

      // Трасса (в ГСК, внутри группы Земли), цвет — по номеру витка
      const w = trackCache.get(orbitSource(o), t, st.revsBack, st.revsForward)!;
      const revs = new Revolutions(o, t, st.revsBack, st.revsForward);
      const fill = (pts: TrackWindow['past'], arr: Float32Array, rgb?: Float32Array) => {
        const n = Math.min(pts.length, 6000);
        for (let k = 0; k < n; k++) {
          geoToLocal(pts[k].lat, pts[k].lon, TRACK_R, tmp.v);
          arr[k * 3] = tmp.v.x;
          arr[k * 3 + 1] = tmp.v.y;
          arr[k * 3 + 2] = tmp.v.z;
          if (rgb) {
            const c = revColor(revs.offsetAt(pts[k].timeMs));
            rgb[k * 3] = c.r;
            rgb[k * 3 + 1] = c.g;
            rgb[k * 3 + 2] = c.b;
          }
        }
        return n;
      };
      lines.past.setPoints(buf.past, fill(w.past, buf.past, buf.pastRgb), buf.pastRgb);
      lines.future.setPoints(buf.future, fill(w.future, buf.future, buf.futureRgb), buf.futureRgb);
      const first = w.past[0];
      const last = w.future[w.future.length - 1];
      geoToLocal(first.lat, first.lon, TRACK_R, startMarker.current.position);
      geoToLocal(last.lat, last.lon, TRACK_R, endMarker.current.position);
      startMarker.current.visible = st.revsBack > 0;

      // Начала следующих витков: точные подспутниковые точки в моменты восходящих узлов
      const windowEnd = t + st.revsForward * o.T * 1000;
      nodeLocal.current = [];
      for (const n of revs.nodes) {
        if (n <= t || n > windowEnd) continue;
        const p = orbitSource(o).at(n)!;
        nodeLocal.current[revs.offsetAt(n)] = geoToLocal(p.lat, p.lon, TRACK_R);
      }

      // Эталон SGP4: трасса, положение и связка с нашим спутником
      const ref = st.layers.reference && st.reference ? st.reference : null;
      const rw = ref ? refCache.get(referenceSource(ref, o), t, st.revsBack, st.revsForward) : null;
      const rs = ref ? referenceState(ref, t) : null;
      lines.refPast.visible = lines.refFuture.visible = lines.refLink.visible = !!(rw && rs);
      refGroup.current.visible = !!(rw && rs);
      if (rw && rs) {
        lines.refPast.setPoints(buf.refPast, fill(rw.past, buf.refPast));
        lines.refFuture.setPoints(buf.refFuture, fill(rw.future, buf.refFuture));
        const rp = toScene(rs.eci, tmp.w, b.radius);
        refGroup.current.position.copy(rp);
        lines.refLink.setPoints([satPos.x, satPos.y, satPos.z, rp.x, rp.y, rp.z], 2);
      }

      // Подспутниковая точка и окружность зоны радиовидимости радиуса β
      const c = geoToLocal(w.current.lat, w.current.lon, 1, new Vector3());
      subMarker.current.position.copy(c).multiplyScalar(1.003);
      const beta = visibilityAngle(w.current.h, 0, b.radius);
      const e1 = new Vector3(0, 1, 0).cross(c);
      if (e1.lengthSq() < 1e-8) e1.set(1, 0, 0);
      e1.normalize();
      const e2 = new Vector3().crossVectors(c, e1).normalize();
      for (let k = 0; k <= 128; k++) {
        const a = (k / 128) * Math.PI * 2;
        const ca = Math.cos(a) * Math.sin(beta);
        const sa = Math.sin(a) * Math.sin(beta);
        const cb = Math.cos(beta);
        buf.ring[k * 3] = (c.x * cb + e1.x * ca + e2.x * sa) * TRACK_R;
        buf.ring[k * 3 + 1] = (c.y * cb + e1.y * ca + e2.y * sa) * TRACK_R;
        buf.ring[k * 3 + 2] = (c.z * cb + e1.z * ca + e2.z * sa) * TRACK_R;
      }
      lines.visibility.setPoints(buf.ring, 129);

      // Подпись спутника (10 раз в секунду)
      const now = performance.now();
      if (now - lastLabelUpdate.current > 100) {
        lastLabelUpdate.current = now;
        const title = st.record ? satelliteTitle(st.record.elements).title : '';
        labelLayer.current?.setText('sat', `${title}, ${fmt(s.h, 0)} км`);
        labelLayer.current?.setText('track-start', `−${fmtDuration((t - first.timeMs) / 1000)}`);
        labelLayer.current?.setText('track-end', `+${fmtDuration((last.timeMs - t) / 1000)}`);
      }
    }

    if (!labelLayer.current && overlay.current) {
      labelLayer.current = new LabelLayer(overlay.current);
      labelLayer.current.setSpecs(labelSpecs.current);
    }
    labelLayer.current?.update(camera, size.width, size.height);
  });

  const ruCities = PLACES[bodyId].filter((c) => c.highlight);
  const capitals = PLACES[bodyId].filter((c) => !c.highlight);

  return (
    <>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} enablePan={false} minDistance={1.15} maxDistance={60} rotateSpeed={0.5} zoomSpeed={0.8} />

      {/* Звёздное небо — неподвижно в АГЭСК */}
      {tex.stars && (
        <mesh renderOrder={-10}>
          <sphereGeometry args={[1500, 64, 32]} />
          <meshBasicMaterial map={tex.stars} side={BackSide} depthWrite={false} toneMapped={false} color="#8f8f8f" />
        </mesh>
      )}

      <sprite ref={sunSprite} scale={[60, 60, 1]}>
        <spriteMaterial map={sprites.sun} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </sprite>

      {/* Земля: ГСК, повёрнута на звёздное время S */}
      <group ref={earthGroup}>
        <mesh material={mats.earth}>
          <sphereGeometry args={[1, 256, 256]} />
        </mesh>
        {layers.clouds && bodyId === 'earth' && (
          <mesh material={mats.clouds} renderOrder={2}>
            <sphereGeometry args={[1.006, 192, 96]} />
          </mesh>
        )}
        <primitive object={lines.refPast} />
        <primitive object={lines.refFuture} />
        <primitive object={lines.past} />
        <primitive object={lines.future} />
        <primitive object={lines.visibility} visible={layers.visibility} />
        <mesh ref={startMarker}>
          <sphereGeometry args={[0.005, 12, 8]} />
          <meshBasicMaterial color={ORBIT_COLOR} toneMapped={false} transparent opacity={0.6} />
        </mesh>
        <mesh ref={endMarker}>
          <sphereGeometry args={[0.005, 12, 8]} />
          <meshBasicMaterial color={ORBIT_COLOR} toneMapped={false} />
        </mesh>
        <mesh ref={subMarker}>
          <sphereGeometry args={[0.007, 16, 12]} />
          <meshBasicMaterial color={SAT_COLOR} toneMapped={false} />
        </mesh>

        {layers.cities &&
          capitals.map((c) => (
            <mesh key={c.name} position={geoToLocal(c.lat, c.lon, 1.001)}>
              <sphereGeometry args={[0.0045, 8, 6]} />
              <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
          ))}
        {layers.cities &&
          ruCities.map((c) => {
            const p = geoToLocal(c.lat, c.lon, 1.001);
            return (
              <group key={c.name} position={p}>
                <mesh>
                  <sphereGeometry args={[0.008, 12, 8]} />
                  <meshBasicMaterial color="#ff5d5d" toneMapped={false} />
                </mesh>
              </group>
            );
          })}
      </group>

      {/* Атмосфера (в АГЭСК — сфера, поворот не важен) */}
      <mesh material={mats.atmosphere} visible={!!LOOK[bodyId].atmo}>
        <sphereGeometry args={[1.035, 96, 48]} />
      </mesh>

      {/* Орбита и вспомогательные построения */}
      {geometry && (
        <>
          <Line points={geometry.ellipse} color={ORBIT_COLOR} lineWidth={1.5} transparent opacity={0.85} />
          {layers.helpers && (
            <>
              <Line points={equator} color="#c8dcff" lineWidth={1} transparent opacity={0.28} />
              <Line points={[new Vector3(0, -1.45, 0), new Vector3(0, 1.45, 0)]} color="#c8dcff" lineWidth={1} transparent opacity={0.35} />
              <Line points={[new Vector3(0, 0, 0), new Vector3(1.9, 0, 0)]} color="#ffd27a" lineWidth={1} transparent opacity={0.6} dashed dashSize={0.05} gapSize={0.04} />
              <Line points={[geometry.ascNode, geometry.descNode]} color={ORBIT_COLOR} lineWidth={1} transparent opacity={0.45} dashed dashSize={0.04} gapSize={0.04} />
              {orbit && orbit.e > 0.01 && (
                <Line points={[geometry.perigee, geometry.apogee]} color={SAT_COLOR} lineWidth={1} transparent opacity={0.4} dashed dashSize={0.04} gapSize={0.04} />
              )}
            </>
          )}
        </>
      )}

      {/* Спутник и радиус-вектор */}
      {orbit && (
        <>
          <primitive object={lines.radius} />
          <primitive object={lines.refLink} />
          <group ref={refGroup} visible={false}>
            <mesh>
              <octahedronGeometry args={[0.014, 0]} />
              <meshBasicMaterial color={REFERENCE_COLOR} toneMapped={false} wireframe />
            </mesh>
          </group>
          <group ref={satGroup}>
            <mesh>
              <sphereGeometry args={[0.012, 16, 12]} />
              <meshBasicMaterial color={SAT_COLOR} toneMapped={false} />
            </mesh>
            <sprite scale={[0.07, 0.07, 1]}>
              <spriteMaterial map={sprites.sat} blending={AdditiveBlending} depthWrite={false} sizeAttenuation={false} toneMapped={false} />
            </sprite>
          </group>
        </>
      )}
    </>
  );
}
