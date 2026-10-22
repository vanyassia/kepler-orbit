import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ommToElements, type OmmRecord } from '../omm';
import { parseTle, tleChecksum, tleEpochToMs } from '../tle';
import { prepareOrbit, propagate } from '../../physics/propagate';

const fixtures = join(import.meta.dirname, 'fixtures');
const issTle = readFileSync(join(fixtures, 'iss.tle'), 'utf8');
const issOmm = (JSON.parse(readFileSync(join(fixtures, 'iss.json'), 'utf8')) as OmmRecord[])[0];

describe('OMM JSON (CelesTrak)', () => {
  it('переводит запись в начальные элементы', () => {
    const el = ommToElements(issOmm);
    expect(el).toMatchObject({
      name: 'ISS (ZARYA)',
      noradId: 25544,
      cosparId: '1998-067A',
      meanMotion: 15.48967427,
      eccentricity: 0.00067597,
      inclinationDeg: 51.6327,
      raanDeg: 37.2623,
      argPerigeeDeg: 289.5321,
      meanAnomalyDeg: 70.4938,
    });
    expect(new Date(el.epochMs).toISOString()).toBe('2026-10-21T01:08:59.469Z');
  });

  it('отклоняет незамкнутую орбиту', () => {
    expect(() => ommToElements({ ...issOmm, ECCENTRICITY: 1.2 })).toThrow(/эксцентриситет/);
  });
});

describe('TLE', () => {
  it('контрольная сумма строк реального TLE МКС верна', () => {
    const [, l1, l2] = issTle.split('\n');
    expect(tleChecksum(l1)).toBe(Number(l1[68]));
    expect(tleChecksum(l2)).toBe(Number(l2[68]));
  });

  it('элементы из TLE совпадают с OMM JSON того же момента', () => {
    const fromTle = parseTle(issTle);
    const fromOmm = ommToElements(issOmm);
    expect(fromTle.name).toBe('ISS (ZARYA)');
    expect(fromTle.noradId).toBe(fromOmm.noradId);
    expect(fromTle.cosparId).toBe(fromOmm.cosparId);
    expect(Math.abs(fromTle.epochMs - fromOmm.epochMs)).toBeLessThan(1); // разрешение TLE ≈ 0,86 мс
    expect(fromTle.inclinationDeg).toBe(fromOmm.inclinationDeg);
    expect(fromTle.raanDeg).toBe(fromOmm.raanDeg);
    // В TLE на эксцентриситет отведено 7 знаков, в JSON CelesTrak — 8: 0,0006759 против 0,00067597
    expect(Math.abs(fromTle.eccentricity - fromOmm.eccentricity)).toBeLessThan(1e-7);
    expect(fromTle.argPerigeeDeg).toBe(fromOmm.argPerigeeDeg);
    expect(fromTle.meanAnomalyDeg).toBe(fromOmm.meanAnomalyDeg);
    expect(fromTle.meanMotion).toBe(fromOmm.meanMotion);
  });

  it('положения КА по TLE и по JSON совпадают', () => {
    const t = Date.UTC(2026, 9, 22, 12);
    const a = propagate(prepareOrbit(parseTle(issTle)), t);
    const b = propagate(prepareOrbit(ommToElements(issOmm)), t);
    expect(Math.hypot(a.eci.x - b.eci.x, a.eci.y - b.eci.y, a.eci.z - b.eci.z)).toBeLessThan(0.01);
  });

  it('двухстрочный вариант без названия', () => {
    const [, l1, l2] = issTle.split('\n');
    expect(parseTle(`${l1}\n${l2}`).name).toBe('NORAD 25544');
  });

  it('ошибка контрольной суммы описана понятно', () => {
    const [name, l1, l2] = issTle.split('\n');
    const broken = l2.slice(0, 68) + String((Number(l2[68]) + 1) % 10);
    expect(() => parseTle([name, l1, broken].join('\n'))).toThrow(/контрольная сумма в строке 2/);
  });

  it('эпоха: год из двух цифр и день года', () => {
    expect(tleEpochToMs(0, 1.5)).toBe(Date.UTC(2000, 0, 1, 12));
    expect(tleEpochToMs(99, 365)).toBe(Date.UTC(1999, 11, 31));
  });

  it('мусор вместо TLE', () => {
    expect(() => parseTle('hello')).toThrow(/Не найдены строки TLE/);
  });
});
