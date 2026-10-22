import { useWallClock } from '../hooks/useSimClock';
import { DataStatus } from './DataStatus';
import { SatelliteSearch } from './SatelliteSearch';
import styles from './TopBar.module.css';
import { fmtTime } from './format';

export function TopBar() {
  const now = useWallClock();
  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <Logo />
        <span className={styles.name}>Кеплер</span>
        <span className={styles.tagline}>трасса спутника в задаче двух тел</span>
      </div>
      <SatelliteSearch />
      <div className={styles.right}>
        <DataStatus />
        <div className={styles.clocks} aria-label="Текущее время">
          <span>
            <span className={styles.zone}>UTC</span> <span className="num">{fmtTime(now)}</span>
          </span>
          <span>
            <span className={styles.zone}>МСК</span> <span className="num">{fmtTime(now, 3)}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg className={styles.logo} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="6.5" fill="#1b6fb8" />
      <ellipse cx="16" cy="16" rx="14" ry="6" fill="none" stroke="var(--orbit)" strokeWidth="1.6" transform="rotate(-28 16 16)" />
      <circle cx="27.6" cy="10.2" r="2.4" fill="var(--sat)" />
    </svg>
  );
}
