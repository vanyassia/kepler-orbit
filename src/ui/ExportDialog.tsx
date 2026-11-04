import { Check, Copy, Download, Share, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { isCustomId } from '../data/custom';
import type { ColumnGroup, ExportFormat, ExportMeta } from '../data/exportData';
import {
  buildTrackTable,
  COLUMN_GROUPS,
  defaultStep,
  elementsToText,
  exportFileName,
  fileType,
  fromInputValue,
  MAX_ROWS,
  rowCount,
  STEP_OPTIONS,
  tableToText,
  toInputValue,
} from '../data/exportData';
import { isOrbiterId } from '../data/orbiters';
import { BODIES } from '../physics/bodies';
import type { PreparedOrbit } from '../physics/propagate';
import { useAppStore } from '../state/store';
import { SURFACE_CREDIT } from '../views/assets';
import type { SnapshotKind } from '../views/snapshot';
import { canSnapshot, canvasToPng, captureView } from '../views/snapshot';
import { trackSpan } from '../views/trackCache';
import { SOURCE_LABELS } from './DataStatus';
import { canShareFile, copyText, downloadBlob, shareFile } from './download';
import styles from './ExportDialog.module.css';
import { fmt, fmtDateTime, fmtDuration, revsLabel } from './format';
import { rovingKeyDown, rovingTabIndex } from './roving';
import base from './TleDialog.module.css';
import { satelliteTitle } from './satelliteTitle';

type Tab = 'track' | 'elements' | 'image';
type RangePreset = 'shown' | 'rev' | 'day' | 'custom';

const TABS: { id: Tab; label: string }[] = [
  { id: 'track', label: 'Трасса' },
  { id: 'elements', label: 'Элементы орбиты' },
  { id: 'image', label: 'Картинка' },
];
const TAB_IDS = TABS.map((t) => t.id);

const FORMATS: { id: Exclude<ExportFormat, 'tsv'>; label: string; hint: string }[] = [
  { id: 'excel', label: 'Excel', hint: 'CSV для Excel и Numbers: «;» и десятичная запятая' },
  { id: 'csv', label: 'CSV', hint: 'Обычный CSV: «,» и десятичная точка (Python, MATLAB, Google Таблицы)' },
  { id: 'json', label: 'JSON', hint: 'Для программ: описание столбцов, единицы и строки' },
];
const FORMAT_IDS = FORMATS.map((f) => f.id);

const RANGES: { id: RangePreset; label: string }[] = [
  { id: 'shown', label: 'Как на экране' },
  { id: 'rev', label: '1 виток' },
  { id: 'day', label: 'Сутки' },
  { id: 'custom', label: 'Свой' },
];
const RANGE_IDS = RANGES.map((r) => r.id);

/** Выбор запоминается в этом браузере (если хранилище доступно). */
interface Prefs {
  tab: Tab;
  format: Exclude<ExportFormat, 'tsv'>;
  range: RangePreset;
  groups: ColumnGroup[];
  msk: boolean;
  image: SnapshotKind;
}
const PREFS_KEY = 'kepler:export';
const DEFAULT_PREFS: Prefs = { tab: 'track', format: 'excel', range: 'shown', groups: ['motion'], msk: true, image: 'map' };

function readPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* частный режим — просто не запоминаем */
  }
}

const stepLabel = (s: number) => (s < 60 ? `${s} с` : s < 3600 ? `${s / 60} мин` : `${s / 3600} ч`);

/** Окно «Выгрузка данных». Монтируется заново при каждом открытии: время берётся на момент открытия. */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const orbit = useAppStore((s) => s.orbit);
  return open && orbit ? <ExportForm orbit={orbit} onClose={onClose} /> : null;
}

