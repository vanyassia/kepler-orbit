import { useEffect } from 'react';
import styles from './App.module.css';
import { useSimClock } from './hooks/useSimClock';
import type { ViewMode } from './state/store';
import { useAppStore } from './state/store';
import { Sidebar } from './ui/Sidebar';
import { Timeline } from './ui/Timeline';
import { TopBar } from './ui/TopBar';
import { Workspace } from './ui/Workspace';

const DEFAULT_NORAD = 25544; // МКС
const VIEWS: ViewMode[] = ['split', '3d', '2d'];

/** Спутник и вид из адреса страницы (?sat=25544&view=3d) — ссылкой можно поделиться. */
function readUrl(): { sat: number | null; view: ViewMode | null } {
  const q = new URLSearchParams(location.search);
  const sat = Number(q.get('sat'));
  const view = q.get('view') as ViewMode | null;
  return { sat: Number.isInteger(sat) && sat > 0 ? sat : null, view: view && VIEWS.includes(view) ? view : null };
}

export function App() {
  useSimClock();
  const loadNorad = useAppStore((s) => s.loadNorad);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  // Запуск: спутник и вид из адреса страницы, иначе — МКС на глобусе
  useEffect(() => {
    const { sat, view } = readUrl();
    useAppStore.getState().setView(view ?? '3d');
    void loadNorad(sat ?? DEFAULT_NORAD);
  }, [loadNorad]);

  // Адрес страницы следует за выбранным спутником и видом
  useEffect(
    () =>
      useAppStore.subscribe((s, p) => {
        const id = s.record?.elements.noradId;
        if (id === p.record?.elements.noradId && s.view === p.view) return;
        const q = new URLSearchParams(location.search);
        if (id) q.set('sat', String(id));
        q.set('view', s.view);
        history.replaceState(null, '', `${location.pathname}?${q}`);
      }),
    [],
  );

  return (
    <div className={styles.app}>
      <a href="#workspace" className={styles.skip}>
        К визуализации
      </a>
      <TopBar />
      <Sidebar />
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
      <main id="workspace" className={styles.main} tabIndex={-1}>
        <Workspace />
      </main>
      <Timeline />
    </div>
  );
}
