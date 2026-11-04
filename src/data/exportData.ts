/**
 * Выгрузка данных: таблица трассы и элементы орбиты в файлы CSV и JSON.
 *
 * Все числа считает та же модель, что рисует трассу (propagate — шаги листка),
 * поэтому выгруженная таблица совпадает с тем, что видно на карте и в боковой панели.
 *
 * Форматы:
 *   excel — CSV для Excel и Numbers с русскими настройками: разделитель «;», десятичная запятая,
 *           метка UTF-8 (BOM) в начале, иначе Excel показывает русские буквы «кракозябрами»;
 *   csv   — обычный CSV: разделитель «,», десятичная точка (Python, MATLAB, Google Таблицы);
 *   tsv   — столбцы через табуляцию, для вставки из буфера обмена прямо в ячейки таблицы;
 *   json  — для программ: описание, единицы и массив строк.
 */
import { RAD } from '../physics/constants';
import type { PreparedOrbit, SatelliteState } from '../physics/propagate';
import { propagate } from '../physics/propagate';

export type ExportFormat = 'excel' | 'csv' | 'tsv' | 'json';

/** Группы столбцов таблицы трассы. Подспутниковая точка и время есть всегда. */
export type ColumnGroup = 'motion' | 'anomalies' | 'eci' | 'ecef';

export const COLUMN_GROUPS: { id: ColumnGroup; label: string; hint: string }[] = [
  { id: 'motion', label: 'Радиус и скорость', hint: 'r, V, Vr, Vn, номер витка' },
  { id: 'anomalies', label: 'Аномалии и аргумент широты', hint: 'M, E, ν, u' },
  { id: 'eci', label: 'Координаты в АГЭСК', hint: 'x, y, z и скорости' },
  { id: 'ecef', label: 'Координаты в ГСК', hint: 'x, y, z, вращаются с телом' },
];

/** Предел строк таблицы: больше браузер на телефоне собирает файл слишком долго. */
export const MAX_ROWS = 200_000;

interface Column {
  /** Заголовок для таблиц (по-русски, с единицей). */
  title: string;
  /** Ключ для JSON (латиницей). */
  key: string;
  unit: string;
  digits: number;
  value: (s: SatelliteState) => number;
}

const DEG = (x: number) => x * RAD;
/** Угол в [0°, 360°). */
const DEG360 = (x: number) => ((x * RAD) % 360 + 360) % 360;

const BASE_COLUMNS: Column[] = [
  { title: 't − t₀ (с)', key: 'dt_s', unit: 's', digits: 1, value: (s) => s.dt },
  { title: 'Широта φ (°)', key: 'lat_deg', unit: 'deg', digits: 5, value: (s) => DEG(s.lat) },
  { title: 'Долгота λ (°)', key: 'lon_deg', unit: 'deg', digits: 5, value: (s) => DEG(s.lon) },
  { title: 'Высота h (км)', key: 'h_km', unit: 'km', digits: 3, value: (s) => s.h },
];

