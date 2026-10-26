import { PanelLeft } from 'lucide-react';
import { useWallClock } from '../hooks/useSimClock';
import { useAppStore } from '../state/store';
import { BodySwitcher } from './BodySwitcher';
import { DataStatus } from './DataStatus';
import { SatelliteSearch } from './SatelliteSearch';
import styles from './TopBar.module.css';
import { fmtTime } from './format';

export function TopBar() {
  const now = useWallClock();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);

  return (
    <header className={styles.bar}>
      <button
        type="button"
        className={`${styles.iconBtn} ${styles.panelToggle}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Параметры спутника"
        aria-expanded={sidebarOpen}
        aria-controls="sidebar"
      >
        <PanelLeft size={18} />
      </button>
      <div className={styles.brand}>
        <Logo />
        <span className={styles.name} translate="no">
          Кеплер
        </span>
        <span className={styles.tagline}>задача двух тел</span>
      </div>
      <BodySwitcher />
      <SatelliteSearch />
      <div className={styles.right}>
        <DataStatus />
        <div className={styles.clocks} role="group" aria-label="Текущее время">
          <span>
            <span className={styles.zone}>UTC</span> <span className="num">{fmtTime(now)}</span>
          </span>
          <span>
            <span className={styles.zone}>МСК</span> <span className="num">{fmtTime(now, 'MSK')}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return <img className={styles.logo} src={`${import.meta.env.BASE_URL}logo.png`} width={32} height={32} alt="" />;
}
