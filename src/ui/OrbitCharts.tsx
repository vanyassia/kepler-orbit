/**
 * «Графики за виток»: высота h, скорость V, широта φ и истинная аномалия ν
 * от перицентра до следующего перицентра, с отметкой текущего момента.
 * По краям — перицентр, посередине — апоцентр: на вытянутых орбитах («Молния», «Меридиан»)
 * хорошо видно, как аппарат быстро проносится у перицентра и долго висит у апоцентра.
 *
 * Наведение показывает значения в любой момент витка, щелчок (касание) переводит туда время.
 * Расчёт точек — src/physics/orbitProfile.ts.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { RAD } from '../physics/constants';
import type { OrbitProfile, ProfilePoint } from '../physics/orbitProfile';
import { orbitProfile, perigeeBefore, profileAt } from '../physics/orbitProfile';
import { useAppStore } from '../state/store';
import { fmt, fmtDateTime, fmtDuration, fmtLat } from './format';
import styles from './OrbitCharts.module.css';

/** Поле слева под подписи оси, высота одного графика, отступы сверху и снизу — px. */
const GUTTER = 50;
const PLOT_H = 52;
const PAD_Y = 6;

interface ChartDef {
  key: string;
  label: string;
  value: (p: ProfilePoint) => number;
  /** Подпись значения в заголовке графика. */
  show: (v: number) => string;
  /** Подпись на оси; span — разница между пределами оси. */
  tick: (v: number, span: number) => string;
  /** Постоянные пределы оси (для ν — от 0 до 360°). */
  fixed?: [number, number];
}

/** Знаков после запятой, чтобы разница между пределами оси была видна. */
const digitsFor = (span: number) => (span >= 10 ? 1 : span >= 1 ? 2 : 3);

const CHARTS: ChartDef[] = [
  {
    key: 'h',
    label: 'Высота h',
    value: (p) => p.h,
    show: (v) => `${fmt(v, 1)} км`,
    tick: (v, span) => fmt(v, span >= 10 ? 0 : 1),
  },
  {
    key: 'V',
    label: 'Скорость V',
    value: (p) => p.V,
    show: (v) => `${fmt(v, 3)} км/с`,
    tick: (v, span) => fmt(v, digitsFor(span)),
  },
  {
    key: 'lat',
    label: 'Широта φ',
    value: (p) => p.lat * RAD,
    show: (v) => fmtLat(v, 2),
    tick: (v, span) => `${fmt(v, span >= 10 ? 0 : 1)}°`,
  },
  {
    key: 'theta',
    label: 'Истинная аномалия ν',
    value: (p) => p.theta * RAD,
    show: (v) => `${fmt(v, 2)}°`,
    tick: (v) => `${fmt(v, 0)}°`,
    fixed: [0, 360],
  },
];

export function OrbitCharts() {
  const orbit = useAppStore((s) => s.orbit);
  const t = useThrottledSimTime(100);
  const startMs = orbit ? Math.round(perigeeBefore(orbit, t)) : 0;
  const profile = useMemo(() => (orbit ? orbitProfile(orbit, startMs) : null), [orbit, startMs]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverMs, setHoverMs] = useState<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [profile !== null]);

  // Новый виток или другой спутник — наведение сбрасываем
  useEffect(() => setHoverMs(null), [profile]);

  if (!orbit || !profile) return null;
  const plotW = Math.max(40, width - GUTTER);
  const span = profile.endMs - profile.startMs;
  const xOf = (ms: number) => GUTTER + ((ms - profile.startMs) / span) * plotW;
  const msAt = (clientX: number) => {
    const rect = boxRef.current!.getBoundingClientRect();
    const f = (clientX - rect.left - GUTTER) / plotW;
    return profile.startMs + Math.max(0, Math.min(1, f)) * span;
  };

  const now = profileAt(profile, t);
  const hover = hoverMs === null ? null : profileAt(profile, hoverMs);
  const shown = hover ?? now;
  const sinceStart = (shown.timeMs - profile.startMs) / 1000;

  const go = (ms: number) => useAppStore.getState().setSimTime(ms);

  return (
    <section className={styles.section} aria-labelledby="orbit-charts-h">
      <h2 id="orbit-charts-h" className={styles.h2}>
        Графики за виток
      </h2>
      <div
        ref={boxRef}
        className={styles.charts}
        onPointerMove={(e) => setHoverMs(msAt(e.clientX))}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHoverMs(null)}
        onPointerUp={(e) => {
          go(msAt(e.clientX));
          // На сенсорном экране после касания остаётся только отметка текущего момента
          if (e.pointerType !== 'mouse') setHoverMs(null);
        }}
        onPointerCancel={() => setHoverMs(null)}
      >
        {width > 0 &&
          CHARTS.map((c) => (
            <Chart key={c.key} def={c} profile={profile} width={width} xOf={xOf} now={now} hover={hover} shown={shown} />
          ))}
        {width > 0 && (
          <div className={styles.axis} style={{ paddingLeft: GUTTER }}>
            <span>перицентр</span>
            <span className={styles.axisMid} style={{ left: GUTTER + plotW / 2 }}>
              апоцентр
            </span>
            <span>перицентр</span>
          </div>
        )}
      </div>
      <p className={`${styles.caption} num`} aria-live="off">
        {hover ? (
          <>
            {fmtDateTime(shown.timeMs)} UTC · {fmtDuration(sinceStart)} после перицентра. Щелчок — перейти к этому моменту
          </>
        ) : (
          <>
            Текущий момент — {fmtDuration(sinceStart)} после перицентра, период {fmtDuration(orbit.T)}
          </>
        )}
      </p>
    </section>
  );
}

