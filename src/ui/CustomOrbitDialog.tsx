import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { CustomSatellite } from '../data/custom';
import { CUSTOM_DEFAULTS, periodOf, shapeFromHeights, validateCustom, wrapDeg } from '../data/custom';
import type { BodyId } from '../physics/bodies';
import { BODIES } from '../physics/bodies';
import type { OrbitTemplate, RepeatCycle } from '../data/orbitTemplates';
import { isTemplateName, REPEAT_DEFAULTS, REPEAT_M_MAX, REPEAT_N_MAX, repeatError, repeatTemplate, templatesFor } from '../data/orbitTemplates';
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
const parse = (s: string) => (s.trim() ? Number(s.trim().replace(',', '.').replace('−', '-')) : NaN); // пустое поле — не ноль
/** Число в поле — с десятичной запятой. */
const str = (v: number) => String(v).replace('.', ',');

const DEFAULT_NAME = 'Мой спутник';

/**
 * Поля совпадают с шаблоном (тогда его кнопка подсвечена). У повторяющейся трассы важны только высоты:
 * наклонение и углы узора не ломают, их можно менять.
 */
function matches(t: OrbitTemplate, v: Record<Field, string>, heightsOnly = false): boolean {
  const keys = heightsOnly ? (['hPeri', 'hApo'] as const) : (['hPeri', 'hApo', 'inclinationDeg', 'raanDeg', 'argPerigeeDeg', 'meanAnomalyDeg'] as const);
  return keys.every((k) => Math.abs(parse(v[k]) - t[k]) < 1e-9);
}

/** Поля n и m по умолчанию для тела; on — открыт ли шаблон, last — последние верные n и m. */
function cycleFields(body: BodyId) {
  const d = REPEAT_DEFAULTS[body];
  return { on: false, n: String(d.n), m: String(d.m), last: { n: d.n, m: d.m } as RepeatCycle };
}

function initial(body: BodyId): Record<Field, string> {
  const d = CUSTOM_DEFAULTS[body];
  return {
    name: DEFAULT_NAME,
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
  // Поля «витков» и «суток» шаблона «Повторяющаяся трасса» — строки, как и остальные поля
  const [cycle, setCycle] = useState(() => cycleFields(useAppStore.getState().body));
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
    setCycle(cycleFields(id));
  };

  // Шаблон заполняет поля; название меняется, только если его ещё не вводили вручную
  const applyTemplate = (t: OrbitTemplate) =>
    setValues((v) => ({
      name: v.name.trim() === DEFAULT_NAME || isTemplateName(v.name.trim()) ? t.satName : v.name,
      hPeri: str(t.hPeri),
      hApo: str(t.hApo),
      inclinationDeg: str(t.inclinationDeg),
      raanDeg: str(t.raanDeg),
      argPerigeeDeg: str(t.argPerigeeDeg),
      meanAnomalyDeg: str(t.meanAnomalyDeg),
    }));
  // Шаблон «Повторяющаяся трасса» собирается из текущих n и m; если они неверны — из последних верных
  const rc: RepeatCycle = { n: parse(cycle.n), m: parse(cycle.m) };
  const cycleErr = repeatError(body, rc);
  const repeatTpl = repeatTemplate(body, cycleErr ? cycle.last : rc, cycle.on ? parse(values.inclinationDeg) : REPEAT_DEFAULTS[body].inclinationDeg);
  const templates = [...templatesFor(body), repeatTpl];
  // Шаблон выбран, пока высоты те же, что он поставил (при неверном вводе n или m высоты не меняются —
  // поля не пропадают на полуслове); наклонение и углы узор не ломают
  const active = cycle.on && matches(repeatTpl, values, true) ? repeatTpl : templates.find((t) => t !== repeatTpl && matches(t, values));
  const repeat = active === repeatTpl && !cycleErr ? rc : undefined;

  const chooseTemplate = (t: OrbitTemplate) => {
    setCycle((c) => ({ ...c, on: t === repeatTpl }));
    applyTemplate(t === repeatTpl ? { ...t, inclinationDeg: REPEAT_DEFAULTS[body].inclinationDeg } : t);
  };

  // Новые n или m: высоты пересчитываются сразу, наклонение и углы остаются как есть
  const changeCycle = (key: 'n' | 'm', text: string) => {
    const next = { ...cycle, [key]: text };
    const c: RepeatCycle = { n: parse(next.n), m: parse(next.m) };
    if (!repeatError(body, c)) {
      next.last = c;
      const t = repeatTemplate(body, c, 0);
      setValues((v) => ({
        ...v,
        name: v.name.trim() === DEFAULT_NAME || isTemplateName(v.name.trim()) ? t.satName : v.name,
        hPeri: str(t.hPeri),
        hApo: str(t.hApo),
      }));
    }
    setCycle(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) {
      const first = (['name', ...FIELDS.map((f) => f.key)] as Field[]).find((k) => errors[k]);
      if (first) document.getElementById(`${idBase}-${first}`)?.focus();
      return;
    }
    if (active === repeatTpl && cycleErr) {
      document.getElementById(`${idBase}-cycle-n`)?.focus();
      return;
    }
    addCustom({
      ...sat,
      raanDeg: wrapDeg(sat.raanDeg),
      argPerigeeDeg: wrapDeg(sat.argPerigeeDeg),
      meanAnomalyDeg: wrapDeg(sat.meanAnomalyDeg),
      ...(repeat && { repeat }),
    });
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
            maxLength={key === 'name' ? 60 : 24}
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

  const cycleInput = (key: 'n' | 'm', label: string, max: number) => {
    const id = `${idBase}-cycle-${key}`;
    return (
      <div className={styles.cycleField}>
        <label htmlFor={id}>{label}</label>
        <div className={styles.inputWrap}>
          <input
            id={id}
            className={styles.input}
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            value={cycle[key]}
            onChange={(e) => changeCycle(key, e.target.value)}
            onKeyDown={(e) => {
              // Стрелки меняют число на единицу
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
              e.preventDefault();
              const v = parse(cycle[key]);
              const nv = Math.min(max, Math.max(1, (Number.isInteger(v) ? v : 1) + (e.key === 'ArrowUp' ? 1 : -1)));
              changeCycle(key, String(nv));
            }}
            aria-invalid={!!cycleErr}
            aria-describedby={cycleErr ? `${idBase}-cycle-err` : undefined}
          />
        </div>
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

        <div className={styles.templates}>
          <span className={styles.templatesLabel} id={`${idBase}-tpl`}>
            Шаблон
          </span>
          <div className={styles.templateChips} role="group" aria-labelledby={`${idBase}-tpl`}>
            {templates.map((t) => (
              <button key={t.id} type="button" className={styles.templateChip} aria-pressed={active?.id === t.id} onClick={() => chooseTemplate(t)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {active === repeatTpl && (
          <div className={styles.cycle}>
            <div className={styles.cycleRow}>
              {cycleInput('n', 'Витков', REPEAT_N_MAX)}
              <span className={styles.cycleWord}>за</span>
              {cycleInput('m', 'Суток', REPEAT_M_MAX)}
            </div>
            {cycleErr && (
              <span id={`${idBase}-cycle-err`} className={base.error}>
                {cycleErr}
              </span>
            )}
          </div>
        )}

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
        {active && <p className={styles.templateNote}>{active.note}</p>}
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
