import { useEffect } from 'react';
import styles from './App.module.css';
import { useSimClock } from './hooks/useSimClock';
import { DEFAULT_SATELLITE, legacyBodyFor } from './data/orbiters';
import { isBodyId, type BodyId } from './physics/bodies';
import type { ViewMode } from './state/store';
import { useAppStore } from './state/store';
import { PresentationLayer } from './ui/Presentation';
import { Sidebar } from './ui/Sidebar';
import { Timeline } from './ui/Timeline';
import { TopBar } from './ui/TopBar';
import { Workspace } from './ui/Workspace';

const VIEWS: ViewMode[] = ['split', '3d', '2d'];

/** Спутник и вид из адреса страницы (?sat=25544&view=3d; для Луны и Марса — номер NAIF, ?sat=-85) — ссылкой можно поделиться. */
function readUrl(): { sat: number; body: BodyId; view: ViewMode } {
  const q = new URLSearchParams(location.search);
  const sat = Number(q.get('sat'));
  const validSat = Number.isSafeInteger(sat) && sat !== 0;
  const requestedBody = q.get('body');
  const body = isBodyId(requestedBody) ? requestedBody : validSat ? legacyBodyFor(sat) : 'earth';
  const view = q.get('view') as ViewMode | null;
  return { sat: validSat ? sat : DEFAULT_SATELLITE[body], body, view: view && VIEWS.includes(view) ? view : body === 'saturn' ? '3d' : '2d' };
}

export function App() {
  useSimClock();
  const loadNorad = useAppStore((s) => s.loadNorad);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const presenting = useAppStore((s) => s.presenting);

  // Запуск: спутник и вид из адреса страницы, иначе — МКС на карте
  useEffect(() => {
    const { sat, body, view } = readUrl();
    useAppStore.getState().setView(view);
    void loadNorad(sat, body);
  }, [loadNorad]);

  // Оттенок оформления под выбранное тело
  const body = useAppStore((s) => s.body);
  useEffect(() => {
    document.documentElement.dataset.body = body;
    // Цвет строки состояния браузера (мобильные) — фон текущей темы
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-0').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [body]);

  // Адрес страницы следует за выбранным спутником и видом
  useEffect(
    () =>
      useAppStore.subscribe((s, p) => {
        const id = s.record?.elements.noradId;
        if (id === p.record?.elements.noradId && s.body === p.body && s.view === p.view) return;
        const q = new URLSearchParams(location.search);
        if (id) {
          q.set('sat', String(id));
          if (s.body === 'earth') q.delete('body');
          else q.set('body', s.body);
        }
        q.set('view', s.view);
        history.replaceState(null, '', `${location.pathname}?${q}`);
      }),
    [],
  );

  return (
    <div className={styles.app} data-presenting={presenting || undefined}>
      <a href="#workspace" className={styles.skip} data-chrome="">
        К визуализации
      </a>
      <TopBar />
      <Sidebar />
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} aria-hidden="true" data-sidebar-backdrop="" />}
      <main id="workspace" className={styles.main} tabIndex={-1}>
        <Workspace />
      </main>
      <Timeline />
      <PresentationLayer />
    </div>
  );
}