const GROUP_COLUMNS: Record<ColumnGroup, Column[]> = {
  motion: [
    { title: 'Радиус-вектор r (км)', key: 'r_km', unit: 'km', digits: 3, value: (s) => s.r },
    { title: 'Скорость V (км/с)', key: 'v_kms', unit: 'km/s', digits: 5, value: (s) => s.V },
    { title: 'Радиальная скорость Vr (км/с)', key: 'vr_kms', unit: 'km/s', digits: 5, value: (s) => s.Vr },
    { title: 'Трансверсальная скорость Vn (км/с)', key: 'vn_kms', unit: 'km/s', digits: 5, value: (s) => s.Vn },
    { title: 'Виток от эпохи', key: 'rev', unit: '', digits: 0, value: (s) => s.revolution },
  ],
  anomalies: [
    { title: 'Средняя аномалия M (°)', key: 'M_deg', unit: 'deg', digits: 4, value: (s) => DEG360(s.M) },
    { title: 'Эксцентрическая аномалия E (°)', key: 'E_deg', unit: 'deg', digits: 4, value: (s) => DEG360(s.E) },
    { title: 'Истинная аномалия ν (°)', key: 'nu_deg', unit: 'deg', digits: 4, value: (s) => DEG360(s.theta) },
    { title: 'Аргумент широты u (°)', key: 'u_deg', unit: 'deg', digits: 4, value: (s) => DEG360(s.u) },
  ],
  eci: [
    { title: 'x АГЭСК (км)', key: 'x_eci_km', unit: 'km', digits: 3, value: (s) => s.eci.x },
    { title: 'y АГЭСК (км)', key: 'y_eci_km', unit: 'km', digits: 3, value: (s) => s.eci.y },
    { title: 'z АГЭСК (км)', key: 'z_eci_km', unit: 'km', digits: 3, value: (s) => s.eci.z },
    { title: 'Vx АГЭСК (км/с)', key: 'vx_eci_kms', unit: 'km/s', digits: 6, value: (s) => s.vEci.x },
    { title: 'Vy АГЭСК (км/с)', key: 'vy_eci_kms', unit: 'km/s', digits: 6, value: (s) => s.vEci.y },
    { title: 'Vz АГЭСК (км/с)', key: 'vz_eci_kms', unit: 'km/s', digits: 6, value: (s) => s.vEci.z },
  ],
  ecef: [
    { title: 'x ГСК (км)', key: 'x_ecef_km', unit: 'km', digits: 3, value: (s) => s.ecef.x },
    { title: 'y ГСК (км)', key: 'y_ecef_km', unit: 'km', digits: 3, value: (s) => s.ecef.y },
    { title: 'z ГСК (км)', key: 'z_ecef_km', unit: 'km', digits: 3, value: (s) => s.ecef.z },
  ],
};

export interface TrackExportOptions {
  fromMs: number;
  toMs: number;
  stepSec: number;
  groups: ColumnGroup[];
  /** Добавить столбец с московским временем. */
  msk: boolean;
}

/** Моменты таблицы: от начала с шагом, последний — ровно конец интервала. */
export function exportTimes(fromMs: number, toMs: number, stepSec: number): number[] {
  const stepMs = stepSec * 1000;
  if (!(stepMs > 0) || !(toMs >= fromMs)) return [];
  const n = Math.floor((toMs - fromMs) / stepMs + 1e-9);
  const times = Array.from({ length: n + 1 }, (_, k) => fromMs + k * stepMs);
  if (times[times.length - 1] < toMs) times.push(toMs);
  return times;
}

/** Сколько строк получится (без расчёта). */
export function rowCount(fromMs: number, toMs: number, stepSec: number): number {
  const stepMs = stepSec * 1000;
  if (!(stepMs > 0) || !(toMs >= fromMs)) return 0;
  const n = Math.floor((toMs - fromMs) / stepMs + 1e-9);
  return n + 1 + (fromMs + n * stepMs < toMs ? 1 : 0);
}

export interface Table {
  /** Заголовки столбцов (первые — время). */
  titles: string[];
  keys: string[];
  units: string[];
  /** Время каждой строки, мс Unix (UTC). */
  times: number[];
  /** Числа без времени: rows[k][j] — столбец columns[j]. */
  rows: number[][];
  digits: number[];
  msk: boolean;
  /** Эпоха элементов t₀, мс Unix. */
  epochMs: number;
}

export function buildTrackTable(orbit: PreparedOrbit, opt: TrackExportOptions): Table {
  const columns = [...BASE_COLUMNS, ...(['motion', 'anomalies', 'eci', 'ecef'] as const).filter((g) => opt.groups.includes(g)).flatMap((g) => GROUP_COLUMNS[g])];
  const times = exportTimes(opt.fromMs, opt.toMs, opt.stepSec);
  const rows = times.map((t) => {
    const s = propagate(orbit, t);
    return columns.map((c) => c.value(s));
  });
  return {
    titles: ['Время UTC', ...(opt.msk ? ['Время МСК (UTC+3)'] : []), ...columns.map((c) => c.title)],
    keys: ['time_utc', ...(opt.msk ? ['time_msk'] : []), ...columns.map((c) => c.key)],
    units: ['', ...(opt.msk ? [''] : []), ...columns.map((c) => c.unit)],
    times,
    rows,
    digits: columns.map((c) => c.digits),
    msk: opt.msk,
    epochMs: orbit.epochMs,
  };
}

