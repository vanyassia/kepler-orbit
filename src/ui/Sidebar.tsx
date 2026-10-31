import { Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { customToRecord } from '../data/custom';
import { isOrbiterId, ORBITERS } from '../data/orbiters';
import { POPULAR_GROUPS, POPULAR_SATELLITES } from '../data/popular';
import { BODIES } from '../physics/bodies';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { RAD } from '../physics/constants';
import { propagate } from '../physics/propagate';
import { useAppStore } from '../state/store';
import { CustomOrbitDialog } from './CustomOrbitDialog';
import { FormulaSteps } from './FormulaSteps';
import styles from './Sidebar.module.css';
import { fmt, fmtDateTime, fmtLat, fmtLon } from './format';
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
        {record.source === 'custom' ? (
          <div>
            <dt>Орбита</dt>
            <dd>своя</dd>
          </div>
        ) : (
          <div>
            <dt>{isOrbiterId(el.noradId) ? 'NAIF' : 'NORAD'}</dt>
            <dd className="num">{el.noradId}</dd>
          </div>
        )}
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

type Pick = { noradId: number; title: string; note: string };

function QuickPicks() {
  const current = useAppStore((s) => s.record?.elements.noradId);
  const pending = useAppStore((s) => s.pendingNorad);
  const loadNorad = useAppStore((s) => s.loadNorad);
  const body = useAppStore((s) => s.body);
  const customSats = useAppStore((s) => s.customSats);
  const setRecord = useAppStore((s) => s.setRecord);
  const removeCustom = useAppStore((s) => s.removeCustom);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const earth = body === 'earth';
  const mine = customSats.filter((c) => c.body === body);
  // Земля — короткий список из CelesTrak, Луна и Марс — аппараты из снимка JPL Horizons.
  // Выбранный спутник не из короткого списка остаётся виден среди кнопок.
  const picks: Pick[] = earth
    ? POPULAR_SATELLITES.filter((p) => p.featured || p.noradId === current)
    : ORBITERS.filter((o) => o.body === body).map((o) => ({ noradId: o.naifId, title: o.title, note: o.note }));
  const chip = (p: Pick) => (
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
  );
  const expanded = earth && showAll;
  return (
    <section className={styles.section} aria-label="Быстрый выбор">
      <div className={styles.chips}>
        {!expanded && picks.map(chip)}
        {/* Свои спутники этого тела: выбор и удаление */}
        {mine.map((c) => (
          <span key={c.id} className={styles.customChip} data-current={current === c.id || undefined}>
            <button type="button" className={styles.chip} aria-pressed={current === c.id} title="Свой спутник" onClick={() => setRecord(customToRecord(c))}>
              {c.name}
            </button>
            <button type="button" className={styles.chipRemove} aria-label={`Удалить спутник «${c.name}»`} title="Удалить" onClick={() => removeCustom(c.id)}>
              <X size={12} />
            </button>
          </span>
        ))}
        <button type="button" className={`${styles.chip} ${styles.addChip}`} onClick={() => setDialogOpen(true)}>
          <Plus size={13} aria-hidden="true" /> Свой спутник
        </button>
        {earth && (
          <button type="button" className={`${styles.chip} ${styles.moreChip}`} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Свернуть список' : `Все спутники: ${POPULAR_SATELLITES.length}`}
          </button>
        )}
      </div>
      {/* Группы — под кнопками: «Свернуть список» остаётся рядом, а не в конце длинного списка */}
      {expanded &&
        POPULAR_GROUPS.map((g) => (
          <div key={g.label} className={styles.pickGroup}>
            <h3 className={styles.pickGroupLabel}>{g.label}</h3>
            <div className={styles.chips}>{g.satellites.map(chip)}</div>
          </div>
        ))}
      <CustomOrbitDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
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
        <Row label="Период T" value={fmt(orbit.T / 60, 2)} unit="мин" />
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
