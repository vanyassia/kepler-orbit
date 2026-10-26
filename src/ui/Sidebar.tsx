import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { ORBITERS } from '../data/orbiters';
import { POPULAR_SATELLITES } from '../data/popular';
import { BODIES } from '../physics/bodies';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { RAD } from '../physics/constants';
import { propagate } from '../physics/propagate';
import { useAppStore } from '../state/store';
import { FormulaSteps } from './FormulaSteps';
import styles from './Sidebar.module.css';
import { fmt, fmtDateTime, fmtDuration, fmtLat, fmtLon } from './format';
import { satelliteTitle } from './satelliteTitle';

export function Sidebar() {
  const open = useAppStore((s) => s.sidebarOpen);
  const setOpen = useAppStore((s) => s.setSidebarOpen);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <aside id="sidebar" className={styles.sidebar} data-open={open} aria-label="Параметры спутника">
      <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Закрыть панель">
        <X size={18} />
      </button>
      <SatelliteCard />
      <QuickPicks />
      <Telemetry />
      <OrbitElements />
      <FormulaSteps />
    </aside>
  );
}

function SatelliteCard() {
  const record = useAppStore((s) => s.record);
  const error = useAppStore((s) => s.error);
  const loading = useAppStore((s) => s.loading);

  if (!record) {
    return (
      <section className={styles.card}>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : (
          <p className={styles.muted}>{loading ? 'Загрузка элементов орбиты…' : 'Выберите спутник'}</p>
        )}
      </section>
    );
  }
  const el = record.elements;
  const { title, subtitle } = satelliteTitle(el);
  return (
    <section className={styles.card}>
      <h1 className={styles.satName} translate="no">
        {title}
      </h1>
      {subtitle && (
        <div className={styles.satSub} translate="no">
          {subtitle}
        </div>
      )}
      <dl className={styles.ids}>
        <div>
          <dt>{el.noradId < 0 ? 'NAIF' : 'NORAD'}</dt>
          <dd className="num">{el.noradId}</dd>
        </div>
        {el.body && el.body !== 'earth' && (
          <div>
            <dt>Центральное тело</dt>
            <dd>{BODIES[el.body].name}</dd>
          </div>
        )}
        {el.cosparId && (
          <div>
            <dt>COSPAR</dt>
            <dd className="num">{el.cosparId}</dd>
          </div>
        )}
        <div className={styles.wide}>
          <dt>Эпоха элементов, UTC</dt>
          <dd className="num">{fmtDateTime(el.epochMs)}</dd>
        </div>
      </dl>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function QuickPicks() {
  const current = useAppStore((s) => s.record?.elements.noradId);
  const pending = useAppStore((s) => s.pendingNorad);
  const loadNorad = useAppStore((s) => s.loadNorad);
  const body = useAppStore((s) => s.body);
  // Земля — популярные спутники из CelesTrak, Луна и Марс — аппараты из снимка JPL Horizons
  const picks =
    body === 'earth'
      ? POPULAR_SATELLITES
      : ORBITERS.filter((o) => o.body === body).map((o) => ({ noradId: o.naifId, title: o.title, note: o.note }));
  return (
    <section className={styles.section} aria-label="Быстрый выбор">
      <div className={styles.chips}>
        {picks.map((p) => (
          <button
            key={p.noradId}
            type="button"
            className={styles.chip}
            aria-pressed={current === p.noradId}
            data-pending={pending === p.noradId || undefined}
            title={p.note}
            onClick={() => void loadNorad(p.noradId)}
          >
            {p.title}
          </button>
        ))}
      </div>
    </section>
  );
}

function Telemetry() {
  const orbit = useAppStore((s) => s.orbit);
  const t = useThrottledSimTime(100);
  const s = useMemo(() => (orbit ? propagate(orbit, t) : null), [orbit, t]);
  if (!orbit || !s) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Текущее положение</h2>
      <div className={styles.bigGrid}>
        <Big label="Широта φ" value={fmtLat(s.lat * RAD, 2)} />
        <Big label="Долгота λ" value={fmtLon(s.lon * RAD, 2)} />
        <Big label="Высота h" value={fmt(s.h, 1)} unit="км" />
        <Big label="Скорость V" value={fmt(s.V, 3)} unit="км/с" />
      </div>
      <dl className={styles.rows}>
        <Row label="Радиус-вектор r" value={fmt(s.r, 1)} unit="км" />
        <Row label="Истинная аномалия ν" value={fmt(s.theta * RAD, 2)} unit="°" />
        <Row label="Аргумент широты u" value={fmt(s.u * RAD, 2)} unit="°" />
        <Row label="Радиальная скорость Vr" value={fmt(s.Vr, 4)} unit="км/с" />
        <Row label="Виток от эпохи" value={String(s.revolution)} />
      </dl>
    </section>
  );
}

function OrbitElements() {
  const orbit = useAppStore((s) => s.orbit);
  if (!orbit) return null;
  const el = orbit.elements;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Элементы орбиты</h2>
      <dl className={styles.rows}>
        <Row label="Большая полуось a" value={fmt(orbit.a, 1)} unit="км" />
        <Row label="Эксцентриситет e" value={fmt(orbit.e, 6)} />
        <Row label="Наклонение i" value={fmt(el.inclinationDeg, 4)} unit="°" />
        <Row label="Долгота восх. узла Ω" value={fmt(el.raanDeg, 4)} unit="°" />
        <Row label="Аргумент перицентра ω" value={fmt(el.argPerigeeDeg, 4)} unit="°" />
        <Row label="Средняя аномалия M₀" value={fmt(el.meanAnomalyDeg, 4)} unit="°" />
        <Row label="Среднее движение N" value={fmt(el.meanMotion, 5)} unit="об/сут" />
        <Row label="Период T" value={fmtDuration(orbit.T)} />
        <Row label="Высота перигея" value={fmt(orbit.hPerigee, 1)} unit="км" />
        <Row label="Высота апогея" value={fmt(orbit.hApogee, 1)} unit="км" />
      </dl>
    </section>
  );
}

function Big({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className={styles.big}>
      <div className={styles.bigLabel}>{label}</div>
      <div className={styles.bigValue}>
        <span className="num">{value}</span>
        {unit && <span className={styles.unit}>{'\u00a0' + unit}</span>}
      </div>
    </div>
  );
}

function Row({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>
        <span className="num">{value}</span>
        {unit && <span className={styles.unit}>{unit === '°' ? unit : '\u00a0' + unit}</span>}
      </dd>
    </div>
  );
}
