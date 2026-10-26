/**
 * Сравнение нашей модели (задача двух тел) с эталоном SGP4:
 * текущее расхождение, его разложение по орбитальным осям и график |Δr| от эпохи элементов.
 */
import { useMemo, useRef, useState } from 'react';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { propagate } from '../physics/propagate';
import { deviation } from '../reference/compare';
import { referenceState } from '../reference/sgp4';
import { useAppStore } from '../state/store';
import styles from './ReferencePanel.module.css';
import { fmt, fmtDuration } from './format';

const DAY = 86_400_000;
const SAMPLES = 240;

interface Sample {
  t: number;
  d: number;
}

/** Окно графика: от эпохи (или чуть раньше текущего момента) с запасом вперёд, по полсуток. */
function chartRange(epoch: number, t: number): [number, number] {
  const half = DAY / 2;
  if (t < epoch) return [Math.floor((t - DAY / 4) / half) * half, epoch + DAY];
  return [epoch, epoch + Math.min(10 * DAY, Math.max(DAY, Math.ceil((t - epoch + DAY / 4) / half) * half))];
}

export function ReferencePanel() {
  const orbit = useAppStore((s) => s.orbit);
  const satrec = useAppStore((s) => s.reference);
  const t = useThrottledSimTime(200);

  const now = useMemo(() => {
    if (!orbit || !satrec) return null;
    const ref = referenceState(satrec, t);
    if (!ref) return null;
    const ours = propagate(orbit, t);
    return { dev: deviation(ours, ref), dh: ref.h - ours.h };
  }, [orbit, satrec, t]);

  const epoch = orbit?.epochMs ?? 0;
  const [r0, r1] = chartRange(epoch, t);
  const samples = useMemo<Sample[]>(() => {
    if (!orbit || !satrec) return [];
    const out: Sample[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const tt = r0 + ((r1 - r0) * k) / SAMPLES;
      const ref = referenceState(satrec, tt);
      if (ref) out.push({ t: tt, d: deviation(propagate(orbit, tt), ref).total });
    }
    return out;
  }, [orbit, satrec, r0, r1]);

  if (!orbit || orbit.body.id !== 'earth') return null;
  if (!satrec) {
    return (
      <section className={styles.section}>
        <h2 className={styles.h2}>Сравнение с эталоном SGP4</h2>
        <p className={styles.muted}>Для этого спутника нет исходной записи каталога — эталон рассчитать нельзя.</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Сравнение с эталоном SGP4</h2>
      <p className={styles.muted}>
        SGP4 учитывает сжатие Земли и атмосферу; наша модель — нет. Возраст элементов:{' '}
        <span className="num">{fmtDuration((t - epoch) / 1000)}</span>
        {t < epoch ? ' до эпохи' : ''}.
      </p>
      {now && (
        <>
          <div className={styles.hero}>
            <span className={`${styles.heroValue} num`}>{fmt(now.dev.total, 1)}</span>
            <span className={styles.heroUnit}>км — расхождение положений |Δr|</span>
          </div>
          <dl className={styles.rows}>
            <Row label="по радиусу Δr_r" value={now.dev.radial} />
            <Row label="вдоль орбиты Δr_τ" value={now.dev.along} />
            <Row label="поперёк плоскости Δr_b" value={now.dev.cross} />
            <Row label="между подспутн. точками" value={now.dev.ground} />
            <Row label="по высоте Δh" value={now.dh} />
          </dl>
        </>
      )}
      <DeviationChart samples={samples} range={[r0, r1]} epoch={epoch} t={t} />
    </section>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>
        <span className="num">{fmt(value, 1)}</span> <span className={styles.unit}>км</span>
      </dd>
    </div>
  );
}

const W = 320;
const H = 150;
const M = { l: 40, r: 10, t: 10, b: 24 };

/** «Красивый» верхний предел оси: 1, 2, 5 × 10ⁿ. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

const relLabel = (ms: number) => {
  const h = ms / 3_600_000;
  if (Math.abs(h) < 0.01) return 'эпоха';
  return Math.abs(h) % 24 === 0 ? `${h > 0 ? '+' : '−'}${Math.abs(h / 24)} сут` : `${h > 0 ? '+' : '−'}${Math.abs(h)} ч`;
};

/** График |Δr|(t): один ряд, перекрестие с подсказкой, отметка текущего момента, таблица значений. */
function DeviationChart({ samples, range, epoch, t }: { samples: Sample[]; range: [number, number]; epoch: number; t: number }) {
  const [hover, setHover] = useState<Sample | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (samples.length < 2) return null;

  const [r0, r1] = range;
  const yMax = niceMax(Math.max(...samples.map((s) => s.d)));
  const x = (tt: number) => M.l + ((tt - r0) / (r1 - r0)) * (W - M.l - M.r);
  const y = (d: number) => H - M.b - (d / yMax) * (H - M.t - M.b);
  const path = samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)},${y(s.d).toFixed(1)}`).join('');

  // Деления по времени: каждые 6/12/24 ч в зависимости от ширины окна
  const spanH = (r1 - r0) / 3_600_000;
  const stepH = spanH <= 36 ? 6 : spanH <= 96 ? 12 : 24;
  const ticks: number[] = [];
  for (let h = Math.ceil((r0 - epoch) / 3_600_000 / stepH) * stepH; epoch + h * 3_600_000 <= r1; h += stepH) ticks.push(epoch + h * 3_600_000);
  const yTicks = [0, yMax / 2, yMax];

  const current = t >= r0 && t <= r1 ? samples.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a)) : null;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const tt = r0 + ((px - M.l) / (W - M.l - M.r)) * (r1 - r0);
    setHover(samples.reduce((a, b) => (Math.abs(b.t - tt) < Math.abs(a.t - tt) ? b : a)));
  };

  // Таблица: значения в характерные моменты от эпохи
  const tableAt = [0, 3, 6, 12, 24, 48].map((h) => epoch + h * 3_600_000).filter((tt) => tt >= r0 && tt <= r1);
  const valueAt = (tt: number) => samples.reduce((a, b) => (Math.abs(b.t - tt) < Math.abs(a.t - tt) ? b : a)).d;

  const tip = hover ?? current;

  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>Расхождение |Δr|, км, по времени от эпохи элементов</figcaption>
      <div className={styles.chartWrap}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className={styles.chart}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`График расхождения моделей; максимум на графике ${fmt(Math.max(...samples.map((s) => s.d)), 0)} км`}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className={styles.grid} />
              <text x={M.l - 6} y={y(v)} className={styles.tickY}>
                {fmt(v, 0)}
              </text>
            </g>
          ))}
          {ticks.map((tt) => (
            <text key={tt} x={x(tt)} y={H - 6} className={styles.tickX}>
              {relLabel(tt - epoch)}
            </text>
          ))}
          <path d={path} className={styles.line} />
          {current && (
            <g>
              <line x1={x(current.t)} x2={x(current.t)} y1={M.t} y2={H - M.b} className={styles.now} />
              <circle cx={x(current.t)} cy={y(current.d)} r={4} className={styles.nowDot} />
            </g>
          )}
          {hover && (
            <g>
              <line x1={x(hover.t)} x2={x(hover.t)} y1={M.t} y2={H - M.b} className={styles.cross} />
              <circle cx={x(hover.t)} cy={y(hover.d)} r={4} className={styles.hoverDot} />
            </g>
          )}
        </svg>
        {tip && (
          <div className={styles.tip} aria-live="polite">
            <span className={`${styles.tipValue} num`}>{fmt(tip.d, 1)} км</span>
            <span className={styles.tipLabel}>
              {hover ? '' : 'сейчас, '}
              {(tip.t - epoch) / 1000 >= 0 ? '+' : '−'}
              {fmtDuration(Math.abs(tip.t - epoch) / 1000)} от эпохи
            </span>
          </div>
        )}
      </div>
      {tableAt.length > 0 && (
        <details className={styles.table}>
          <summary>Таблица значений</summary>
          <table>
            <thead>
              <tr>
                <th>От эпохи</th>
                <th>|Δr|, км</th>
              </tr>
            </thead>
            <tbody className="num">
              {tableAt.map((tt) => (
                <tr key={tt}>
                  <td>{relLabel(tt - epoch)}</td>
                  <td>{fmt(valueAt(tt), 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </figure>
  );
}
