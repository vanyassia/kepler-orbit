import { Canvas } from '@react-three/fiber';
import { Earth, Move3d, Satellite, ScanEye } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import type { RootState } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import type { CameraMode } from '../../state/store';
import { useAppStore } from '../../state/store';
import { LayersMenu, RevsControl } from '../../ui/LayersMenu';
import { rovingKeyDown, rovingTabIndex } from '../../ui/roving';
import { LIGHT_DEVICE } from '../assets';
import { registerSnapshot } from '../snapshot';
import { CAMERA_FOV, GlobeScene } from './GlobeScene';
import styles from './GlobeView.module.css';

const CAMERA_MODES: { id: CameraMode; label: string; hint: string; icon: typeof Earth }[] = [
  { id: 'free', label: 'Свободно', hint: 'Камера неподвижна в инерциальной системе (АГЭСК)', icon: Move3d },
  { id: 'follow', label: 'За спутником', hint: 'Камера поворачивается вслед за спутником', icon: Satellite },
  { id: 'earth', label: 'С телом', hint: 'Камера вращается вместе с телом', icon: Earth },
  { id: 'board', label: 'С борта', hint: 'Вид с борта: камера на спутнике смотрит вниз, на подспутниковую точку. Колёсико или щипок — приближение', icon: ScanEye },
];
const CAMERA_IDS = CAMERA_MODES.map((m) => m.id);
const QUALITIES = ['standard', 'ultra'] as const;

/** 3D-вид: глобус, орбита, трасса. Загружается отдельным чанком (three.js). */
export default function GlobeView() {
  const camera = useAppStore((s) => s.camera);
  const setCamera = useAppStore((s) => s.setCamera);
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const body = useAppStore((s) => s.body);
  const withBody = { earth: 'С Землёй', moon: 'С Луной', mars: 'С Марсом' }[body];
  const overlay = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // На отдельной карте глобус скрыт, но не закрывается: снимки в видеокарте остаются, а кадры не рисуются
  const hidden = useAppStore((s) => s.view === '2d');
  // Картинка для выгрузки: кадр перерисовывается и копируется сразу, пока браузер его не стёр
  const three = useRef<RootState | null>(null);
  useEffect(
    () =>
      registerSnapshot('globe', {
        canvas: () => {
          const st = three.current;
          if (!st || useAppStore.getState().view === '2d') return null;
          st.gl.render(st.scene, st.camera);
          return st.gl.domElement;
        },
        labels: () => overlay.current,
        background: '#04060a',
      }),
    [],
  );

  return (
    <div className={styles.wrap}>
      <Canvas
        className={styles.canvas}
        // Кадр рисуется по требованию: когда идёт время, двигается камера или что-то изменилось.
        // На паузе с неподвижной камерой видеокарта не работает впустую (раньше — 60 кадров в секунду всегда)
        frameloop={hidden ? 'never' : 'demand'}
        // Полная чёткость на компьютере; на телефонах и слабых устройствах — не выше 1,5 (пикселей на 44 % меньше)
        dpr={LIGHT_DEVICE ? [1, 1.5] : [1, 2]}
        camera={{ fov: CAMERA_FOV, near: 0.005, far: 3000, position: [0, 1.6, 4.2] }}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
        role="application"
        aria-roledescription="трёхмерный глобус"
        aria-label="Центральное тело, орбита и трасса спутника. Стрелки — вращение, плюс и минус — приближение"
        tabIndex={0}
        data-globe-keys=""
        onCreated={(st) => (three.current = st)}
      >
        <Suspense fallback={null}>
          <GlobeScene overlay={overlay} onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>
      <div ref={overlay} className={styles.labels} aria-hidden="true" />
      {/* Вид с борта: прицел в центре кадра — подспутниковая точка; стрелка — направление полёта */}
      {camera === 'board' && (
        <svg className={styles.boardMark} viewBox="-40 -40 80 80" aria-hidden="true">
          <circle r="11" />
          <path d="M0 -26 V -15 M0 15 V 26 M-26 0 H -15 M15 0 H 26" />
          <path className={styles.boardArrow} d="M-5 -30 L0 -37 L5 -30" />
        </svg>
      )}
      <div className={styles.loader} data-done={ready} role={ready ? undefined : 'status'} aria-hidden={ready || undefined}>
        <span className={styles.spinner} aria-hidden="true" />
        Загрузка глобуса…
      </div>

      <div className={styles.toolbar} data-chrome="">
        <div className={styles.segmented} role="radiogroup" aria-label="Камера" onKeyDown={(e) => rovingKeyDown(e, CAMERA_IDS, camera, setCamera)}>
          {CAMERA_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={camera === m.id}
              tabIndex={rovingTabIndex(camera === m.id)}
              title={m.id === 'earth' ? `Камера вращается вместе с телом (${withBody.toLowerCase()})` : m.hint}
              aria-label={m.id === 'earth' ? withBody : m.label}
              onClick={() => setCamera(m.id)}
            >
              <m.icon size={14} className={styles.camIcon} />
              <span className={styles.camLabel}>{m.id === 'earth' ? withBody : m.label}</span>
            </button>
          ))}
        </div>
        <LayersMenu keys={body === 'earth' ? ['night', 'clouds', 'helpers', 'cities'] : ['regions', 'night', 'helpers', 'cities']}>
          <RevsControl />
          <div className={styles.quality}>
            <span>Детализация снимка</span>
            <div className={styles.segmented} role="radiogroup" aria-label="Детализация снимка" onKeyDown={(e) => rovingKeyDown(e, QUALITIES, quality, setQuality)}>
              <button type="button" role="radio" aria-checked={quality === 'standard'} tabIndex={rovingTabIndex(quality === 'standard')} onClick={() => setQuality('standard')}>
                8K
              </button>
              <button type="button" role="radio" aria-checked={quality === 'ultra'} tabIndex={rovingTabIndex(quality === 'ultra')} onClick={() => setQuality('ultra')}>
                16K
              </button>
            </div>
          </div>
        </LayersMenu>
      </div>
    </div>
  );
}
