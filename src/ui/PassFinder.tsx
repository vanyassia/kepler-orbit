/**
 * «Когда пролетит над городом»: ближайшие пролёты над выбранным местом.
 * Место — город из списка или любая точка, выбранная щелчком по карте.
 * Поиск идёт по трассе той же модели (src/physics/passes.ts), от момента поиска на заданное число суток вперёд.
 */
import { MapPin } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { PLACES } from '../data/landmarks';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { DEG } from '../physics/constants';
import type { Pass } from '../physics/passes';
import { centralAngle, findPasses } from '../physics/passes';
import { subPointAt } from '../physics/propagate';
import { PASS_DAYS_OPTIONS, PASS_RADIUS_OPTIONS, passRadiusOf, passTargetOf, useAppStore } from '../state/store';
import { Revolutions, revolutionColor, trackSpan } from '../views/trackCache';
import { fmt, fmtDateTime, fmtDuration, fmtLat, fmtLon } from './format';
import styles from './PassFinder.module.css';

const DAY_MS = 86_400_000;
/** Особое значение списка мест: точка, выбранная на карте. */
const CUSTOM = '__point__';
/** Список уже на час отстал от времени модели — предлагаем искать заново. */
const STALE_MS = 3_600_000;

const daysLabel = (d: number) => (d === 1 ? 'сутки' : d === 7 ? 'неделю' : `${d} суток`);
/** Боковая панель выдвижная (телефон, планшет): её надо убрать, чтобы увидеть карту. */
const drawerSidebar = () => matchMedia('(max-width: 1100px)').matches;

export function PassFinder() {
  const id = useId();
  const orbit = useAppStore((s) => s.orbit);
  const body = useAppStore((s) => s.body);
  // Селектор возвращает сохранённый объект (он не меняется между кадрами), место по умолчанию — из useMemo
  const saved = useAppStore((s) => s.passTargets[body]);
  const target = useMemo(() => saved ?? passTargetOf({ passTargets: {} }, body), [saved, body]);
  const radius = useAppStore((s) => passRadiusOf(s, body));
  const days = useAppStore((s) => s.passDays);
  const picking = useAppStore((s) => s.pickingTarget);
  const revsBack = useAppStore((s) => s.revsBack);
  const revsForward = useAppStore((s) => s.revsForward);
  const t = useThrottledSimTime(1000);

  // Момент, от которого ищем. Сдвигается при смене места, спутника, настроек и при уходе времени за пределы списка
  const [anchor, setAnchor] = useState(t);
  useEffect(() => {
    setAnchor(useAppStore.getState().simTime);
  }, [orbit, target.lat, target.lon, radius, days]);
  useEffect(() => {
    if (t < anchor - 60_000 || t > anchor + days * DAY_MS) setAnchor(t);
  }, [t, anchor, days]);

  // Начинаем на 15 минут раньше: пролёт, который идёт прямо сейчас, остаётся в списке
  const result = useMemo(
    () => (orbit ? findPasses(orbit, target, anchor - 15 * 60_000, anchor + days * DAY_MS, { maxDistanceKm: radius }) : null),
    [orbit, target, anchor, days, radius],
  );

  // Цвет витка на карте: тот же, каким нарисован участок трассы (только для витков, которые видны на карте)
  const revColor = useMemo(() => {
    if (!orbit) return () => null;
    const span = trackSpan(orbit, revsBack, revsForward);
    const revs = new Revolutions(orbit, t, span.back, span.forward);
    const end = t + span.forward * orbit.T * 1000;
    return (p: Pass) => (p.timeMs >= t - span.back * orbit.T * 1000 && p.timeMs <= end ? revolutionColor(revs.offsetAt(p.timeMs)) : null);
  }, [orbit, t, revsBack, revsForward]);

  if (!orbit || !result) return null;

  const places = PLACES[body];
  const placeValue = target.name && places.some((c) => c.name === target.name) ? target.name : CUSTOM;
  // «Сейчас» — пока спутник в пределах сотой доли витка от момента сближения (у МКС ≈ 1,5 мин)
  const nowWindow = Math.min(30 * 60_000, Math.max(60_000, (orbit.T * 1000) / 60));
  const st = useAppStore.getState;

  const startPicking = () => {
    const s = st();
    s.setPickingTarget(true);
    if (s.view === '3d') s.setView('2d');
    if (drawerSidebar()) s.setSidebarOpen(false);
  };
  const goTo = (p: Pass) => {
    st().setSimTime(p.timeMs);
    if (drawerSidebar()) st().setSidebarOpen(false);
  };
  const onPlace = (value: string) => {
    if (value === CUSTOM) return startPicking();
    const c = places.find((x) => x.name === value);
    if (c) st().setPassTarget({ name: c.name, lat: c.lat, lon: c.lon });
  };

  const sub = subPointAt(orbit, t);
  const nowKm = centralAngle(sub.lat, sub.lon, target.lat * DEG, target.lon * DEG) * orbit.body.radius;

  return (
    <section className={styles.section} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={styles.h2}>
        Пролёты над точкой
      </h2>

      <div className={styles.placeRow}>
        <label className={styles.srOnly} htmlFor={`${id}-place`}>
          Место
        </label>
        <select id={`${id}-place`} className={styles.select} value={placeValue} onChange={(e) => onPlace(e.target.value)}>
          {places.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value={CUSTOM}>{placeValue === CUSTOM ? 'Точка на карте' : 'Точка на карте…'}</option>
        </select>
        <button type="button" className={styles.pickBtn} aria-pressed={picking} onClick={() => (picking ? st().setPickingTarget(false) : startPicking())}>
          <MapPin size={14} aria-hidden="true" />
          {picking ? 'Отмена' : 'На карте'}
        </button>
      </div>
      <p className={`${styles.coords} num`}>
        {fmtLat(target.lat, 2)}, {fmtLon(target.lon, 2)}
        {picking && <span className={styles.hint}> · выберите место на карте</span>}
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
            const past = p.timeMs < t - nowWindow;
            const now = !past && p.timeMs <= t + nowWindow;
            const color = revColor(p);
            return (
              <li key={p.timeMs}>
                <button
                  type="button"
                  className={styles.pass}
                  data-state={past ? 'past' : now ? 'now' : undefined}
                  title="Перейти к этому моменту"
                  onClick={() => goTo(p)}
                >
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
                  <span className={styles.rel}>{past ? 'прошёл' : now ? 'сейчас' : `через ${fmtDuration((p.timeMs - t) / 1000)}`}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>
          {result.closest ? (
            <>
              За {daysLabel(days)} ближе {fmt(radius)} км не пролетит. Ближе всего —{' '}
              <button type="button" className={styles.link} onClick={() => goTo(result.closest!)}>
                <span className="num">{fmt(result.closest.distanceKm)}</span> км, {fmtDateTime(result.closest.timeMs, 'MSK', false)} МСК
              </button>
              .
            </>
          ) : (
            <>
              Подспутниковая точка почти не движется относительно места: всё время около <span className="num">{fmt(nowKm)}</span> км.
            </>
          )}
        </p>
      )}
      {result.truncated && <p className={styles.note}>Показаны первые {result.passes.length}: выберите меньшее расстояние или срок.</p>}
      {t - anchor > STALE_MS && (
        <button type="button" className={styles.link} onClick={() => setAnchor(st().simTime)}>
          Искать от текущего момента
        </button>
      )}
      <p className={styles.note}>
        Время наибольшего сближения подспутниковой точки с местом; расстояние — по поверхности. Нажмите на строку, чтобы перейти к этому моменту.
      </p>
    </section>
  );
}