function Chart({
  def,
  profile,
  width,
  xOf,
  now,
  hover,
  shown,
}: {
  def: ChartDef;
  profile: OrbitProfile;
  width: number;
  xOf: (ms: number) => number;
  now: ProfilePoint;
  hover: ProfilePoint | null;
  shown: ProfilePoint;
}) {
  const H = PLOT_H + 2 * PAD_Y;
  const { path, yOf, lo, hi } = useMemo(() => {
    const vals = profile.points.map(def.value);
    let lo = def.fixed ? def.fixed[0] : Math.min(...vals);
    let hi = def.fixed ? def.fixed[1] : Math.max(...vals);
    // Почти круговая орбита: высота и скорость почти постоянны — не раздуваем шум на всю высоту графика
    if (hi - lo < 1e-9) {
      lo -= 1;
      hi += 1;
    }
    const yOf = (v: number) => PAD_Y + (1 - (v - lo) / (hi - lo)) * PLOT_H;
    let d = '';
    profile.points.forEach((p, k) => {
      d += `${k ? 'L' : 'M'}${xOf(p.timeMs).toFixed(1)} ${yOf(vals[k]).toFixed(1)}`;
    });
    return { path: d, yOf, lo, hi };
    // xOf зависит только от ширины и витка
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, profile, width]);

  const xNow = xOf(now.timeMs);
  const xApo = xOf(profile.apoMs);
  const tick = (v: number) => def.tick(v, hi - lo);
  const mid = def.fixed ? (lo + hi) / 2 : null;

  return (
    <div className={styles.chart}>
      <div className={styles.head}>
        <span className={styles.label}>{def.label}</span>
        <span className={`${styles.value} num`} data-hover={hover ? true : undefined}>
          {def.show(def.value(shown))}
        </span>
      </div>
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        className={styles.svg}
        role="img"
        aria-label={`${def.label} за виток: от ${tick(lo)} до ${tick(hi)}, сейчас ${def.show(def.value(now))}`}
      >
        {/* Рамка оси: верх и низ, середина витка (апоцентр) */}
        <line x1={GUTTER} x2={width} y1={PAD_Y} y2={PAD_Y} className={styles.grid} />
        <line x1={GUTTER} x2={width} y1={PAD_Y + PLOT_H} y2={PAD_Y + PLOT_H} className={styles.grid} />
        {mid !== null && <line x1={GUTTER} x2={width} y1={yOf(mid)} y2={yOf(mid)} className={styles.grid} />}
        <line x1={xApo} x2={xApo} y1={PAD_Y} y2={PAD_Y + PLOT_H} className={styles.apo} />
        <text x={GUTTER - 6} y={PAD_Y} className={styles.tick} dominantBaseline="middle">
          {tick(hi)}
        </text>
        <text x={GUTTER - 6} y={PAD_Y + PLOT_H} className={styles.tick} dominantBaseline="middle">
          {tick(lo)}
        </text>
        {mid !== null && (
          <text x={GUTTER - 6} y={yOf(mid)} className={styles.tick} dominantBaseline="middle">
            {tick(mid)}
          </text>
        )}

        <path d={path} className={styles.line} />

        {/* Текущий момент */}
        <line x1={xNow} x2={xNow} y1={PAD_Y - 2} y2={PAD_Y + PLOT_H + 2} className={styles.nowLine} />
        <circle cx={xNow} cy={yOf(def.value(now))} r={4} className={styles.nowDot} />

        {/* Наведение */}
        {hover && (
          <>
            <line x1={xOf(hover.timeMs)} x2={xOf(hover.timeMs)} y1={PAD_Y} y2={PAD_Y + PLOT_H} className={styles.hoverLine} />
            <circle cx={xOf(hover.timeMs)} cy={yOf(def.value(hover))} r={3.5} className={styles.hoverDot} />
          </>
        )}
      </svg>
    </div>
  );
}
