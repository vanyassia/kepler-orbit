/**
 * Глобальное состояние приложения (zustand).
 *
 * Время симуляции меняется каждый кадр; компоненты, которым не нужна
 * частота 60 Гц (боковая панель, шкала), читают его через useThrottledSimTime.
 * Холсты 2D/3D берут значение напрямую из useAppStore.getState() в своём цикле отрисовки.
 */
import { create } from 'zustand';
import type { SatelliteRecord } from '../data/celestrak';
import { loadByNorad } from '../data/celestrak';
import type { PreparedOrbit } from '../physics/propagate';
import { prepareOrbit } from '../physics/propagate';

export type ViewMode = 'split' | '2d' | '3d';
export type CameraMode = 'free' | 'follow' | 'earth';
export type Quality = 'standard' | 'ultra';

export interface Layers {
  imagery: boolean;
  night: boolean;
  borders: boolean;
  grid: boolean;
  cities: boolean;
  visibility: boolean;
  /** 3D: оси, экватор, линия узлов, апсиды */
  helpers: boolean;
  clouds: boolean;
}

export const SPEEDS = [1, 10, 60, 300, 1000, 5000] as const;

interface AppState {
  record: SatelliteRecord | null;
  orbit: PreparedOrbit | null;
  loading: boolean;
  error: string | null;
  /** Номер NORAD, загрузка которого идёт сейчас (для подсветки кнопки). */
  pendingNorad: number | null;

  simTime: number;
  playing: boolean;
  speed: number;

  view: ViewMode;
  camera: CameraMode;
  quality: Quality;
  layers: Layers;
  revsBack: number;
  revsForward: number;

  loadNorad: (id: number) => Promise<void>;
  setRecord: (rec: SatelliteRecord) => void;
  setSimTime: (t: number) => void;
  advance: (realDtMs: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  resetToNow: () => void;
  setView: (v: ViewMode) => void;
  setCamera: (c: CameraMode) => void;
  setQuality: (q: Quality) => void;
  toggleLayer: (k: keyof Layers) => void;
  setRevs: (back: number, forward: number) => void;
}

let loadSeq = 0;

export const useAppStore = create<AppState>((set, get) => ({
  record: null,
  orbit: null,
  loading: false,
  error: null,
  pendingNorad: null,

  simTime: Date.now(),
  playing: true,
  speed: 1,

  view: 'split',
  camera: 'free',
  quality: 'standard',
  layers: {
    imagery: true,
    night: true,
    borders: true,
    grid: true,
    cities: true,
    visibility: true,
    helpers: true,
    clouds: true,
  },
  revsBack: 1,
  revsForward: 2,

  loadNorad: async (id) => {
    const seq = ++loadSeq;
    set({ loading: true, error: null, pendingNorad: id });
    try {
      const rec = await loadByNorad(id);
      if (seq !== loadSeq) return; // пользователь уже выбрал другой спутник
      set({ record: rec, orbit: prepareOrbit(rec.elements), loading: false, pendingNorad: null });
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ loading: false, pendingNorad: null, error: e instanceof Error ? e.message : String(e) });
    }
  },
  setRecord: (rec) => {
    loadSeq++;
    set({ record: rec, orbit: prepareOrbit(rec.elements), loading: false, error: null, pendingNorad: null });
  },

  setSimTime: (t) => set({ simTime: t }),
  advance: (realDtMs) => {
    const { playing, speed, simTime } = get();
    if (playing) set({ simTime: simTime + realDtMs * speed });
  },
  setPlaying: (p) => set({ playing: p }),
  setSpeed: (s) => set({ speed: s }),
  resetToNow: () => set({ simTime: Date.now(), speed: 1, playing: true }),

  setView: (v) => set({ view: v }),
  setCamera: (c) => set({ camera: c }),
  setQuality: (q) => set({ quality: q }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setRevs: (back, forward) => set({ revsBack: back, revsForward: forward }),
}));
