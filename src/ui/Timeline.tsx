import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useThrottledSimTime, useWallClock } from '../hooks/useSimClock';
import { ascendingNodeTimes } from '../physics/propagate';
import { SPEEDS, useAppStore } from '../state/store';
import styles from './Timeline.module.css';
import { fmt, fmtDateTime, fmtTime } from './format';
import { rovingKeyDown, rovingTabIndex } from './roving';

const HALF_WINDOW_MS = 24 * 3_600_000;

/** Управление временем: пауза, скорость, ползунок ±24 ч с засечками витков, возврат к «сейчас». */
export function Timeline() {
  const t = useThrottledSimTime(80);
  const now = useWallClock();
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.speed);
  const orbit = useAppStore((s) => s.orbit);
  const { setPlaying, setSpeed, setSimTime, resetToNow } = useAppStore.getState();

  // Окно шкалы — 48 ч; если время симуляции вышло за край, окно перецентрируется
  const [center, setCenter] = useState(() => Date.now());
  useEffect(() => {
    if (Math.abs(t - center) > HALF_WINDOW_MS) setCenter(t);
  }, [t, center]);
  const start = center - HALF_WINDOW_MS;
  const span = 2 * HALF_WINDOW_MS;

  const nodes = useMemo(() => (orbit ? ascendingNodeTimes(orbit, start, start + span) : []), [orbit, start, span]);
  // При очень коротком периоде засечек слишком много — прореживаем
  const step = Math.max(1, Math.ceil(nodes.length / 40));

  const live = playing && speed === 1 && Math.abs(t - now) < 3000;
  const offsetH = (t - now) / 3_600_000;

  return (
    <footer className={styles.bar}>
      <button
        type="button"
        className={styles.play}
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? 'Пауза' : 'Пуск'}
        title={playing ? 'Пауза (пробел)' : 'Пуск (пробел)'}
      >
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>

      <div className={styles.speeds} role="radiogroup" aria-label="Скорость симуляции" onKeyDown={(e) => rovingKeyDown(e, SPEEDS, speed as (typeof SPEEDS)[number], setSpeed)}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            tabIndex={rovingTabIndex(speed === s)}
            className={styles.speed}
            onClick={() => setSpeed(s)}
          >
            ×{s}
          </button>
        ))}
      </div>

      <div className={styles.scrub}>
        <div className={styles.track}>
          {nodes
            .filter((_, k) => k % step === 0)
            .map((n) => (
              <span key={n} className={styles.node} style={{ left: `${((n - start) / span) * 100}%` }} />
            ))}
          {now >= start && now <= start + span && (
            <span className={styles.nowMark} style={{ left: `${((now - start) / span) * 100}%` }} title="Сейчас" />
          )}
          <input
            type="range"
            className={styles.range}
            min={0}
            max={span / 1000}
            step={30}
            value={Math.round((t - start) / 1000)}
            onChange={(e) => setSimTime(start + Number(e.target.value) * 1000)}
            aria-label="Время симуляции"
            aria-valuetext={fmtDateTime(t, 'MSK') + ' МСК'}
          />
        </div>
        <div className={styles.scale}>
          <span className="num">{fmtDateTime(start, 'MSK', false)}</span>
          <span className={styles.legend}>
            <i className={styles.legendNode} /> восходящий узел (начало витка)
          </span>
          <span className="num">{fmtDateTime(start + span, 'MSK', false)}</span>
        </div>
      </div>

      <div className={styles.readout}>
        <div className={`${styles.time} num`}>{fmtDateTime(t, 'MSK')}</div>
        <div className={styles.sub}>
          МСК, <span className="num">UTC {fmtTime(t)}</span>
          {!live && Math.abs(offsetH) >= 0.01 && (
            <span className={styles.offset}>
              {' '}
              {offsetH > 0 ? '+' : '−'}
              {Math.abs(offsetH) < 1 ? `${Math.round(Math.abs(offsetH) * 60)}\u00a0мин` : `${fmt(Math.abs(offsetH), 1)}\u00a0ч`}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        className={styles.nowBtn}
        onClick={resetToNow}
        data-live={live || undefined}
        aria-label={live ? 'В реальном времени' : 'Вернуться к текущему времени'}
      >
        <RotateCcw size={15} aria-hidden="true" />
        <span className={styles.nowLabel}>{live ? 'В реальном времени' : 'Сейчас'}</span>
      </button>
      <KeyboardShortcuts />
    </footer>
  );
}

/**
 * Клавиши: пробел — пауза/пуск; ← → — шаг времени на минуту, с Shift — на час
 * (если фокус не в поле ввода и не на ползунке, у которого стрелки свои).
 */
function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || el.isContentEditable;
      // Стрелки уже обработаны группой переключателей, глобусом или картой — не сдвигаем время
      if (typing || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useAppStore.getState();
      if (e.code === 'Space' && tag !== 'BUTTON') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const step = e.shiftKey ? 3_600_000 : 60_000;
        s.stepTime(e.key === 'ArrowLeft' ? -step : step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
