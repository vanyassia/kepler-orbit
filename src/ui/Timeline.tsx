import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useThrottledSimTime, useWallClock } from '../hooks/useSimClock';
import { ascendingNodeTimes } from '../physics/propagate';
import { SPEEDS, useAppStore } from '../state/store';
import styles from './Timeline.module.css';
import { fmtDateTime } from './format';

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

      <div className={styles.speeds} role="radiogroup" aria-label="Скорость симуляции">
        {SPEEDS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={speed === s} className={styles.speed} onClick={() => setSpeed(s)}>
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
            aria-valuetext={fmtDateTime(t, 3) + ' МСК'}
          />
        </div>
        <div className={styles.scale}>
          <span className="num">{fmtDateTime(start, 3, false)}</span>
          <span className={styles.legend}>
            <i className={styles.legendNode} /> восходящий узел (начало витка)
          </span>
          <span className="num">{fmtDateTime(start + span, 3, false)}</span>
        </div>
      </div>

      <div className={styles.readout}>
        <div className={`${styles.time} num`}>{fmtDateTime(t, 3)}</div>
        <div className={styles.sub}>
          МСК, <span className="num">UTC {fmtDateTime(t).slice(11)}</span>
          {!live && Math.abs(offsetH) >= 0.01 && (
            <span className={styles.offset}>
              {' '}
              {offsetH > 0 ? '+' : '−'}
              {Math.abs(offsetH) < 1 ? `${Math.round(Math.abs(offsetH) * 60)} мин` : `${Math.abs(offsetH).toFixed(1).replace('.', ',')} ч`}
            </span>
          )}
        </div>
      </div>

      <button type="button" className={styles.nowBtn} onClick={resetToNow} data-live={live || undefined}>
        <RotateCcw size={15} />
        {live ? 'В реальном времени' : 'Сейчас'}
      </button>
      <SpaceShortcut />
    </footer>
  );
}

/** Пробел — пауза/пуск (если фокус не в поле ввода). */
function SpaceShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(tag)) {
        e.preventDefault();
        const s = useAppStore.getState();
        s.setPlaying(!s.playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
