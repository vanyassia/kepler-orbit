import { Canvas } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import { ACESFilmicToneMapping } from 'three';
import type { CameraMode } from '../../state/store';
import { useAppStore } from '../../state/store';
import { LayersMenu, RevsControl } from '../../ui/LayersMenu';
import { GlobeScene } from './GlobeScene';
import styles from './GlobeView.module.css';

const CAMERA_MODES: { id: CameraMode; label: string; hint: string }[] = [
  { id: 'free', label: 'Свободно', hint: 'Камера неподвижна в инерциальной системе (АГЭСК)' },
  { id: 'follow', label: 'За спутником', hint: 'Камера поворачивается вслед за спутником' },
  { id: 'earth', label: 'С Землёй', hint: 'Камера вращается вместе с Землёй (ГСК)' },
];

/** 3D-вид: глобус, орбита, трасса. Загружается отдельным чанком (three.js). */
export default function GlobeView() {
  const camera = useAppStore((s) => s.camera);
  const setCamera = useAppStore((s) => s.setCamera);
  const quality = useAppStore((s) => s.quality);
  const setQuality = useAppStore((s) => s.setQuality);
  const overlay = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.wrap}>
      <Canvas
        className={styles.canvas}
        dpr={[1, 2]}
        camera={{ fov: 38, near: 0.005, far: 3000, position: [0, 1.6, 4.2] }}
        gl={{ antialias: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05, powerPreference: 'high-performance' }}
        aria-label="Трёхмерный вид: Земля, орбита и трасса спутника"
      >
        <Suspense fallback={null}>
          <GlobeScene overlay={overlay} />
        </Suspense>
      </Canvas>
      <div ref={overlay} className={styles.labels} aria-hidden="true" />

      <div className={styles.toolbar}>
        <div className={styles.segmented} role="radiogroup" aria-label="Камера">
          {CAMERA_MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={camera === m.id} title={m.hint} onClick={() => setCamera(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <LayersMenu keys={['night', 'clouds', 'helpers', 'visibility', 'cities']}>
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
