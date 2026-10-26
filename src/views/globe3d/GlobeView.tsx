import { Canvas } from '@react-three/fiber';
import { Earth, Move3d, Satellite } from 'lucide-react';
import { Suspense, useRef, useState } from 'react';
import { ACESFilmicToneMapping } from 'three';
import type { CameraMode } from '../../state/store';
import { useAppStore } from '../../state/store';
import { LayersMenu, RevsControl } from '../../ui/LayersMenu';
import { GlobeScene } from './GlobeScene';
import styles from './GlobeView.module.css';

const CAMERA_MODES: { id: CameraMode; label: string; hint: string; icon: typeof Earth }[] = [
  { id: 'free', label: 'Свободно', hint: 'Камера неподвижна в инерциальной системе (АГЭСК)', icon: Move3d },
  { id: 'follow', label: 'За спутником', hint: 'Камера поворачивается вслед за спутником', icon: Satellite },
  { id: 'earth', label: 'С телом', hint: 'Камера вращается вместе с телом', icon: Earth },
];

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

  return (
    <div className={styles.wrap}>
      <Canvas
        className={styles.canvas}
        dpr={[1, 2]}
        camera={{ fov: 38, near: 0.005, far: 3000, position: [0, 1.6, 4.2] }}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
        aria-label="Трёхмерный вид: центральное тело, орбита и трасса спутника"
      >
        <Suspense fallback={null}>
          <GlobeScene overlay={overlay} onReady={() => setReady(true)} />
        </Suspense>
      </Canvas>
      <div ref={overlay} className={styles.labels} aria-hidden="true" />
      <div className={styles.loader} data-done={ready} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        Загрузка глобуса…
      </div>

      <div className={styles.toolbar}>
        <div className={styles.segmented} role="radiogroup" aria-label="Камера">
          {CAMERA_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={camera === m.id}
              title={m.id === 'earth' ? `Камера вращается вместе с телом (${withBody.toLowerCase()})` : m.hint}
              aria-label={m.id === 'earth' ? withBody : m.label}
              onClick={() => setCamera(m.id)}
            >
              <m.icon size={14} className={styles.camIcon} />
              <span className={styles.camLabel}>{m.id === 'earth' ? withBody : m.label}</span>
            </button>
          ))}
        </div>
        <LayersMenu keys={body === 'earth' ? ['reference', 'night', 'clouds', 'helpers', 'visibility', 'cities'] : ['night', 'helpers', 'visibility', 'cities']}>
          <RevsControl />
          <div className={styles.quality}>
            <span>Детализация снимка</span>
            <div className={styles.segmented} role="radiogroup" aria-label="Детализация снимка">
              <button type="button" role="radio" aria-checked={quality === 'standard'} onClick={() => setQuality('standard')}>
                8K
              </button>
              <button type="button" role="radio" aria-checked={quality === 'ultra'} onClick={() => setQuality('ultra')}>
                16K
              </button>
            </div>
          </div>
        </LayersMenu>
      </div>
      <div className={styles.hint}>Вращение — мышь, приближение — колесо</div>
    </div>
  );
}
