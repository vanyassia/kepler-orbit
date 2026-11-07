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
import type { CustomSatellite } from '../data/custom';
import { CUSTOM_ID_BASE, customToRecord, isCustomId, isStoredCustom } from '../data/custom';
import type { TunePatch } from '../data/orbitTune';
import { shapeOf, tuneElements } from '../data/orbitTune';
import { DEFAULT_SATELLITE, isOrbiterId, loadOrbiter } from '../data/orbiters';
import type { BodyId } from '../physics/bodies';
import type { PreparedOrbit } from '../physics/propagate';
import { prepareOrbit } from '../physics/propagate';

export type ViewMode = 'split' | '2d' | '3d';
/** board — «Вид с борта»: камера на спутнике смотрит вниз, на подспутниковую точку. */
export type CameraMode = 'free' | 'follow' | 'earth' | 'board';
export type Quality = 'standard' | 'ultra';

export interface Layers {
  imagery: boolean;
  night: boolean;
  borders: boolean;
  grid: boolean;
  cities: boolean;
  /** 3D: оси, экватор, линия узлов, апсиды */
  helpers: boolean;
  clouds: boolean;
  /** Регионы Луны и Марса (названия IAU, справочник USGS) */
  regions: boolean;
}

export const SPEEDS = [1, 10, 60, 300, 1000, 5000] as const;

/** Место для поиска пролётов: город (name) или точка, выбранная на карте (name = null). Градусы. */
export interface PassTarget {
  name: string | null;
  lat: number;
  lon: number;
}

/** Расстояния для поиска пролётов, км: у Луны и Марса тела меньше — и круги меньше. */
export const PASS_RADIUS_OPTIONS: Record<BodyId, number[]> = {
  earth: [250, 500, 1000, 2000],
  moon: [50, 100, 250, 500],
  mars: [100, 250, 500, 1000],
};
const DEFAULT_PASS_RADIUS: Record<BodyId, number> = { earth: 1000, moon: 250, mars: 500 };
/** Насколько вперёд искать пролёты, сутки. */
export const PASS_DAYS_OPTIONS = [1, 3, 7] as const;

/** Место поиска пролётов на теле; null — точка не поставлена и функция выключена. */
export function passTargetOf(s: { passTargets: Partial<Record<BodyId, PassTarget>> }, body: BodyId): PassTarget | null {
  return s.passTargets[body] ?? null;
}

export function passRadiusOf(s: { passRadius: Partial<Record<BodyId, number>> }, body: BodyId): number {
  const r = s.passRadius[body];
  return r && PASS_RADIUS_OPTIONS[body].includes(r) ? r : DEFAULT_PASS_RADIUS[body];
}

interface AppState {
  /** Центральное тело: Земля, Луна или Марс. */
  body: BodyId;
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
  /** Окно «Выгрузка данных». */
  exportOpen: boolean;
  /** Режим показа: шапка и панели скрыты, на весь экран только карта или глобус. Не запоминается. */
  presenting: boolean;

  /**
   * Пролёты над точкой: место (ставится щелчком по карте, по умолчанию нет — сайт прежде всего для трасс),
   * расстояние и интервал поиска. Расстояние и интервал сохраняются в браузере, место — нет.
   */
  passTargets: Partial<Record<BodyId, PassTarget>>;
  passRadius: Partial<Record<BodyId, number>>;
  passDays: number;
  setPassTarget: (t: PassTarget) => void;
  /** Убрать точку — функция выключается. */
  clearPassTarget: () => void;
  setPassRadius: (km: number) => void;
  setPassDays: (days: number) => void;

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

