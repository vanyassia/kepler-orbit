import { splitLabelSymbol } from './format';

/**
 * Подпись «как на пульте»: слова заглавными с разрядкой (класс .caps в global.css),
 * обозначение величины в конце — в обычном написании (класс .sym).
 */
export function CapsLabel({ text }: { text: string }) {
  const { words, symbol } = splitLabelSymbol(text);
  return (
    <>
      {words}
      {symbol && (
        <>
          {' '}
          <span className="sym">{symbol}</span>
        </>
      )}
    </>
  );
}
