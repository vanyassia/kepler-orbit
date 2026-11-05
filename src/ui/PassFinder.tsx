/**
 * «Когда пролетит над точкой»: ближайшие пролёты над местом, поставленным щелчком по карте.
 * По умолчанию выключено — сайт прежде всего для трасс. Щелчок по карте ставит точку
 * (рядом с городом — сам город), крестик убирает её. Поиск — src/physics/passes.ts.
 *
 * PassFinder — раздел боковой панели со списком, PassChip — плашка на карте с ближайшим пролётом.
 */
import { List, MapPin, X } from 'lucide-react';
import { useMemo } from 'react';
import type { Pass } from '../physics/passes';
import { PASS_DAYS_OPTIONS, PASS_RADIUS_OPTIONS, useAppStore } from '../state/store';
import { Revolutions, revolutionColor, trackSpan } from '../views/trackCache';
import { fmt, fmtDateTime, fmtDuration, fmtLat, fmtLon } from './format';
import styles from './PassFinder.module.css';
import { drawerSidebar, goToPass, usePassSearch } from './usePassSearch';

/** Список уже на час отстал от времени модели — предлагаем искать заново. */
const STALE_MS = 3_600_000;
const SECTION_ID = 'passes';

const daysLabel = (d: number) => (d === 1 ? 'сутки' : d === 7 ? 'неделю' : `${d} суток`);

export function PassFinder() {
  const search = usePassSearch();
  const revsBack = useAppStore((s) => s.revsBack);
  const revsForward = useAppStore((s) => s.revsForward);
  const body = useAppStore((s) => s.body);
  const orbit = search?.orbit;
  const t = search?.t ?? 0;

  // Цвет витка на карте: тот же, каким нарисован участок трассы (только для витков, которые видны на карте)
  const revColor = useMemo(() => {
    if (!orbit) return () => null;
    const span = trackSpan(orbit, revsBack, revsForward);
    const revs = new Revolutions(orbit, t, span.back, span.forward);
    const begin = t - span.back * orbit.T * 1000;
    const end = t + span.forward * orbit.T * 1000;
    return (p: Pass) => (p.timeMs >= begin && p.timeMs <= end ? revolutionColor(revs.offsetAt(p.timeMs)) : null);
  }, [orbit, t, revsBack, revsForward]);

  if (!search) return null;
  const { target, radius, days, result, stateOf, anchor, research } = search;
  const st = useAppStore.getState;

  return (
    <section id={SECTION_ID} className={styles.section} aria-labelledby="passes-h">
      <div className={styles.head}>
        <h2 id="passes-h" className={styles.h2}>
          {target.name ? `Пролёты: ${target.name}` : 'Пролёты над точкой'}
        </h2>
        <button type="button" className={styles.remove} onClick={() => st().clearPassTarget()} aria-label="Убрать точку" title="Убрать точку">
          <X size={16} />
        </button>
      </div>
      <p className={`${styles.coords} num`}>
        {fmtLat(target.lat, 2)}, {fmtLon(target.lon, 2)}
      </p>

      <div className={styles.filters}>
        <label>
          <span>ближе</span>
          <select className={styles.select} value={radius} onChange={(e) => st().setPassRadius(Number(e.target.value))}>
            {PASS_RADIUS_OPTIONS[body].map((r) => (
              <option key={r} value={r}>
                {fmt(r)} км
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>за</span>
          <select className={styles.select} value={days} onChange={(e) => st().setPassDays(Number(e.target.value))}>
            {PASS_DAYS_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {daysLabel(d)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {result.passes.length > 0 ? (
        <ol className={styles.list} aria-label="Пролёты по времени">
          {result.passes.map((p) => {
            const state = stateOf(p);
            const color = revColor(p);
            return (
              <li key={p.timeMs}>
                <button type="button" className={styles.pass} data-state={state} title="Перейти к этому моменту" onClick={() => goToPass(p)}>
                  <span className={`${styles.when} num`}>
                    {fmtDateTime(p.timeMs, 'MSK')}
                    <span className={styles.zone}> МСК</span>
                  </span>
                  <span className={`${styles.dist} num`}>
                    {fmt(p.distanceKm, p.distanceKm < 10 ? 1 : 0)}
                    <span className={styles.unit}>{' '}км</span>
                  </span>
                  <span className={styles.meta}>
                    {color && <span className={styles.dot} style={{ background: color }} aria-hidden="true" />}
                    <span className="num">виток {p.revolution}</span> · {p.northbound ? 'на север' : 'на юг'}
                  </span>
                  <span className={styles.rel}>{state === 'past' ? 'прошёл' : state === 'now' ? 'сейчас' : `через ${fmtDuration((p.timeMs - t) / 1000)}`}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>
          За {daysLabel(days)} ближе {fmt(radius)} км не пролетит.
          {result.closest && (
            <>
              {' '}
              Ближе всего —{' '}
              <button type="button" className={styles.link} onClick={() => goToPass(result.closest!)}>
                <span className="num">{fmt(result.closest.distanceKm)}</span> км, {fmtDateTime(result.closest.timeMs, 'MSK', false)} МСК
              </button>
              .
            </>
          )}
        </p>
      )}
      {result.truncated && <p className={styles.note}>Показаны первые {result.passes.length}: выберите меньшее расстояние или срок.</p>}
      {t - anchor > STALE_MS && (
        <button type="button" className={styles.link} onClick={research}>
          Искать от текущего момента
        </button>
      )}
      <p className={styles.note}>
        Время наибольшего сближения подспутниковой точки с местом, расстояние — по поверхности. Нажмите на строку, чтобы перейти к этому моменту. Нажатие на карту
        переносит точку.
      </p>
    </section>
  );
}

/** Плашка на карте: место, ближайший пролёт, кнопки «Все пролёты» и «Убрать точку». */
export function PassChip() {
  const search = usePassSearch();
  if (!search) return null;
  const { target, radius, days, result, stateOf, t } = search;
  const next = result.passes.find((p) => stateOf(p) !== 'past');
  const showList = () => {
    const st = useAppStore.getState();
    const drawer = drawerSidebar();
    if (drawer) st.setSidebarOpen(true);
    // Панель на телефоне выезжает 220 мс — прокручиваем, когда она уже на месте
    setTimeout(() => document.getElementById(SECTION_ID)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), drawer ? 240 : 0);
  };
  return (
    <div className={styles.chip} role="status" data-chrome="">
      <MapPin size={14} className={styles.chipPin} aria-hidden="true" />
      <span className={styles.chipText}>
        <b>{target.name ?? 'Точка'}</b>
        {' · '}
        {next ? (
          <>
            {stateOf(next) === 'now' ? 'пролетает сейчас' : `пролёт через ${fmtDuration((next.timeMs - t) / 1000)}`},{' '}
            <span className="num">{fmt(next.distanceKm)}</span>
            {' '}км
          </>
        ) : (
          <>
            за {daysLabel(days)} ближе {fmt(radius)}
            {' '}км не пролетит
          </>
        )}
      </span>
      <button type="button" onClick={showList} aria-label="Все пролёты" title="Все пролёты">
        <List size={15} />
      </button>
      <button type="button" onClick={() => useAppStore.getState().clearPassTarget()} aria-label="Убрать точку" title="Убрать точку">
        <X size={15} />
      </button>
    </div>
  );
}
