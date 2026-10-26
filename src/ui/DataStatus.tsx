import { useWallClock } from '../hooks/useSimClock';
import { useAppStore } from '../state/store';
import styles from './DataStatus.module.css';
import { fmtAge } from './format';

const LABELS = {
  online: 'CelesTrak, онлайн',
  cache: 'CelesTrak, из кэша',
  fallback: 'Встроенный пример',
  manual: 'TLE введён вручную',
  horizons: 'JPL Horizons',
} as const;

/** Откуда взяты элементы и насколько они свежие. */
export function DataStatus() {
  const record = useAppStore((s) => s.record);
  const loading = useAppStore((s) => s.loading);
  const now = useWallClock();

  if (!record) {
    return (
      <div className={styles.status} data-kind={loading ? 'loading' : 'none'}>
        <span className={styles.dot} />
        <span>{loading ? 'Загрузка элементов…' : 'Нет данных'}</span>
      </div>
    );
  }

  const epochAgeDays = (now - record.elements.epochMs) / 86_400_000;
  const stale = Math.abs(epochAgeDays) > 3;
  const detail =
    record.source === 'manual'
      ? null
      : record.source === 'fallback' || record.source === 'horizons'
        ? 'снимок сделан ' + fmtAge(now - record.fetchedAt)
        : 'получено ' + fmtAge(now - record.fetchedAt);

  return (
    <div
      className={styles.status}
      role="status"
      aria-live="polite"
      data-kind={loading ? 'loading' : record.source}
      title={stale ? 'Элементам больше 3 суток: точность расчёта снижена' : undefined}
    >
      <span className={styles.dot} />
      <span className={styles.text}>
        <span>{loading ? 'Загрузка…' : LABELS[record.source]}</span>
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>
      {stale && <span className={styles.warn}>эпоха {Math.round(epochAgeDays)} сут</span>}
    </div>
  );
}
