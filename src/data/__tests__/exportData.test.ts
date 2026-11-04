import { describe, expect, it } from 'vitest';
import { RAD } from '../../physics/constants';
import type { OrbitalElements } from '../../physics/propagate';
import { prepareOrbit, propagate } from '../../physics/propagate';
import type { ExportMeta } from '../exportData';
import { buildTrackTable, defaultStep, elementsToText, exportFileName, exportTimes, fmtTableTime, fromInputValue, rowCount, tableToText, toInputValue } from '../exportData';

const t0 = Date.UTC(2026, 10, 4, 12, 0, 0);

const ISS: OrbitalElements = {
  name: 'ISS (ZARYA)',
  noradId: 25544,
  epochMs: t0,
  meanMotion: 15.49059765,
  eccentricity: 0.000692,
  inclinationDeg: 51.6337,
  raanDeg: 11.7282,
  argPerigeeDeg: 310.9581,
  meanAnomalyDeg: 49.0809,
};
const orbit = prepareOrbit(ISS);
const meta: ExportMeta = { satellite: 'МКС', body: 'Земля', source: 'CelesTrak', idLabel: 'Номер NORAD' };

describe('моменты таблицы', () => {
  it('шаг укладывается целиком: концы включены', () => {
    expect(exportTimes(0, 60_000, 10)).toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000]);
    expect(rowCount(0, 60_000, 10)).toBe(7);
  });
  it('не укладывается: последняя строка — ровно конец интервала', () => {
    expect(exportTimes(0, 25_000, 10)).toEqual([0, 10_000, 20_000, 25_000]);
    expect(rowCount(0, 25_000, 10)).toBe(4);
  });
  it('пустой или ошибочный интервал — без строк', () => {
    expect(exportTimes(10, 0, 10)).toEqual([]);
    expect(rowCount(0, 1000, 0)).toBe(0);
  });
  it('счёт строк без расчёта совпадает с расчётом', () => {
    for (const [a, b, s] of [[0, 5_577_580, 30], [t0, t0 + 86_400_000, 60], [5, 5, 1]] as const)
      expect(rowCount(a, b, s)).toBe(exportTimes(a, b, s).length);
  });
});

describe('таблица трассы', () => {
  const table = buildTrackTable(orbit, { fromMs: t0, toMs: t0 + 600_000, stepSec: 60, groups: ['motion', 'eci'], msk: true });

  it('числа те же, что в модели (propagate)', () => {
    const s = propagate(orbit, t0 + 120_000);
    const row = table.rows[2];
    const col = (key: string) => row[table.keys.indexOf(key) - 2]; // первые два столбца — время
    expect(col('lat_deg')).toBeCloseTo(s.lat * RAD, 10);
    expect(col('lon_deg')).toBeCloseTo(s.lon * RAD, 10);
    expect(col('h_km')).toBeCloseTo(s.h, 10);
    expect(col('v_kms')).toBeCloseTo(s.V, 10);
    expect(col('x_eci_km')).toBeCloseTo(s.eci.x, 10);
  });

  it('выбранные группы столбцов, без лишних', () => {
    expect(table.keys).toContain('r_km');
    expect(table.keys).toContain('vz_eci_kms');
    expect(table.keys).not.toContain('nu_deg');
    expect(table.keys).not.toContain('x_ecef_km');
    expect(table.titles.slice(0, 2)).toEqual(['Время UTC', 'Время МСК (UTC+3)']);
  });

  it('CSV для Excel: «;», десятичная запятая, метка UTF-8 и CRLF', () => {
    const text = tableToText(table, 'excel', meta);
    expect(text.startsWith('﻿Время UTC;Время МСК (UTC+3);t − t₀ (с);')).toBe(true);
    const lines = text.split('\r\n');
    expect(lines).toHaveLength(table.times.length + 2); // заголовок + строки + пустая после последнего перевода
    expect(lines[1].startsWith('2026-11-04 12:00:00;2026-11-04 15:00:00;0,0;')).toBe(true);
    expect(lines[1]).not.toMatch(/\d\.\d/);
  });

  it('обычный CSV: «,» и десятичная точка', () => {
    const text = tableToText(table, 'csv', meta);
    const [head, first] = text.split('\n');
    expect(head.split(',')).toHaveLength(table.titles.length);
    expect(first.split(',')).toHaveLength(table.titles.length);
    expect(first).toMatch(/,\d+\.\d{3},/);
  });

  it('JSON: описание, столбцы с единицами и строки', () => {
    const data = JSON.parse(tableToText(table, 'json', meta));
    expect(data.satellite).toBe('МКС');
    expect(data.epoch_utc).toBe('2026-11-04T12:00:00.000Z');
    expect(data.rows).toHaveLength(11);
    expect(data.rows[0].time_utc).toBe('2026-11-04T12:00:00.000Z');
    expect(data.rows[0].time_msk).toBe('2026-11-04 15:00:00');
    expect(data.columns.find((c: { key: string }) => c.key === 'h_km').unit).toBe('km');
    expect(typeof data.rows[3].lat_deg).toBe('number');
  });
});

describe('элементы орбиты', () => {
  it('таблица для Excel: параметр, значение, единица', () => {
    const text = elementsToText(orbit, 'excel', meta, ['1 25544U …', '2 25544 …']);
    expect(text).toContain('Наклонение i;51,6337;°');
    expect(text).toContain('Номер NORAD;25544;');
    expect(text).toContain('TLE, строка 1;1 25544U …;');
  });
  it('своя орбита — без номера', () => {
    expect(elementsToText(orbit, 'csv', { ...meta, idLabel: null }, undefined)).not.toContain('Номер');
  });
  it('JSON с производными величинами', () => {
    const data = JSON.parse(elementsToText(orbit, 'json', meta));
    expect(data.inclination_deg).toBe(51.6337);
    expect(data.period_s).toBeCloseTo(orbit.T, 6);
    expect(data.tle).toBeUndefined();
  });
  it('текст с запятой берётся в кавычки', () => {
    expect(elementsToText(orbit, 'csv', { ...meta, satellite: 'Луна, спутник' })).toContain('"Луна, спутник"');
  });
});

describe('имя файла и время', () => {
  it('доли секунды отбрасываются, как в интерфейсе', () => {
    expect(fmtTableTime(Date.UTC(2026, 0, 2, 3, 4, 5, 600))).toBe('2026-01-02 03:04:05');
  });
  it('без запрещённых символов', () => {
    expect(exportFileName('Марс-2 / орбитер', 'трасса', t0, 'csv')).toBe('Кеплер Марс-2 - орбитер трасса 2026-11-04 12-00 UTC.csv');
  });
});

describe('шаг и поля даты', () => {
  it('шаг по умолчанию: МКС — 10 с, Луна — 1 ч', () => {
    expect(defaultStep(5577)).toBe(10);
    expect(defaultStep(27.3 * 86400)).toBe(3600);
    expect(defaultStep(100)).toBe(1);
  });
  it('поле даты — туда и обратно в UTC', () => {
    expect(toInputValue(t0 + 5000)).toBe('2026-11-04T12:00:05');
    expect(fromInputValue('2026-11-04T12:00:05')).toBe(t0 + 5000);
    expect(fromInputValue('2026-11-04T12:00')).toBe(t0); // Safari может отдать без секунд
    expect(fromInputValue('')).toBeNaN();
  });
});