  /** Свои спутники (сохраняются в браузере). */
  customSats: CustomSatellite[];
  /** Создать свой спутник и сразу выбрать его. */
  addCustom: (c: Omit<CustomSatellite, 'id' | 'epochMs'>) => void;
  removeCustom: (id: number) => void;
  /** Загрузка спутника: положительный номер — NORAD (Земля, CelesTrak), отрицательный — NAIF (Луна, Марс, Horizons). */
  loadNorad: (id: number) => Promise<void>;
  /** Переход к другому телу — с его спутником по умолчанию. */
  selectBody: (body: BodyId) => void;
  setRecord: (rec: SatelliteRecord) => void;
  /**
   * Орбита своего спутника до изменения ползунками «Изменить орбиту» (null — орбиту не меняли)
   * и его прежние параметры: изменения сохраняются в самом спутнике.
   */
  tuneBase: { record: SatelliteRecord; custom?: CustomSatellite } | null;
  /** Изменить высоту перицентра, эксцентриситет или наклонение своего спутника (настоящие не меняются). */
  tuneOrbit: (patch: TunePatch) => void;
  /** Вернуть орбиту, какой она была до изменений. */
  resetTune: () => void;
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
  setExportOpen: (open: boolean) => void;
  setPresenting: (on: boolean) => void;
  stepTime: (deltaMs: number) => void;
}

