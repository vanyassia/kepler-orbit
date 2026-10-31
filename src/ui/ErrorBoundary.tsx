import { Component } from 'react';
import type { ReactNode } from 'react';

/**
 * Запасной вид вместо части интерфейса, в которой случилась ошибка. Без него любая ошибка отрисовки
 * оставляет пустую страницу: например, если браузер не дал WebGL или после обновления сайта
 * не нашёлся файл панели, которая ещё не загружена.
 */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
