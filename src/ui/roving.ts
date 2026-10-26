/**
 * Клавиатура для групп переключателей (role="radiogroup" и role="tablist") по образцу WAI-ARIA:
 * стрелки ←/→/↑/↓ выбирают соседний вариант по кругу, Home и End — крайние; фокус идёт за выбором.
 * В последовательность Tab попадает только выбранный вариант (tabIndex 0, остальные −1).
 *
 * Событие помечается preventDefault — так глобальные сочетания (←/→ — шаг времени) его пропускают.
 */
export function rovingKeyDown<T>(e: React.KeyboardEvent<HTMLElement>, options: readonly T[], current: T, select: (value: T) => void): void {
  const n = options.length;
  const i = Math.max(0, options.indexOf(current));
  let next: number;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (i + 1) % n;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (i - 1 + n) % n;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = n - 1;
      break;
    default:
      return;
  }
  e.preventDefault();
  select(options[next]);
  e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"], [role="tab"]')[next]?.focus();
}

/** tabIndex варианта в группе: только выбранный доступен по Tab. */
export const rovingTabIndex = (selected: boolean) => (selected ? 0 : -1);