let loadSeq = 0;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
  body: 'earth',
  record: null,
  orbit: null,
  loading: false,
  error: null,
  pendingNorad: null,
  lastNorad: null,
  sidebarOpen: false,
  exportOpen: false,
  presenting: false,
  passTargets: {},
  passRadius: {},
  passDays: 3,
  setPassTarget: (t) => set((s) => ({ passTargets: { ...s.passTargets, [s.body]: t } })),
  clearPassTarget: () =>
    set((s) => {
      const next = { ...s.passTargets };
      delete next[s.body];
      return { passTargets: next };
    }),
  setPassRadius: (km) => set((s) => ({ passRadius: { ...s.passRadius, [s.body]: km } })),
  setPassDays: (days) => set({ passDays: days }),

  simTime: Date.now(),
  playing: true,
  speed: 1,
  anchorSim: Date.now(),
  anchorReal: performance.now(),

  view: '2d',
  camera: 'free',
  quality: 'standard',
  layers: {
    imagery: true,
    night: true,
    borders: true,
    grid: true,
    cities: true,
    helpers: false,
    clouds: true,
    regions: true,
  },
  revsBack: 1,
  revsForward: 2,
  customSats: [],
  tuneBase: null,

  addCustom: (c) => {
    const id = Math.max(CUSTOM_ID_BASE, ...get().customSats.map((x) => x.id)) + 1;
    const sat: CustomSatellite = { ...c, id, epochMs: Date.now() };
    set({ customSats: [...get().customSats, sat] });
    get().setRecord(customToRecord(sat));
  },
  removeCustom: (id) => {
    const s = get();
    set({ customSats: s.customSats.filter((x) => x.id !== id) });
    // Удалили выбранный — переходим к спутнику тела по умолчанию
    if (s.record?.elements.noradId === id) void s.loadNorad(DEFAULT_SATELLITE[s.body]);
  },

  loadNorad: async (id) => {
    if (isCustomId(id)) {
      const c = get().customSats.find((x) => x.id === id);
      if (c) return get().setRecord(customToRecord(c));
      id = DEFAULT_SATELLITE[get().body]; // спутник удалён или открыта чужая ссылка
    }
    const seq = ++loadSeq;
    set({ loading: true, error: null, pendingNorad: id, lastNorad: id });
    try {
      const rec = isOrbiterId(id) ? await loadOrbiter(id) : await loadByNorad(id);
      if (seq !== loadSeq) return; // пользователь уже выбрал другой спутник
      set({ record: rec, body: rec.elements.body ?? 'earth', orbit: prepareOrbit(rec.elements), loading: false, pendingNorad: null, tuneBase: null });
    } catch (e) {
      if (seq !== loadSeq) return;
      set({ loading: false, pendingNorad: null, error: e instanceof Error ? e.message : String(e) });
    }
  },
  setRecord: (rec) => {
    loadSeq++;
    set({ record: rec, body: rec.elements.body ?? 'earth', orbit: prepareOrbit(rec.elements), loading: false, error: null, pendingNorad: null, lastNorad: rec.elements.noradId, tuneBase: null });
  },
  tuneOrbit: (patch) => {
    const s = get();
    if (!s.record) return;
    const id = s.record.elements.noradId;
    // Менять можно только свои спутники: орбиты настоящих аппаратов не подменяем
    const custom = isCustomId(id) ? s.customSats.find((x) => x.id === id) : undefined;
    if (!custom) return;
    const elements = tuneElements(s.record.elements, patch);
    const record = { ...s.record, elements };
    const tuneBase = s.tuneBase ?? { record: s.record, custom };
    loadSeq++; // загрузка другого спутника, начатая раньше, уже не нужна
    // Свой спутник запоминает новую орбиту (одним обновлением — без лишней перерисовки)
    const sh = shapeOf(elements);
    const next = { ...custom, hPeri: sh.hPeri, hApo: sh.hApo, inclinationDeg: elements.inclinationDeg };
    const customSats = s.customSats.map((x) => (x.id === id ? next : x));
    set({ record, orbit: prepareOrbit(elements), tuneBase, customSats });
  },
  resetTune: () => {
    const { tuneBase, customSats } = get();
    if (!tuneBase) return;
    const c = tuneBase.custom;
    if (c) set({ customSats: customSats.map((x) => (x.id === c.id ? c : x)) });
    get().setRecord(tuneBase.record);
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
  setExportOpen: (open) => set({ exportOpen: open }),
  // В показе выдвижная панель и окна закрыты: на экране только вид
  setPresenting: (on) => set(on ? { presenting: true, sidebarOpen: false, exportOpen: false } : { presenting: false }),
  selectBody: (body) => {
    if (get().body === body && get().record) return;
    set({ body });
    void get().loadNorad(DEFAULT_SATELLITE[body]);
  },
  stepTime: (deltaMs) => {
    const t = get().simTime + deltaMs;
    set({ simTime: t, anchorSim: t, anchorReal: performance.now() });
  },
    }),
    {
      // Настройки интерфейса запоминаются в браузере; данные спутника — нет (они в кэше CelesTrak)
      name: 'kepler:prefs',
      version: 3,
      // v2: вид и последний спутник больше не запоминаются (по умолчанию — МКС на карте)
      // v3: новые слои по умолчанию (вспомогательная геометрия выключена) — сохранённые слои сбрасываются
      migrate: (persisted, version) => {
        const p = persisted as Partial<AppState>;
        return (version < 3 ? { ...p, layers: undefined } : p) as AppState;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        // «Вид с борта» не запоминается: при запуске глобус открывается обычным видом
        camera: s.camera === 'board' ? 'free' : s.camera,
        quality: s.quality,
        layers: s.layers,
        revsBack: s.revsBack,
        revsForward: s.revsForward,
        customSats: s.customSats,
        passRadius: s.passRadius,
        passDays: s.passDays,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppState>;
        // Берём только существующие слои: у старых версий был слой эталона SGP4
        const saved = (p.layers ?? {}) as Partial<Layers>;
        const layers = { ...current.layers };
        // «День и ночь» при каждом запуске включены — сохранённое выключение не восстанавливается
        for (const k of Object.keys(layers) as (keyof Layers)[]) if (k !== 'night' && typeof saved[k] === 'boolean') layers[k] = saved[k];
        // Место пролётов не восстанавливается (его сохраняла прошлая версия): при запуске — только трассы
        // Свои спутники — только целые записи (испорченная запись в хранилище не должна ронять панель)
        const customSats = Array.isArray(p.customSats) ? p.customSats.filter(isStoredCustom) : [];
        return { ...current, ...p, layers, customSats, passTargets: {} };
      },
    },
  ),
);

// Доступ к состоянию из консоли браузера при разработке (для проверки и отладки)
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__kepler = useAppStore;
