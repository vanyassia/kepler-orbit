import { Layers as LayersIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { Layers } from '../state/store';
import { useAppStore } from '../state/store';
import { PLACES_LABEL } from '../data/landmarks';
import styles from './LayersMenu.module.css';

const LABELS: Record<keyof Layers, string> = {
  imagery: 'Спутниковый снимок',
  night: 'День и ночь',
  borders: 'Границы государств',
  grid: 'Координатная сетка',
  cities: 'Города',
  visibility: 'Зона радиовидимости',
  helpers: 'Экватор, узлы, апсиды',
  clouds: 'Облака',
  regions: 'Регионы (названия IAU)',
};

/** Выпадающее меню слоёв вида + дополнительные настройки (children). */
export function LayersMenu({ keys, children }: { keys: (keyof Layers)[]; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const layers = useAppStore((s) => s.layers);
  const body = useAppStore((s) => s.body);
  const toggle = useAppStore((s) => s.toggleLayer);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape закрывает меню и возвращает фокус на кнопку «Слои»
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      if (ref.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        title="Слои"
      >
        <LayersIcon size={16} />
        <span>Слои</span>
      </button>
      {open && (
        <div id={id} className={styles.panel}>
          {keys.map((k) => (
            <label key={k} className={styles.item}>
              <input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} />
              <span className={styles.box} aria-hidden="true" />
              {k === 'cities' ? PLACES_LABEL[body] : LABELS[k]}
            </label>
          ))}
          {children && <div className={styles.extra}>{children}</div>}
        </div>
      )}
    </div>
  );
}

/** Число витков трассы назад и вперёд. */
export function RevsControl() {
  const back = useAppStore((s) => s.revsBack);
  const fwd = useAppStore((s) => s.revsForward);
  const setRevs = useAppStore((s) => s.setRevs);
  return (
    <div className={styles.revs}>
      <Stepper label="Витков назад" value={back} min={0} max={5} onChange={(v) => setRevs(v, fwd)} />
      <Stepper label="Витков вперёд" value={fwd} min={1} max={8} onChange={(v) => setRevs(back, v)} />
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className={styles.stepper}>
      <span>{label}</span>
      <div className={styles.stepBtns}>
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`${label}: меньше`}>
          −
        </button>
        <output className="num" aria-live="polite" aria-label={`${label}: ${value}`}>
          {value}
        </output>
        <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label}: больше`}>
          +
        </button>
      </div>
    </div>
  );
}
