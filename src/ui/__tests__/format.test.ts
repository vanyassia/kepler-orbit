import { describe, expect, it } from 'vitest';
import { fmtDuration, fmtOffset } from '../format';

describe('Длительность', () => {
  it('обычные значения', () => {
    expect(fmtDuration(45)).toBe('45 с');
    expect(fmtDuration(92 * 60 + 5)).toBe('1 ч 32 мин');
    expect(fmtDuration(2 * 86400 + 4 * 3600)).toBe('2 сут 4 ч');
  });
  it('округление не даёт «60 мин» и «24 ч»', () => {
    expect(fmtDuration(5 * 3600 + 59 * 60 + 40)).toBe('6 ч 0 мин');
    expect(fmtDuration(59 * 60 + 59.7)).toBe('1 ч 0 мин');
    expect(fmtDuration(59.6)).toBe('1 мин 0 с');
    expect(fmtDuration(86400 * 3 - 600)).toBe('3 сут 0 ч');
  });
});

describe('fmtOffset: сдвиг от текущего времени', () => {
  it('минуты, часы, сутки, годы', () => {
    expect(fmtOffset(0.5)).toBe('30\u00a0мин');
    expect(fmtOffset(-5.5)).toBe('5,5\u00a0ч');
    expect(fmtOffset(24 * 12)).toBe('12\u00a0сут');
    // Восток-1 из ноября 2026 года
    const hours = (Date.parse('2026-11-10T12:00:00Z') - Date.parse('1961-04-12T06:07:00Z')) / 3_600_000;
    expect(fmtOffset(-hours)).toBe('65\u00a0лет');
    expect(fmtOffset(24 * 365.25 * 2.5)).toBe('2\u00a0года');
    expect(fmtOffset(24 * 365.25 * 21.2)).toBe('21\u00a0год');
  });
});
