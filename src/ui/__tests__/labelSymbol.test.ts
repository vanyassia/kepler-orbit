import { describe, expect, it } from 'vitest';
import { splitLabelSymbol } from '../format';

describe('Подпись величины: слова и обозначение', () => {
  it('обозначение в конце отделяется', () => {
    expect(splitLabelSymbol('Широта φ')).toEqual({ words: 'Широта', symbol: 'φ' });
    expect(splitLabelSymbol('Высота h')).toEqual({ words: 'Высота', symbol: 'h' });
    expect(splitLabelSymbol('Радиальная скорость Vr')).toEqual({ words: 'Радиальная скорость', symbol: 'Vr' });
    expect(splitLabelSymbol('Средняя аномалия M₀')).toEqual({ words: 'Средняя аномалия', symbol: 'M₀' });
  });
  it('без обозначения подпись остаётся целой', () => {
    expect(splitLabelSymbol('NORAD')).toEqual({ words: 'NORAD', symbol: null });
    expect(splitLabelSymbol('Центральное тело')).toEqual({ words: 'Центральное тело', symbol: null });
    expect(splitLabelSymbol('Эпоха элементов, UTC')).toEqual({ words: 'Эпоха элементов, UTC', symbol: null });
  });
});
