import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { CustomSatellite } from '../data/custom';
import { CUSTOM_DEFAULTS, periodOf, shapeFromHeights, validateCustom, wrapDeg } from '../data/custom';
import type { BodyId } from '../physics/bodies';
import { BODIES } from '../physics/bodies';
import { useAppStore } from '../state/store';
import styles from './CustomOrbitDialog.module.css';
import { fmt, fmtDuration } from './format';
import { rovingKeyDown, rovingTabIndex } from './roving';
import base from './TleDialog.module.css';

type Field = 'name' | 'hPeri' | 'hApo' | 'inclinationDeg' | 'raanDeg' | 'argPerigeeDeg' | 'meanAnomalyDeg';

const FIELDS: { key: Exclude<Field, 'name'>; label: string; unit: string }[] = [
  { key: 'hPeri', label: 'Высота перицентра hп', unit: 'км' },
  { key: 'hApo', label: 'Высота апоцентра hа', unit: 'км' },
  { key: 'inclinationDeg', label: 'Наклонение i', unit: '°' },
  { key: 'raanDeg', label: 'Долгота восходящего узла Ω', unit: '°' },
  { key: 'argPerigeeDeg', label: 'Аргумент перицентра ω', unit: '°' },
  { key: 'meanAnomalyDeg', label: 'Средняя аномалия M₀', unit: '°' },
];

const BODY_ORDER: BodyId[] = ['earth', 'moon', 'mars'];

/** Число из поля: допускается десятичная запятая и знак «−». */
const parse = (s: string) => Number(s.trim().replace(',', '.').replace('−', '-'));

function initial(body: BodyId): Record<Field, string> {
  const d = CUSTOM_DEFAULTS[body];
  return {
    name: 'Мой спутник',
    hPeri: String(d.hPeri),
    hApo: String(d.hApo),
    inclinationDeg: String(d.inclinationDeg).replace('.', ','),
    raanDeg: '0',
    argPerigeeDeg: '0',
    meanAnomalyDeg: '0',
  };
}

/**
 * Свой спутник Земли, Луны или Марса: орбита по высотам и углам, без строк TLE.
 * Монтируется заново при каждом открытии — поля сразу заполнены примером для текущего тела.
 */
export function CustomOrbitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <CustomOrbitForm onClose={onClose} /> : null;
}

function CustomOrbitForm({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const addCustom = useAppStore((s) => s.addCustom);
  const [body, setBody] = useState<BodyId>(() => useAppStore.getState().body);
  const [values, setValues] = useState(() => initial(useAppStore.getState().body));
  const [submitted, setSubmitted] = useState(false);
  const idBase = useId();

  // Закрывать вручную не нужно: вместе с компонентом элемент уходит из DOM (и из верхнего слоя)
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const sat: Omit<CustomSatellite, 'id' | 'epochMs'> = {
    name: values.name.trim(),
    body,
    hPeri: parse(values.hPeri),
    hApo: parse(values.hApo),
    inclinationDeg: parse(values.inclinationDeg),
    raanDeg: parse(values.raanDeg),
    argPerigeeDeg: parse(values.argPerigeeDeg),
    meanAnomalyDeg: parse(values.meanAnomalyDeg),
  };
  const errors = validateCustom(sat);
  const valid = Object.keys(errors).length === 0;
  const b = BODIES[body];
  const shape = valid ? shapeFromHeights(sat.hPeri, sat.hApo, b.radius) : null;

  const chooseBody = (id: BodyId) => {
    setBody(id);
    // Высоты и наклонение — пример для нового тела (у Луны и Марса другие масштабы орбит)
    const d = CUSTOM_DEFAULTS[id];
    setValues((v) => ({ ...v, hPeri: String(d.hPeri), hApo: String(d.hApo), inclinationDeg: String(d.inclinationDeg).replace('.', ',') }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) {
      const first = (['name', ...FIELDS.map((f) => f.key)] as Field[]).find((k) => errors[k]);
      if (first) document.getElementById(`${idBase}-${first}`)?.focus();
      return;
    }
    addCustom({ ...sat, raanDeg: wrapDeg(sat.raanDeg), argPerigeeDeg: wrapDeg(sat.argPerigeeDeg), meanAnomalyDeg: wrapDeg(sat.meanAnomalyDeg) });
    onClose();
  };

  const field = (key: Field, label: string, unit?: string, wide = false) => {
    const id = `${idBase}-${key}`;
    const err = submitted ? errors[key] : undefined;
    return (
      <div key={key} className={`${styles.field} ${wide ? styles.wide : ''}`}>
        <label htmlFor={id}>{label}</label>
        <div className={styles.inputWrap}>
          <input
            id={id}
            name={key}
            className={styles.input}
            inputMode={key === 'name' ? 'text' : 'decimal'}
            autoComplete="off"
            spellCheck={false}
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            aria-invalid={!!err}
            aria-describedby={err ? `${id}-err` : undefined}
          />
          {unit && <span className={styles.unit}>{unit}</span>}
        </div>
        {err && (
          <span id={`${id}-err`} className={base.error}>
            {err}
          </span>
        )}
      </div>
    );
  };

  return (
    <dialog ref={ref} className={base.dialog} onClose={onClose} aria-labelledby={`${idBase}-title`}>
      <form onSubmit={submit} className={base.form} noValidate>
        <div className={base.head}>
          <h2 id={`${idBase}-title`}>Свой спутник</h2>
          <button type="button" className={base.close} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className={styles.bodies} role="radiogroup" aria-label="Центральное тело" onKeyDown={(e) => rovingKeyDown(e, BODY_ORDER, body, chooseBody)}>
          {BODY_ORDER.map((id) => (
            <button key={id} type="button" role="radio" aria-checked={body === id} tabIndex={rovingTabIndex(body === id)} onClick={() => chooseBody(id)}>
              {BODIES[id].name}
            </button>
          ))}
        </div>

        <div className={styles.grid}>
          {field('name', 'Название', undefined, true)}
          {FIELDS.map((f) => field(f.key, f.label, f.unit))}
        </div>

        <p className={styles.summary} aria-live="polite">
          {shape ? (
            <>
              a = <span className="num">{fmt(shape.a, 1)}</span>&nbsp;км, e = <span className="num">{fmt(shape.e, 4)}</span>, T ={' '}
              <span className="num">{fmtDuration(periodOf(shape.a, b.mu))}</span>
            </>
          ) : (
            'Проверьте значения в полях'
          )}
        </p>
        <p className={base.hint}>
          {body === 'earth' ? 'Углы i и Ω — от экватора Земли, Ω — от точки весеннего равноденствия.' : `Углы i и Ω — от экватора тела (${b.name}), как у элементов JPL Horizons.`}{' '}
          Эпоха — момент создания; при M₀ = 0° спутник начинает с перицентра. Спутник сохранится в этом браузере.
        </p>

        <div className={base.actions}>
          <button type="button" className={base.secondary} onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className={base.primary}>
            Создать спутник
          </button>
        </div>
      </form>
    </dialog>
  );
}
