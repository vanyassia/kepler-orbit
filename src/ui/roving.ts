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
  const controls = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"], [role="tab"]');
  let next: number;
  let direction = 1;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (i + 1) % n;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      direction = -1;
      next = (i - 1 + n) % n;
      break;
    case 'Home':
      next = 0;
      break;
    case 'End':
      next = n - 1;
      direction = -1;
      break;
    default:
      return;
  }
  e.preventDefault();
  for (let skipped = 0; controls[next]?.disabled; skipped++) {
    if (skipped === n - 1) return;
    next = (next + direction + n) % n;
  }
  select(options[next]);
  controls[next]?.focus();
}

/** tabIndex варианта в группе: только выбранный доступен по Tab. */
export const rovingTabIndex = (selected: boolean) => (selected ? 0 : -1);
