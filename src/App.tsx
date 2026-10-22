import { useEffect } from 'react';
import styles from './App.module.css';
import { useSimClock } from './hooks/useSimClock';
import { useAppStore } from './state/store';
import { Sidebar } from './ui/Sidebar';
import { Timeline } from './ui/Timeline';
import { TopBar } from './ui/TopBar';
import { Workspace } from './ui/Workspace';

const DEFAULT_NORAD = 25544; // МКС

export function App() {
  useSimClock();
  const loadNorad = useAppStore((s) => s.loadNorad);

  useEffect(() => {
    void loadNorad(DEFAULT_NORAD);
  }, [loadNorad]);

  return (
    <div className={styles.app}>
      <TopBar />
      <Sidebar />
      <main className={styles.main}>
        <Workspace />
      </main>
      <Timeline />
    </div>
  );
}
