import { Download, History, Plus, Presentation, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { customToRecord } from '../data/custom';
import { historicById } from '../data/historicOrbiters';
import { isOrbiterId, ORBITERS } from '../data/orbiters';
import { photoFor } from '../data/photos';
import { POPULAR_GROUPS, POPULAR_SATELLITES } from '../data/popular';
import { BODIES } from '../physics/bodies';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { RAD } from '../physics/constants';
import { propagate } from '../physics/propagate';
import { useAppStore } from '../state/store';
import { CapsLabel } from './CapsLabel';
import { CustomOrbitDialog } from './CustomOrbitDialog';
import { FormulaSteps } from './FormulaSteps';
import { OrbitCharts } from './OrbitCharts';
import { OrbitTuner } from './OrbitTuner';
import { PassFinder } from './PassFinder';
import { PhotoThumb } from './SatellitePhoto';
import { startPresentation } from './Presentation';
import styles from './Sidebar.module.css';
import { fmt, fmtDateTime, fmtLat, fmtLon } from './format';
import { satelliteTitle } from './satelliteTitle';

/** Ширина, на которой панель выдвигается поверх вида (тот же порог, что в Sidebar.module.css). */
const DRAWER_QUERY = '(max-width: 1100px)';

function useDrawerMode(): boolean {
  const [drawer, setDrawer] = useState(() => matchMedia(DRAWER_QUERY).matches);
  useEffect(() => {
    const mq = matchMedia(DRAWER_QUERY);
    const onChange = () => setDrawer(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return drawer;
}

export function Sidebar() {
  const open = useAppStore((s) => s.sidebarOpen);
  const setOpen = useAppStore((s) => s.setSidebarOpen);
  // Окно выгрузки живёт в шапке: пока оно открыто, шапку не выключаем — окно само держит фокус
  const exportOpen = useAppStore((s) => s.exportOpen);
  const drawer = useDrawerMode();
  const asideRef = useRef<HTMLElement>(null);
  const modal = open && drawer;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Esc в открытом окне (свой спутник, TLE, снимок) закрывает только окно, а не панель
      if (e.key === 'Escape' && !document.querySelector('dialog[open]')) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Объявлено раньше эффекта фокуса: при закрытии страница включается до того, как фокус вернётся на кнопку
  useEffect(() => {
    const aside = asideRef.current;
    if (!modal || exportOpen || !aside?.parentElement) return;
    // Подложку не выключаем: касание мимо панели её закрывает
    const others = [...aside.parentElement.children].filter((el): el is HTMLElement => el !== aside && el instanceof HTMLElement && !el.inert && !('sidebarBackdrop' in el.dataset));
    others.forEach((el) => (el.inert = true));
    return () => others.forEach((el) => (el.inert = false));
  }, [modal, exportOpen]);

  // Выдвинутая панель закрывает вид, как окно: фокус переходит в неё, остальная страница
  // выключается (inert — Tab не уходит под панель), после закрытия фокус возвращается на кнопку
  useEffect(() => {
    const aside = asideRef.current;
    if (!modal || !aside) return;
    // Куда вернуть фокус. Обычно это кнопка панели, но к этому моменту она уже выключена (inert)
    // и фокус ушёл на body — тогда ниже берём саму кнопку
    const active = document.activeElement;
    const back = active instanceof HTMLElement && active !== document.body && !aside.contains(active) ? active : null;
    if (!aside.contains(document.activeElement)) aside.focus({ preventScroll: true });
    return () => {
      const toggle = document.querySelector<HTMLElement>('[aria-controls="sidebar"]');
      // Фокус возвращаем, только если он остался в панели или потерялся (панель закрыли с клавиатуры)
      const lost = !document.activeElement || document.activeElement === document.body || aside.contains(document.activeElement);
      if (lost) (back?.isConnected ? back : toggle)?.focus({ preventScroll: true });
    };
  }, [modal]);

  return (
    <aside
      id="sidebar"
      ref={asideRef}
      className={styles.sidebar}
      data-open={open}
      aria-label="Параметры спутника"
      data-chrome=""
      role={modal ? 'dialog' : undefined}
      aria-modal={modal || undefined}
      tabIndex={modal ? -1 : undefined}
    >
      <button type="button" className={styles.close} onClick={() => setOpen(false)} aria-label="Закрыть панель">
        <X size={18} />
      </button>
      <SatelliteCard />
      <QuickPicks />
      {/* У своего спутника ползунки — первым разделом: так нагляднее, как они меняют всё ниже */}
      <OrbitTuner />
      <Telemetry />
      <OrbitElements />
      <OrbitCharts />
      <PassFinder />
      <FormulaSteps />
    </aside>
  );
}

function SatelliteCard() {
  const record = useAppStore((s) => s.record);
  const setExportOpen = useAppStore((s) => s.setExportOpen);
  const error = useAppStore((s) => s.error);
  const loading = useAppStore((s) => s.loading);
  const tuned = useAppStore((s) => s.tuneBase !== null);

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
  // У своего спутника снимка нет: номер у него условный
  const photo = record.source === 'custom' ? null : photoFor(el.body, el.noradId);
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.cardTitle}>
          <h1 className={styles.satName} translate="no">
            {title}
          </h1>
          {subtitle && (
            <div className={styles.satSub} translate="no">
              {subtitle}
            </div>
          )}
        </div>
        {photo && <PhotoThumb photo={photo} title={title} />}
      </div>
      <dl className={styles.ids}>
        {record.source === 'custom' || record.source === 'historic' ? (
          <div>
            <dt>Орбита</dt>
            <dd>{record.source === 'custom' ? 'своя' : 'историческая'}</dd>
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
      <div className={styles.cardActions}>
        <button type="button" className={styles.exportBtn} onClick={() => setExportOpen(true)}>
          <Download size={14} aria-hidden="true" /> Выгрузка данных
        </button>
        <button type="button" className={styles.exportBtn} onClick={startPresentation} title="Только карта или глобус на весь экран. Выход — Esc или кнопка в углу">
          <Presentation size={14} aria-hidden="true" /> Показ
        </button>
      </div>
      {tuned && <p className={styles.satNote}>Орбита изменена ползунками в разделе «Изменить орбиту».</p>}
      {record.source === 'historic' && <p className={styles.satNote}>{historicById(el.noradId)?.detail}</p>}
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
            <button type="button" className={styles.chip} aria-pressed={current === c.id} title={`Свой спутник: ${c.name}`} onClick={() => setRecord(customToRecord(c))}>
              {c.name}
            </button>
            <button type="button" className={styles.chipRemove} aria-label={`Удалить спутник «${c.name}»`} title="Удалить" onClick={() => confirm(`Удалить спутник «${c.name}»? Вернуть его будет нельзя.`) && removeCustom(c.id)}>
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
        <Row
          label="Виток от эпохи"
          value={String(s.revolution)}
          action={
            <button
              type="button"
              className={styles.rowAction}
              onClick={() => useAppStore.getState().setSimTime(orbit.epochMs)}
              title={`Перейти к эпохе элементов: ${fmtDateTime(orbit.epochMs)} UTC`}
            >
              <History size={12} aria-hidden="true" />к эпохе
            </button>
          }
        />
      </dl>
    </section>
  );
}

function OrbitElements() {
  const orbit = useAppStore((s) => s.orbit);
  if (!orbit) return null;
  const el = orbit.elements;
  const earth = orbit.body.id === 'earth';
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
        {/* Перигей и апогей — только у Земли (как в листке); у Луны и Марса — перицентр и апоцентр */}
        <Row label={earth ? 'Высота перигея' : 'Высота перицентра'} value={fmt(orbit.hPerigee, 1)} unit="км" />
        <Row label={earth ? 'Высота апогея' : 'Высота апоцентра'} value={fmt(orbit.hApogee, 1)} unit="км" />
      </dl>
    </section>
  );
}

function Big({ label, value, unit: unitProp }: { label: string; value: string; unit?: string }) {
  // «23,95° с. ш.»: полушарие идёт мелким шрифтом, как единица (в Tektur «д» похожа на латинскую «g»)
  const hemi = unitProp ? null : /^(.*°)\s(.+)$/.exec(value);
  const num = hemi ? hemi[1] : value;
  const unit = hemi ? hemi[2] : unitProp;
  return (
    <div className={styles.big}>
      <div className={`${styles.bigLabel} caps`}>
        <CapsLabel text={label} />
      </div>
      <div className={styles.bigValue}>
        <span className={styles.bigNum}>{num}</span>
        {unit && <span className={styles.bigUnit}>{'\u00a0' + unit}</span>}
      </div>
    </div>
  );
}

function Row({ label, value, unit, action }: { label: string; value: string; unit?: string; action?: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <dt>{label}</dt>
      <dd>
        {action}
        <span className="num">{value}</span>
        {unit && <span className={styles.unit}>{unit === '°' ? unit : '\u00a0' + unit}</span>}
      </dd>
    </div>
  );
}
