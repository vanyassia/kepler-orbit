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
  Quaternion,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { CITIES } from '../../data/cities';
import { visibilityAngle } from '../../physics/groundTrack';
import { orbitEllipse, positionAtTrueAnomaly, propagate } from '../../physics/propagate';
import { sunDirectionInertial } from '../../physics/sun';
import { greenwichSiderealTime } from '../../physics/time';
import { useAppStore } from '../../state/store';
import { fmt, revsLabel } from '../../ui/format';
import { satelliteTitle } from '../../ui/satelliteTitle';
import { TrackCache } from '../trackCache';
import { geoToLocal, toScene } from './coords';
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
  const tex = useEarthTextures(quality, gl);

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
        },
      }),
      clouds: new ShaderMaterial({ ...cloudsShader, uniforms: { cloudsMap, sunDir, cloudShift }, transparent: true, depthWrite: false }),
      atmosphere: new ShaderMaterial({
        ...atmosphereShader,
        uniforms: { sunDir },
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    };
  }, []);

  const lines = useMemo(
    () => ({
      past: new DynamicLine(6000, lineMaterial(ORBIT_COLOR, 1.6, 0.55)),
      future: new DynamicLine(6000, lineMaterial(ORBIT_COLOR, 1.8, 0.95, true)),
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

  // Подстановка загруженных текстур
  useEffect(() => {
    const u = mats.earth.uniforms;
    if (tex.day) u.dayMap.value = tex.day;
    if (tex.night) u.nightMap.value = tex.night;
    if (tex.normal) u.normalMap.value = tex.normal;
    if (tex.specular) u.specMap.value = tex.specular;
    if (tex.clouds) u.cloudsMap.value = tex.clouds;
  }, [tex.day, tex.night, tex.normal, tex.specular, tex.clouds, mats]);

  // Глобус готов, когда загружен хотя бы первый (лёгкий) дневной снимок
  useEffect(() => {
    if (tex.day) onReady?.();
  }, [tex.day, onReady]);

  useEffect(() => {
    mats.earth.uniforms.cloudsOn.value = layers.clouds ? 1 : 0;
    mats.earth.uniforms.nightOn.value = layers.night ? 1 : 0;
  }, [layers.clouds, layers.night, mats]);

  // Статичные элементы орбиты (в АГЭСК эллипс неподвижен)
  const geometry = useMemo(() => {
    if (!orbit) return null;
    const pts = orbitEllipse(orbit, 360).map((p) => toScene(p));
    const at = (theta: number) => toScene(positionAtTrueAnomaly(orbit, theta));
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
      // Концы окна трассы (положения маркеров обновляются каждый кадр)
      if (revsBack > 0) {
        specs.push({ id: 'track-start', text: `−${revsLabel(revsBack)}`, className: 'globe-label helper', anchor: (out) => out.setFromMatrixPosition(startMarker.current.matrixWorld) });
      }
      specs.push({ id: 'track-end', text: `+${revsLabel(revsForward)}`, className: 'globe-label helper', anchor: (out) => out.setFromMatrixPosition(endMarker.current.matrixWorld) });
    }
    if (layers.cities) {
      for (const c of CITIES.filter((x) => x.highlight)) {
        specs.push({ id: `city-${c.name}`, text: c.name, className: `globe-label ru${c.labelSide === 'left' ? ' left' : ''}`, anchor: onEarth(geoToLocal(c.lat, c.lon, 1.001)) });
      }
    }
    if (layers.helpers && geometry && orbit) {
      specs.push({ id: 'aries', text: '♈ ось x', className: 'globe-label helper', anchor: fixed(new Vector3(1.95, 0, 0)) });
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
  }, [orbit, record, geometry, layers.cities, layers.helpers, revsBack, revsForward]);

  // Плавная перестановка камеры при выборе нового спутника
  const camAnim = useRef<{ from: Vector3; to: Vector3; start: number } | null>(null);
  useEffect(() => {
    if (!orbit || !geometry) return;
    const s = propagate(orbit, useAppStore.getState().simTime);
    const satDir = toScene(s.eci).normalize();
    const dist = Math.min(26, Math.max(3.4, (orbit.rApogee / 6371) * 2.3 + 0.8));
    // Камера сбоку от спутника, чуть выше плоскости экватора — видны и Земля, и плоскость орбиты
    const dir = satDir.clone().add(new Vector3(0, 0.35, 0)).normalize();
    camAnim.current = { from: camera.position.clone(), to: dir.multiplyScalar(dist), start: performance.now() };
  }, [orbit, geometry, camera]);

  const prevSatDir = useRef(new Vector3());
  const prevS = useRef<number | null>(null);
  const lastLabelUpdate = useRef(0);
  const buf = useMemo(() => ({ past: new Float32Array(6000 * 3), future: new Float32Array(6000 * 3), ring: new Float32Array(130 * 3) }), []);
  const tmp = useMemo(() => ({ v: new Vector3(), w: new Vector3(), q: new Quaternion(), axisY: new Vector3(0, 1, 0) }), []);

  useFrame(() => {
    const st = useAppStore.getState();
    const t = st.simTime;
    const S = greenwichSiderealTime(t);
    earthGroup.current.rotation.y = S;

    const sd = sunDirectionInertial(t);
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
      const satPos = toScene(s.eci, tmp.v);
      satGroup.current.position.copy(satPos);
      const dir = tmp.w.copy(satPos).normalize();

      // Режимы камеры: за спутником / вместе с Землёй
      if (!anim) {
        if (st.camera === 'follow' && prevSatDir.current.lengthSq() > 0) {
          tmp.q.setFromUnitVectors(prevSatDir.current, dir);
          camera.position.applyQuaternion(tmp.q);
        } else if (st.camera === 'earth' && prevS.current !== null) {
          tmp.q.setFromAxisAngle(tmp.axisY, S - prevS.current);
          camera.position.applyQuaternion(tmp.q);
        }
        if (st.camera !== 'free') controls?.update();
      }
      prevSatDir.current.copy(dir);
      prevS.current = S;

      // Радиус-вектор r: от центра Земли к спутнику
      lines.radius.setPoints([0, 0, 0, satPos.x, satPos.y, satPos.z], 2);

      // Трасса (в ГСК, внутри группы Земли)
      const w = trackCache.get(o, t, st.revsBack, st.revsForward);
      const fill = (pts: typeof w.past, arr: Float32Array) => {
        const n = Math.min(pts.length, 6000);
        for (let k = 0; k < n; k++) {
          geoToLocal(pts[k].lat, pts[k].lon, TRACK_R, tmp.v);
          arr[k * 3] = tmp.v.x;
          arr[k * 3 + 1] = tmp.v.y;
          arr[k * 3 + 2] = tmp.v.z;
        }
        return n;
      };
      lines.past.setPoints(buf.past, fill(w.past, buf.past));
      lines.future.setPoints(buf.future, fill(w.future, buf.future));
      const first = w.past[0];
      const last = w.future[w.future.length - 1];
      geoToLocal(first.lat, first.lon, TRACK_R, startMarker.current.position);
      geoToLocal(last.lat, last.lon, TRACK_R, endMarker.current.position);
      startMarker.current.visible = st.revsBack > 0;

      // Подспутниковая точка и окружность зоны радиовидимости радиуса β
      const c = geoToLocal(w.current.lat, w.current.lon, 1, new Vector3());
      subMarker.current.position.copy(c).multiplyScalar(1.003);
      const beta = visibilityAngle(w.current.h);
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
      }
    }

    if (!labelLayer.current && overlay.current) {
      labelLayer.current = new LabelLayer(overlay.current);
      labelLayer.current.setSpecs(labelSpecs.current);
    }
    labelLayer.current?.update(camera, size.width, size.height);
  });

  const ruCities = CITIES.filter((c) => c.highlight);
  const capitals = CITIES.filter((c) => !c.highlight);

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
        {layers.clouds && (
          <mesh material={mats.clouds} renderOrder={2}>
            <sphereGeometry args={[1.006, 192, 96]} />
          </mesh>
        )}
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
      <mesh material={mats.atmosphere}>
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
