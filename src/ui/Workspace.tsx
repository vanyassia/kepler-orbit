import { Columns2, Globe2, Map } from 'lucide-react';
import { lazy, Suspense } from 'react';
import type { ViewMode } from '../state/store';
import { useAppStore } from '../state/store';
import { MapView } from '../views/map2d/MapView';
import styles from './Workspace.module.css';

const GlobeView = lazy(() => import('../views/globe3d/GlobeView'));

const VIEWS: { id: ViewMode; label: string; icon: typeof Map }[] = [
  { id: 'split', label: 'Оба вида', icon: Columns2 },
  { id: '3d', label: 'Глобус', icon: Globe2 },
  { id: '2d', label: 'Карта', icon: Map },
];

/** Область визуализации: 3D-глобус и/или 2D-карта. */
export function Workspace() {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);

  return (
    <div className={styles.workspace} data-view={view}>
      <div className={styles.switcher} role="tablist" aria-label="Вид">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={styles.tab} onClick={() => setView(id)}>
            <Icon size={15} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {view !== '2d' && (
        <section className={styles.pane} aria-label="Трёхмерный вид">
          <Suspense fallback={<div className={styles.loading}>Загрузка глобуса…</div>}>
            <GlobeView />
          </Suspense>
        </section>
      )}
      {view !== '3d' && (
        <section className={styles.pane} aria-label="Карта">
          <MapView />
        </section>
      )}
    </div>
  );
}
