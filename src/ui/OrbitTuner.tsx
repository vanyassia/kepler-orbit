/**
 * «Изменить орбиту»: ползунки высоты перицентра, вытянутости (эксцентриситета) и наклонения
 * прямо в боковой панели. Трасса, орбита и графики пересчитываются сразу — видно, как каждый
 * элемент меняет картину. Пересчёт элементов — src/data/orbitTune.ts, состояние — tuneOrbit в store.
 *
 * Только для своих спутников: орбиты настоящих аппаратов не подменяем (решение пользователя).
 */
import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { isCustomId } from '../data/custom';
import type { TunePatch } from '../data/orbitTune';
import { E_MAX, heightFromSlider, niceHeight, shapeOf, sliderFromHeight, TUNE_HEIGHT } from '../data/orbitTune';
import { useAppStore } from '../state/store';
import { fmt, fmtDuration } from './format';
import styles from './OrbitTuner.module.css';

/** Число делений ползунка высоты (шкала логарифмическая). */
const STEPS = 1000;

export function OrbitTuner() {
  const record = useAppStore((s) => s.record);
  const base = useAppStore((s) => s.tuneBase);
  const idBase = useId();

  // Ползунок шлёт много событий за кадр — пересчитываем орбиту не чаще одного раза за кадр
  const pending = useRef<TunePatch | null>(null);
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const tune = (patch: TunePatch) => {
    pending.current = { ...pending.current, ...patch };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const p = pending.current;
      pending.current = null;
      if (p) useAppStore.getState().tuneOrbit(p);
    });
  };

  if (!record || !isCustomId(record.elements.noradId)) return null;
  const el = record.elements;
  const body = el.body ?? 'earth';
  const sh = shapeOf(el);
  // Пределы шкалы высоты — по исходной орбите, чтобы шкала не «ехала» под пальцем
  const start = shapeOf((base?.record ?? record).elements);
  const hMin = Math.min(TUNE_HEIGHT[body].min, Math.max(1, start.hPeri));
  const hMax = Math.max(TUNE_HEIGHT[body].max, start.hPeri);

  const row = (key: string, label: string, value: string, input: React.ReactNode) => (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <label htmlFor={`${idBase}-${key}`}>{label}</label>
        <output htmlFor={`${idBase}-${key}`} className="num">
          {value}
        </output>
      </div>
      {input}
    </div>
  );

  const hText = `${fmt(sh.hPeri, 0)} км`;
  return (
    <section className={styles.section} aria-labelledby={`${idBase}-h`}>
      <div className={styles.head}>
        <h2 id={`${idBase}-h`} className={styles.h2}>
          Изменить орбиту
        </h2>
        {base && (
          <button type="button" className={styles.reset} onClick={() => useAppStore.getState().resetTune()}>
            <RotateCcw size={13} aria-hidden="true" /> Как было
          </button>
        )}
      </div>

      {row(
        'hp',
        'Высота перицентра hп',
        hText,
        <input
          id={`${idBase}-hp`}
          type="range"
          className={styles.range}
          min={0}
          max={STEPS}
          step={1}
          value={Math.round(sliderFromHeight(sh.hPeri, hMin, hMax) * STEPS)}
          aria-valuetext={hText}
          onChange={(e) => tune({ hPeri: niceHeight(heightFromSlider(Number(e.target.value) / STEPS, hMin, hMax)) })}
        />,
      )}
      {row(
        'e',
        'Вытянутость e',
        fmt(sh.e, 3),
        <input
          id={`${idBase}-e`}
          type="range"
          className={styles.range}
          min={0}
          max={E_MAX}
          step={0.001}
          value={sh.e}
          aria-valuetext={`эксцентриситет ${fmt(sh.e, 3)}`}
          onChange={(e) => tune({ e: Number(e.target.value) })}
        />,
      )}
      {row(
        'i',
        'Наклонение i',
        `${fmt(sh.inclinationDeg, 1)}°`,
        <input
          id={`${idBase}-i`}
          type="range"
          className={styles.range}
          min={0}
          max={180}
          step={0.1}
          value={sh.inclinationDeg}
          aria-valuetext={`${fmt(sh.inclinationDeg, 1)} градуса`}
          onChange={(e) => tune({ inclinationDeg: Number(e.target.value) })}
        />,
      )}

      <p className={`${styles.summary} num`}>
        hа = {fmt(sh.hApo, 0)}&nbsp;км · T = {fmtDuration(sh.T)}
      </p>
      <p className={styles.note}>
        Перицентр остаётся на месте, вытянутость поднимает апоцентр. Ω, ω и M₀ не меняются. Новая орбита сохраняется в спутнике.
      </p>
    </section>
  );
}
