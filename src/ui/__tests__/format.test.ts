import { describe, expect, it } from 'vitest';
import { fmtDuration } from '../format';

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