function ExportForm({ orbit, onClose }: { orbit: PreparedOrbit; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const idBase = useId();
  const record = useAppStore((s) => s.record)!;
  const revsBack = useAppStore((s) => s.revsBack);
  const revsForward = useAppStore((s) => s.revsForward);
  const view = useAppStore((s) => s.view);
  // Момент, от которого считается интервал, — время симуляции при открытии окна
  const [now] = useState(() => Math.round(useAppStore.getState().simTime / 1000) * 1000);
  const [prefs, setPrefs] = useState(readPrefs);
  const update = (p: Partial<Prefs>) =>
    setPrefs((old) => {
      const next = { ...old, ...p };
      savePrefs(next);
      return next;
    });
  const [step, setStep] = useState(() => defaultStep(orbit.T));
  const [customFrom, setCustomFrom] = useState(() => toInputValue(now));
  const [customTo, setCustomTo] = useState(() => toInputValue(now + 86_400_000));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shareable = useMemo(canShareFile, []);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const el = orbit.elements;
  const meta: ExportMeta = {
    satellite: satelliteTitle(el).title,
    body: BODIES[el.body ?? 'earth'].name,
    source: SOURCE_LABELS[record.source],
    idLabel: isCustomId(el.noradId) || record.source === 'historic' || record.source === 'custom' ? null : isOrbiterId(el.noradId) ? 'Номер NAIF' : 'Номер NORAD',
  };
  const tle = record.tle;

  // Интервал таблицы
  const range = useMemo(() => {
    switch (prefs.range) {
      case 'shown': {
        const span = trackSpan(orbit, revsBack, revsForward);
        // Края — на целых секундах, как строки таблицы
        return { from: now - Math.round(span.back * orbit.T) * 1000, to: now + Math.round(span.forward * orbit.T) * 1000 };
      }
      case 'rev':
        return { from: now, to: now + Math.round(orbit.T) * 1000 };
      case 'day':
        return { from: now, to: now + 86_400_000 };
      case 'custom':
        return { from: fromInputValue(customFrom), to: fromInputValue(customTo) };
    }
  }, [prefs.range, orbit, now, revsBack, revsForward, customFrom, customTo]);
  const rangeError = !Number.isFinite(range.from) || !Number.isFinite(range.to) ? 'Заполните начало и конец интервала' : range.to <= range.from ? 'Конец интервала должен быть позже начала' : null;
  const rows = rangeError ? 0 : rowCount(range.from, range.to, step);
  const tooMany = rows > MAX_ROWS;

  // Образец: первые строки таблицы в выбранном формате
  const trackOpts = { fromMs: range.from, toMs: range.to, stepSec: step, groups: prefs.groups, msk: prefs.msk };
  const preview = useMemo(() => {
    if (rangeError) return null;
    const head = buildTrackTable(orbit, { ...trackOpts, toMs: Math.min(range.to, range.from + step * 1000 * 3) });
    return head;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orbit, range.from, range.to, step, prefs.groups, prefs.msk, rangeError]);
  // Размер файла: байты строк образца без заголовка, умноженные на число строк
  const bytesPerRow = useMemo(() => {
    if (!preview) return 0;
    const size = (text: string) => new Blob([text]).size;
    const all = tableToText(preview, prefs.format, meta);
    const one = tableToText({ ...preview, times: preview.times.slice(0, 1), rows: preview.rows.slice(0, 1) }, prefs.format, meta);
    return (size(all) - size(one)) / Math.max(1, preview.times.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, prefs.format]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 2500);
  };

  // Текст файла собирается только по нажатию: таблица может быть на десятки тысяч строк
  const makeFile = async (format: ExportFormat): Promise<{ blob: Blob; name: string } | null> => {
    const { ext, mime } = fileType(format);
    if (prefs.tab === 'track') {
      if (rangeError || tooMany) return null;
      const text = tableToText(buildTrackTable(orbit, trackOpts), format, meta);
      return { blob: new Blob([text], { type: `${mime};charset=utf-8` }), name: exportFileName(meta.satellite, 'трасса', range.from, ext) };
    }
    if (prefs.tab === 'elements') {
      const text = elementsToText(orbit, format, meta, tle);
      return { blob: new Blob([text], { type: `${mime};charset=utf-8` }), name: exportFileName(meta.satellite, 'элементы', el.epochMs, ext) };
    }
    const shot = captureView(prefs.image, snapshotCaption());
    const blob = shot && (await canvasToPng(shot));
    if (!blob) return null;
    return { blob, name: exportFileName(meta.satellite, prefs.image === 'map' ? 'карта' : 'глобус', useAppStore.getState().simTime, 'png') };
  };

  const snapshotCaption = () => ({
    title: `${meta.satellite} · ${fmtDateTime(useAppStore.getState().simTime)} UTC`,
    credit: `Кеплер · ${SURFACE_CREDIT[el.body ?? 'earth']}`,
  });

  const run = async (action: 'download' | 'share' | 'copy') => {
    setBusy(true);
    // Дать окну показать «Готовим файл…» до тяжёлого расчёта
    await new Promise((r) => setTimeout(r, 16));
    try {
      if (action === 'copy') {
        // Для вставки в ячейки таблицы — столбцы через табуляцию
        const text = prefs.tab === 'track' ? tableToText(buildTrackTable(orbit, trackOpts), prefs.format === 'json' ? 'json' : 'tsv', meta) : elementsToText(orbit, prefs.format === 'json' ? 'json' : 'tsv', meta, tle);
        flash((await copyText(text)) ? 'Скопировано — вставьте в таблицу' : 'Браузер не дал доступ к буферу обмена');
        return;
      }
      const file = await makeFile(prefs.format);
      if (!file) {
        flash(prefs.tab === 'image' ? 'Вид ещё не готов — откройте его и повторите' : 'Проверьте интервал и шаг');
        return;
      }
      if (action === 'share') {
        if (await shareFile(file.blob, file.name)) flash('Готово');
      } else {
        downloadBlob(file.blob, file.name);
        flash(`Сохранено: ${file.name}`);
      }
    } finally {
      setBusy(false);
    }
  };

  // Картинка: какие виды сейчас на экране
  const mapShown = view !== '3d' && canSnapshot('map');
  const globeShown = view !== '2d' && canSnapshot('globe');
  const imageKind: SnapshotKind | null = prefs.image === 'globe' ? (globeShown ? 'globe' : mapShown ? 'map' : null) : mapShown ? 'map' : globeShown ? 'globe' : null;
  useEffect(() => {
    if (imageKind && imageKind !== prefs.image) update({ image: imageKind });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageKind]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (prefs.tab !== 'image' || !imageKind) return setImageUrl(null);
    const shot = captureView(imageKind, snapshotCaption());
    if (!shot) return setImageUrl(null);
    let url: string | null = null;
    let alive = true;
    void canvasToPng(shot).then((b) => {
      if (!alive || !b) return;
      url = URL.createObjectURL(b);
      setImageUrl(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.tab, imageKind]);

  const isText = prefs.tab !== 'image';
  const ext = isText ? fileType(prefs.format).ext.toUpperCase() : 'PNG';
  const disabled = busy || (prefs.tab === 'track' && (!!rangeError || tooMany)) || (prefs.tab === 'image' && !imageKind);

  return (
    <dialog ref={ref} className={`${base.dialog} ${styles.dialog}`} onClose={onClose} aria-labelledby={`${idBase}-title`}>
      <div className={base.form}>
        <div className={base.head}>
          <h2 id={`${idBase}-title`}>Выгрузка данных</h2>
          <button type="button" className={base.close} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <p className={base.hint}>
          <span translate="no">{meta.satellite}</span> · {meta.body} · {meta.source}
        </p>

        <div className={styles.tabs} role="tablist" aria-label="Что выгрузить" onKeyDown={(e) => rovingKeyDown(e, TAB_IDS, prefs.tab, (tab) => update({ tab }))}>
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={prefs.tab === t.id} tabIndex={rovingTabIndex(prefs.tab === t.id)} onClick={() => update({ tab: t.id })}>
              {t.label}
            </button>
          ))}
        </div>

        {prefs.tab === 'track' && (
          <>
            <Field label="Интервал">
              <Segmented ids={RANGE_IDS} items={RANGES} value={prefs.range} onChange={(range) => update({ range })} label="Интервал" />
              {prefs.range === 'custom' ? (
                <div className={styles.dates}>
                  <label>
                    <span>Начало, UTC</span>
                    <input type="datetime-local" step={1} value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={styles.input} />
                  </label>
                  <label>
                    <span>Конец, UTC</span>
                    <input type="datetime-local" step={1} value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={styles.input} />
                  </label>
                </div>
              ) : (
                <p className={styles.note}>
                  {prefs.range === 'shown' && <>{revsLabel(revsBack)} назад и {revsLabel(revsForward)} вперёд от текущего момента. </>}
                  {!rangeError && (
                    <span className="num">
                      {fmtDateTime(range.from)} — {fmtDateTime(range.to)} UTC
                    </span>
                  )}
                </p>
              )}
            </Field>

            <div className={styles.row2}>
              <Field label="Шаг" htmlFor={`${idBase}-step`}>
                <select id={`${idBase}-step`} className={styles.input} value={step} onChange={(e) => setStep(Number(e.target.value))}>
                  {STEP_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {stepLabel(s)}
                      {s === defaultStep(orbit.T) ? ' — как на карте' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Строк">
                <p className={styles.count} data-warn={tooMany || undefined} aria-live="polite">
                  {rangeError ?? (
                    <>
                      <span className="num">{fmt(rows)}</span>
                      {!tooMany && <span className={styles.size}> · ≈ {fmtSize(rows * bytesPerRow)}</span>}
                      {!rangeError && <span className={styles.size}> · {fmtDuration((range.to - range.from) / 1000)}</span>}
                    </>
                  )}
                </p>
              </Field>
            </div>
            {tooMany && (
              <p className={base.error} role="alert">
                Больше {fmt(MAX_ROWS)} строк: увеличьте шаг или сократите интервал.
              </p>
            )}

            <Field label="Столбцы">
              <p className={styles.note}>Всегда: время UTC, t − t₀, широта φ, долгота λ, высота h.</p>
              <div className={styles.checks}>
                {COLUMN_GROUPS.map((g) => (
                  <Check2
                    key={g.id}
                    checked={prefs.groups.includes(g.id)}
                    onChange={(on) => update({ groups: on ? [...prefs.groups, g.id] : prefs.groups.filter((x) => x !== g.id) })}
                    label={g.label}
                    hint={g.hint}
                  />
                ))}
                <Check2 checked={prefs.msk} onChange={(msk) => update({ msk })} label="Московское время" hint="ещё один столбец, UTC+3" />
              </div>
            </Field>
          </>
        )}

        {prefs.tab === 'elements' && (
          <p className={styles.note}>
            Шесть элементов на эпоху {fmtDateTime(el.epochMs)} UTC, постоянные тела (μ, R) и производные величины: период, большая полуось, высоты перицентра и апоцентра
            {tle ? ', строки TLE' : ''}.
          </p>
        )}

        {isText && (
          <Field label="Формат">
            <Segmented ids={FORMAT_IDS} items={FORMATS} value={prefs.format} onChange={(format) => update({ format })} label="Формат" />
            <p className={styles.note}>{FORMATS.find((f) => f.id === prefs.format)!.hint}</p>
          </Field>
        )}

        {isText && (
          <div className={styles.preview} aria-label="Образец">
            <pre>{previewText(prefs.tab === 'track' ? (preview ? tableToText(preview, prefs.format === 'excel' ? 'tsv' : prefs.format, meta) : '') : elementsToText(orbit, prefs.format === 'excel' ? 'tsv' : prefs.format, meta, tle), prefs.format)}</pre>
          </div>
        )}

        {prefs.tab === 'image' && (
          <>
            <Field label="Вид">
              <Segmented
                ids={['map', 'globe'] as SnapshotKind[]}
                items={[
                  { id: 'map', label: 'Карта', disabled: !mapShown },
                  { id: 'globe', label: 'Глобус', disabled: !globeShown },
                ]}
                value={imageKind ?? prefs.image}
                onChange={(image) => update({ image })}
                label="Вид"
              />
              <p className={styles.note}>Как сейчас на экране, в полном разрешении, с названием спутника и временем. {!mapShown || !globeShown ? 'Второй вид можно выбрать, если открыть его или «Оба вида».' : ''}</p>
            </Field>
            <div className={styles.imageBox}>{imageUrl ? <img src={imageUrl} alt="Образец картинки" /> : <span className={styles.note}>{imageKind ? 'Готовим образец…' : 'Откройте карту или глобус'}</span>}</div>
          </>
        )}

        <div className={`${base.actions} ${styles.actions}`}>
          <span className={styles.notice} role="status" aria-live="polite">
            {busy ? 'Готовим файл…' : notice}
          </span>
          {isText && (
            <button type="button" className={`${base.secondary} ${styles.btn}`} onClick={() => void run('copy')} disabled={disabled} title="Столбцы через табуляцию — вставляются прямо в ячейки Excel, Numbers, Google Таблиц">
              {notice?.startsWith('Скопировано') ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} Скопировать
            </button>
          )}
          {shareable && (
            <button type="button" className={`${base.secondary} ${styles.btn}`} onClick={() => void run('share')} disabled={disabled}>
              <Share size={15} aria-hidden="true" /> Отправить
            </button>
          )}
          <button type="button" className={`${base.primary} ${styles.btn}`} onClick={() => void run('download')} disabled={disabled}>
            <Download size={15} aria-hidden="true" /> Скачать {ext}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Образец: первые строки, у JSON — начало текста. */
function previewText(text: string, format: ExportFormat): string {
  const clean = text.replace(/^﻿/, '');
  if (format === 'json') {
    const lines = clean.split('\n');
    return lines.length > 14 ? lines.slice(0, 14).join('\n') + '\n…' : clean;
  }
  if (format === 'csv') {
    const lines = clean.trimEnd().split('\n');
    return lines.slice(0, 22).join('\n') + (lines.length > 22 ? '\n…' : '');
  }
  // Таблица: выровнять столбцы пробелами, чтобы образец читался
  const rows = clean.trimEnd().split('\n').map((l) => l.split('\t'));
  const widths = rows[0].map((_, j) => Math.max(...rows.map((r) => (r[j] ?? '').length)));
  const shown = rows.slice(0, 22).map((r) => r.map((c, j) => c.padEnd(widths[j])).join('  '));
  return shown.join('\n') + (rows.length > 22 ? '\n…' : '');
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${fmt(bytes / 1024, 0)} КБ`;
  return `${fmt(bytes / 1024 / 1024, 1)} МБ`;
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={styles.label}>
          {label}
        </label>
      ) : (
        <span className={styles.label}>{label}</span>
      )}
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  ids,
  items,
  value,
  onChange,
  label,
}: {
  ids: T[];
  items: { id: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const enabled = items.filter((i) => !i.disabled).map((i) => i.id);
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label} onKeyDown={(e) => rovingKeyDown(e, enabled.length ? enabled : ids, value, onChange)}>
      {items.map((i) => (
        <button key={i.id} type="button" role="radio" aria-checked={value === i.id} tabIndex={rovingTabIndex(value === i.id)} disabled={i.disabled} onClick={() => onChange(i.id)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

function Check2({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={styles.box} aria-hidden="true" />
      <span>
        {label} <span className={styles.hint}>{hint}</span>
      </span>
    </label>
  );
}
