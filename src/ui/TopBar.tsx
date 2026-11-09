import { Download, PanelLeft, Presentation } from 'lucide-react';
import { useWallClock } from '../hooks/useSimClock';
import { useAppStore } from '../state/store';
import { BodySwitcher } from './BodySwitcher';
import { DataStatus } from './DataStatus';
import { ExportDialog } from './ExportDialog';
import { startPresentation } from './Presentation';
import { SatelliteSearch } from './SatelliteSearch';
import styles from './TopBar.module.css';
import { fmtTime } from './format';

export function TopBar() {
  const now = useWallClock();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const hasOrbit = useAppStore((s) => !!s.orbit);
  const exportOpen = useAppStore((s) => s.exportOpen);
  const setExportOpen = useAppStore((s) => s.setExportOpen);

  return (
    <header className={styles.bar} data-chrome="">
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
      </div>
      <BodySwitcher />
      <SatelliteSearch />
      <div className={styles.right}>
        <DataStatus />
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.exportBtn}`}
          onClick={startPresentation}
          disabled={!hasOrbit}
          aria-label="Режим показа"
          title="Режим показа: только карта или глобус на весь экран. Выход — Esc"
        >
          <Presentation size={16} aria-hidden="true" />
          <span className={styles.btnLabel}>Показ</span>
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.exportBtn}`}
          onClick={() => setExportOpen(true)}
          disabled={!hasOrbit}
          aria-label="Выгрузка данных"
          title="Выгрузка данных: таблица трассы, элементы орбиты, картинка, видео"
        >
          <Download size={16} aria-hidden="true" />
          <span className={styles.btnLabel}>Выгрузка</span>
        </button>
        <div className={styles.clocks} role="group" aria-label="Текущее время">
          <span>
            <span className={styles.zone}>UTC</span> <span className="num">{fmtTime(now)}</span>
          </span>
          <span>
            <span className={styles.zone}>МСК</span> <span className="num">{fmtTime(now, 'MSK')}</span>
          </span>
        </div>
      </div>
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </header>
  );
}

function Logo() {
  return <img className={styles.logo} src={`${import.meta.env.BASE_URL}logo.webp`} width={32} height={32} alt="" />;
}
