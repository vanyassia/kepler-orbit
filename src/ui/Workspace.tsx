import { Columns2, Globe2, Map, MonitorX, RotateCw, SatelliteDish } from 'lucide-react';
import { lazy, Suspense, useDeferredValue, useEffect, ViewTransition } from 'react';
import type { ViewMode } from '../state/store';
import { useAppStore } from '../state/store';
import { ErrorBoundary } from './ErrorBoundary';
import styles from './Workspace.module.css';
import { rovingKeyDown, rovingTabIndex } from './roving';

const GlobeView = lazy(() => import('../views/globe3d/GlobeView'));
const loadMapView = () => import('../views/map2d/MapView');
const MapView = lazy(loadMapView);

const VIEWS: { id: ViewMode; label: string; icon: typeof Map }[] = [
  { id: 'split', label: 'Оба вида', icon: Columns2 },
  { id: '3d', label: 'Глобус', icon: Globe2 },
  { id: '2d', label: 'Карта', icon: Map },
];
const VIEW_IDS = VIEWS.map((v) => v.id);

/**
 * Область визуализации: 3D-глобус и/или 2D-карта.
 *
 * Смена вида анимируется переходом (View Transition): оставшаяся панель плавно меняет размер,
 * убранная гаснет, добавленная проявляется. Состояние лежит в zustand, а его обновления React
 * выполняет синхронно, поэтому панели читают отложенное значение (useDeferredValue) —
 * именно оно запускает переход. Кнопки переключателя показывают выбор сразу.
 */
export function Workspace() {
  const view = useAppStore((s) => s.view);
  const shownView = useDeferredValue(view);
  const setView = useAppStore((s) => s.setView);
  const hasRecord = useAppStore((s) => !!s.record);
  const error = useAppStore((s) => s.error);
  const loading = useAppStore((s) => s.loading);

  // Карта открывается не сразу, но к первому нажатию её код уже готов
  useEffect(() => {
    const timer = setTimeout(() => void loadMapView(), 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={styles.workspace} data-view={shownView}>
      <div
        className={styles.switcher}
        role="tablist"
        aria-label="Вид"
        style={{ viewTransitionName: 'view-switcher' }}
        onKeyDown={(e) => rovingKeyDown(e, VIEW_IDS, view, setView)}
      >
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            tabIndex={rovingTabIndex(view === id)}
            className={styles.tab}
            onClick={() => setView(id)}
          >
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {!hasRecord && (error || loading) && <EmptyState error={error} />}
      {shownView !== '2d' && (
        <ViewTransition key="globe" enter="pane-in" exit="pane-out" update="pane-move" default="none">
          <section className={styles.pane} aria-label="Трёхмерный вид">
            <ErrorBoundary fallback={<ViewFailed title="Глобус не запустился" hint="Браузер не дал WebGL, либо страница устарела после обновления сайта. Карта работает и без WebGL." showMap={shownView === '3d'} />}>
              <Suspense fallback={<div className={styles.loading}>Загрузка глобуса…</div>}>
                {/* Глобус проявляется, когда загрузился его код; надпись загрузки исчезает сразу */}
                <ViewTransition enter="fade-in" default="none">
                  <GlobeView />
                </ViewTransition>
              </Suspense>
            </ErrorBoundary>
          </section>
        </ViewTransition>
      )}
      {shownView !== '3d' && (
        <ViewTransition key="map" enter="pane-in" exit="pane-out" update="pane-move" default="none">
          <section className={styles.pane} aria-label="Карта">
            <ErrorBoundary fallback={<ViewFailed title="Карта не загрузилась" hint="Страница устарела после обновления сайта или пропала связь." />}>
              <Suspense fallback={<div className={styles.loading}>Загрузка карты…</div>}>
                <MapView />
              </Suspense>
            </ErrorBoundary>
          </section>
        </ViewTransition>
      )}
    </div>
  );
}

/** Панель не смогла запуститься: что случилось и что делать дальше. */
function ViewFailed({ title, hint, showMap = false }: { title: string; hint: string; showMap?: boolean }) {
  const setView = useAppStore((s) => s.setView);
  return (
    <div className={styles.empty} role="alert">
      <div className={styles.emptyCard}>
        <MonitorX size={28} aria-hidden="true" />
        <h2>{title}</h2>
        <p className={styles.emptyHint}>{hint}</p>
        <div className={styles.actions}>
          {showMap && (
            <button type="button" className={styles.retry} onClick={() => setView('2d')}>
              <Map size={15} aria-hidden="true" /> Открыть карту
            </button>
          )}
          <button type="button" className={styles.retry} onClick={() => location.reload()}>
            <RotateCw size={15} aria-hidden="true" /> Обновить страницу
          </button>
        </div>
      </div>
    </div>
  );
}

/** Нет данных: идёт загрузка или все источники недоступны. */
function EmptyState({ error }: { error: string | null }) {
  const retry = () => {
    const s = useAppStore.getState();
    void s.loadNorad(s.lastNorad ?? 25544);
  };
  return (
    <div className={styles.empty} role={error ? 'alert' : 'status'}>
      <div className={styles.emptyCard}>
        <SatelliteDish size={28} aria-hidden="true" />
        {error ? (
          <>
            <h2>Не удалось получить элементы орбиты</h2>
            <p>{error}</p>
            <p className={styles.emptyHint}>
              Проверьте подключение к интернету и повторите запрос, выберите другой спутник или введите TLE вручную через поиск.
            </p>
            <button type="button" className={styles.retry} onClick={retry}>
              <RotateCw size={15} aria-hidden="true" /> Повторить запрос
            </button>
          </>
        ) : (
          <h2>Загрузка элементов орбиты…</h2>
        )}
      </div>
    </div>
  );
}
