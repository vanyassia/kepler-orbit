/**
 * Глобальное состояние приложения (zustand).
 *
 * Время симуляции меняется каждый кадр; компоненты, которым не нужна
 * частота 60 Гц (боковая панель, шкала), читают его через useThrottledSimTime.
 * Холсты 2D/3D берут значение напрямую из useAppStore.getState() в своём цикле отрисовки.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
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
  /** Последний запрошенный номер NORAD (для повтора и восстановления при следующем запуске). */
  lastNorad: number | null;
  /** Боковая панель на узких экранах. */
  sidebarOpen: boolean;

  simTime: number;
  playing: boolean;
  speed: number;
  /**
   * Опорная точка часов: t_sim = anchorSim + (t_реальное − anchorReal)·скорость.
   * Время не «отстаёт», даже если кадры пропускаются (свёрнутая вкладка, тяжёлая сцена).
   */
  anchorSim: number;
  anchorReal: number;

  view: ViewMode;
  camera: CameraMode;
  quality: Quality;
  layers: Layers;
  revsBack: number;
  revsForward: number;

  loadNorad: (id: number) => Promise<void>;
  setRecord: (rec: SatelliteRecord) => void;
  setSimTime: (t: number) => void;
  /** Пересчёт времени симуляции по реальным часам (вызывается каждый кадр). */
  tick: (realNowMs: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  resetToNow: () => void;
  setView: (v: ViewMode) => void;
  setCamera: (c: CameraMode) => void;
  setQuality: (q: Quality) => void;
  toggleLayer: (k: keyof Layers) => void;
  setRevs: (back: number, forward: number) => void;
  setSidebarOpen: (open: boolean) => void;
  stepTime: (deltaMs: number) => void;
}

let loadSeq = 0;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  record: null,
  orbit: null,
  loading: false,
  error: null,
  pendingNorad: null,
  lastNorad: null,
  sidebarOpen: false,

  simTime: Date.now(),
  playing: true,
  speed: 1,
  anchorSim: Date.now(),
  anchorReal: performance.now(),

  view: '3d',
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
    set({ loading: true, error: null, pendingNorad: id, lastNorad: id });
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
    set({ record: rec, orbit: prepareOrbit(rec.elements), loading: false, error: null, pendingNorad: null, lastNorad: rec.elements.noradId });
  },

  setSimTime: (t) => set({ simTime: t, anchorSim: t, anchorReal: performance.now() }),
  tick: (realNow) => {
    const { playing, speed, anchorSim, anchorReal } = get();
    if (playing) set({ simTime: anchorSim + (realNow - anchorReal) * speed });
  },
  setPlaying: (p) => set((s) => ({ playing: p, anchorSim: s.simTime, anchorReal: performance.now() })),
  setSpeed: (v) => set((s) => ({ speed: v, anchorSim: s.simTime, anchorReal: performance.now() })),
  resetToNow: () => set({ simTime: Date.now(), anchorSim: Date.now(), anchorReal: performance.now(), speed: 1, playing: true }),

  setView: (v) => set({ view: v }),
  setCamera: (c) => set({ camera: c }),
  setQuality: (q) => set({ quality: q }),
  toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
  setRevs: (back, forward) => set({ revsBack: back, revsForward: forward }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  stepTime: (deltaMs) => {
    const t = get().simTime + deltaMs;
    set({ simTime: t, anchorSim: t, anchorReal: performance.now() });
  },
    }),
    {
      // Настройки интерфейса запоминаются в браузере; данные спутника — нет (они в кэше CelesTrak)
      name: 'kepler:prefs',
      version: 2,
      // v2: вид и последний спутник больше не запоминаются (по умолчанию — МКС на глобусе)
      migrate: (persisted) => persisted as AppState,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        camera: s.camera,
        quality: s.quality,
        layers: s.layers,
        revsBack: s.revsBack,
        revsForward: s.revsForward,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        return { ...current, ...p, layers: { ...current.layers, ...(p.layers ?? {}) } };
      },
    },
  ),
);

// Доступ к состоянию из консоли браузера при разработке (для проверки и отладки)
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__kepler = useAppStore;