const MSK_OFFSET_MS = 3 * 3600_000; // Москва — UTC+3 круглый год

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** «2026-11-04 12:00:05» — так время понимают Excel, Numbers и Google Таблицы. */
export function fmtTableTime(ms: number, offsetMs = 0): string {
  const d = new Date(Math.floor(ms / 1000) * 1000 + offsetMs); // доли секунды отбрасываются, как в остальном интерфейсе
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** ISO 8601 с миллисекундами в UTC: «2026-11-04T12:00:05.000Z». */
const iso = (ms: number) => new Date(ms).toISOString();

interface Dialect {
  sep: string;
  comma: boolean;
  eol: string;
  bom: boolean;
}

const DIALECTS: Record<Exclude<ExportFormat, 'json'>, Dialect> = {
  excel: { sep: ';', comma: true, eol: '\r\n', bom: true },
  csv: { sep: ',', comma: false, eol: '\n', bom: false },
  tsv: { sep: '\t', comma: true, eol: '\n', bom: false },
};

function num(x: number, digits: number, comma: boolean): string {
  if (!Number.isFinite(x)) return '';
  let s = x.toFixed(digits);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1); // «-0.000» после округления — просто ноль
  return comma ? s.replace('.', ',') : s;
}

/** Ячейка с текстом: в кавычки, если внутри разделитель, кавычка или перевод строки. */
function cell(text: string, sep: string): string {
  return text.includes(sep) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface ExportMeta {
  /** Название спутника. */
  satellite: string;
  /** Центральное тело. */
  body: string;
  /** Откуда взяты элементы. */
  source: string;
  /** Подпись номера: «Номер NORAD», «Номер NAIF» или null для своей орбиты. */
  idLabel: string | null;
}

/** Таблица в текст выбранного формата. */
export function tableToText(table: Table, format: ExportFormat, meta: ExportMeta): string {
  if (format === 'json') {
    const columns = table.keys.map((key, j) => ({ key, title: table.titles[j], unit: table.units[j] }));
    const off = table.msk ? 2 : 1;
    const rows = table.times.map((t, k) => {
      const o: Record<string, string | number> = { time_utc: iso(t) };
      if (table.msk) o.time_msk = fmtTableTime(t, MSK_OFFSET_MS);
      table.rows[k].forEach((v, j) => (o[table.keys[j + off]] = Number(v.toFixed(table.digits[j]))));
      return o;
    });
    return JSON.stringify(
      {
        satellite: meta.satellite,
        body: meta.body,
        source: meta.source,
        epoch_utc: iso(table.epochMs),
        model: 'Трасса спутника: невозмущённое кеплеровское движение (docs/formulas.md)',
        columns,
        rows,
      },
      null,
      1,
    );
  }
  const d = DIALECTS[format];
  const lines = [table.titles.map((t) => cell(t, d.sep)).join(d.sep)];
  table.times.forEach((t, k) => {
    const time = [fmtTableTime(t), ...(table.msk ? [fmtTableTime(t, MSK_OFFSET_MS)] : [])];
    lines.push([...time, ...table.rows[k].map((v, j) => num(v, table.digits[j], d.comma))].join(d.sep));
  });
  return (d.bom ? '﻿' : '') + lines.join(d.eol) + d.eol;
}

/** Строки таблицы «параметр — значение — единица» с элементами орбиты. */
export function elementsRows(orbit: PreparedOrbit, meta: ExportMeta, tle?: [string, string]): [string, string | number, string, number][] {
  const el = orbit.elements;
  const rows: [string, string | number, string, number][] = [
    ['Спутник', meta.satellite, '', 0],
    ['Центральное тело', meta.body, '', 0],
    ['Источник элементов', meta.source, '', 0],
    ...(meta.idLabel ? [[meta.idLabel, el.noradId, '', 0] as [string, number, string, number]] : []),
    ...(el.cosparId ? [['COSPAR', el.cosparId, '', 0] as [string, string, string, number]] : []),
    ['Эпоха t₀, UTC', fmtTableTime(el.epochMs), '', 0],
    ['Среднее движение N', el.meanMotion, 'об/сут', 8],
    ['Эксцентриситет e', el.eccentricity, '', 7],
    ['Наклонение i', el.inclinationDeg, '°', 4],
    ['Долгота восходящего узла Ω', el.raanDeg, '°', 4],
    ['Аргумент перицентра ω', el.argPerigeeDeg, '°', 4],
    ['Средняя аномалия M₀', el.meanAnomalyDeg, '°', 4],
    ['Гравитационный параметр μ', orbit.body.mu, 'км³/с²', 3],
    ['Радиус тела R', orbit.body.radius, 'км', 3],
    ['Период T', orbit.T, 'с', 3],
    ['Большая полуось a', orbit.a, 'км', 3],
    ['Фокальный параметр p', orbit.p, 'км', 3],
    ['Высота перицентра', orbit.hPerigee, 'км', 3],
    ['Высота апоцентра', orbit.hApogee, 'км', 3],
  ];
  if (tle) rows.push(['TLE, строка 1', tle[0], '', 0], ['TLE, строка 2', tle[1], '', 0]);
  return rows;
}

export function elementsToText(orbit: PreparedOrbit, format: ExportFormat, meta: ExportMeta, tle?: [string, string]): string {
  const rows = elementsRows(orbit, meta, tle);
  if (format === 'json') {
    const el = orbit.elements;
    return JSON.stringify(
      {
        satellite: meta.satellite,
        body: meta.body,
        source: meta.source,
        id: el.noradId,
        cospar: el.cosparId ?? null,
        epoch_utc: iso(el.epochMs),
        mean_motion_rev_day: el.meanMotion,
        eccentricity: el.eccentricity,
        inclination_deg: el.inclinationDeg,
        raan_deg: el.raanDeg,
        arg_periapsis_deg: el.argPerigeeDeg,
        mean_anomaly_deg: el.meanAnomalyDeg,
        mu_km3_s2: orbit.body.mu,
        body_radius_km: orbit.body.radius,
        period_s: orbit.T,
        semi_major_axis_km: orbit.a,
        focal_parameter_km: orbit.p,
        periapsis_height_km: orbit.hPerigee,
        apoapsis_height_km: orbit.hApogee,
        ...(tle ? { tle } : {}),
      },
      null,
      1,
    );
  }
  const d = DIALECTS[format];
  const lines = [['Параметр', 'Значение', 'Единица'].join(d.sep)];
  for (const [name, value, unit, digits] of rows) {
    const v = typeof value === 'number' ? num(value, digits, d.comma) : cell(value, d.sep);
    lines.push([cell(name, d.sep), v, unit].join(d.sep));
  }
  return (d.bom ? '﻿' : '') + lines.join(d.eol) + d.eol;
}

/** Расширение и тип файла. */
export function fileType(format: ExportFormat): { ext: string; mime: string } {
  if (format === 'json') return { ext: 'json', mime: 'application/json' };
  if (format === 'tsv') return { ext: 'tsv', mime: 'text/tab-separated-values' };
  return { ext: 'csv', mime: 'text/csv' };
}

/**
 * Имя файла: «Кеплер МКС трасса 2026-11-04 12-00 UTC.csv».
 * Символы, запрещённые в именах файлов Windows и macOS, заменяются.
 */
export function exportFileName(satellite: string, what: string, ms: number, ext: string): string {
  const t = fmtTableTime(ms).slice(0, 16).replace(':', '-');
  const name = `Кеплер ${satellite} ${what} ${t} UTC`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
  return `${name}.${ext}`;
}

/** Шаги таблицы на выбор, с. */
export const STEP_OPTIONS = [1, 5, 10, 30, 60, 300, 600, 1800, 3600] as const;

/** Шаг по умолчанию: около полградуса средней аномалии (T/720), округлённый вверх до шага из списка. */
export function defaultStep(periodSec: number): number {
  return STEP_OPTIONS.find((s) => s >= periodSec / 720) ?? STEP_OPTIONS[STEP_OPTIONS.length - 1];
}

/** Значение поля даты и времени (input type=datetime-local), в UTC: «2026-11-04T12:00:05». */
export function toInputValue(ms: number): string {
  return fmtTableTime(ms).replace(' ', 'T');
}

/** Обратно из поля даты (время в поле — UTC); NaN, если поле пустое или неполное. */
export function fromInputValue(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}
