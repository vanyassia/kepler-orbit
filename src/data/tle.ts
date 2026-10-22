/**
 * Разбор двухстрочного формата TLE (Two-Line Element set) — запасной способ
 * ввести элементы вручную, если CelesTrak недоступен.
 *
 * Позиции полей (нумерация символов с 1):
 *  строка 1:  3–7 номер NORAD; 10–17 международное обозначение; 19–20 год эпохи;
 *             21–32 день года с дробной частью; 69 контрольная сумма;
 *  строка 2:  9–16 наклонение i; 18–25 Ω; 27–33 эксцентриситет (без «0.»);
 *             35–42 ω; 44–51 M₀; 53–63 среднее движение, об/сут; 69 контрольная сумма.
 */
import type { OrbitalElements } from '../physics/propagate';
import { validateElements } from './omm';

/** Контрольная сумма строки TLE: сумма цифр + по 1 за каждый «−», по модулю 10. */
export function tleChecksum(line: string): number {
  let sum = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') sum += ch.charCodeAt(0) - 48;
    else if (ch === '-') sum += 1;
  }
  return sum % 10;
}

const field = (line: string, from: number, to: number) => line.slice(from - 1, to).trim();

/** Эпоха TLE (год из двух цифр + день года с дробью) → мс Unix. */
export function tleEpochToMs(yy: number, dayOfYear: number): number {
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86_400_000;
}

/** «98067A» → «1998-067A». */
function cosparFromTle(s: string): string | undefined {
  const m = /^(\d{2})(\d{3})(\w*)$/.exec(s);
  if (!m) return undefined;
  const yy = Number(m[1]);
  return `${yy < 57 ? 2000 + yy : 1900 + yy}-${m[2]}${m[3]}`;
}

/**
 * Разбор одного набора TLE: две строки или три (первая — название).
 * @throws Error с понятным описанием ошибки.
 */
export function parseTle(text: string): OrbitalElements {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  const i1 = lines.findIndex((l) => l.startsWith('1 '));
  if (i1 < 0 || !lines[i1 + 1]?.startsWith('2 ')) {
    throw new Error('Не найдены строки TLE: первая должна начинаться с «1 », вторая — с «2 »');
  }
  const l1 = lines[i1];
  const l2 = lines[i1 + 1];
  const name = i1 > 0 ? lines[i1 - 1].replace(/^0 /, '').trim() : '';

  for (const [n, l] of [
    [1, l1],
    [2, l2],
  ] as const) {
    if (l.length < 69) throw new Error(`Строка ${n} TLE короче 69 символов`);
    const expected = Number(l[68]);
    if (tleChecksum(l) !== expected) {
      throw new Error(`Неверная контрольная сумма в строке ${n}: ожидалось ${tleChecksum(l)}, указано ${expected}`);
    }
  }

  const noradId = Number(field(l1, 3, 7));
  if (Number(field(l2, 3, 7)) !== noradId) throw new Error('Номера NORAD в строках 1 и 2 не совпадают');

  const el: OrbitalElements = {
    name: name || `NORAD ${noradId}`,
    noradId,
    cosparId: cosparFromTle(field(l1, 10, 17)),
    epochMs: tleEpochToMs(Number(field(l1, 19, 20)), Number(field(l1, 21, 32))),
    inclinationDeg: Number(field(l2, 9, 16)),
    raanDeg: Number(field(l2, 18, 25)),
    eccentricity: Number(`0.${field(l2, 27, 33)}`),
    argPerigeeDeg: Number(field(l2, 35, 42)),
    meanAnomalyDeg: Number(field(l2, 44, 51)),
    meanMotion: Number(field(l2, 53, 63)),
  };
  validateElements(el);
  return el;
}
