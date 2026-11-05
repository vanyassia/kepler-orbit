/**
 * Режим показа: шапка, боковая панель, нижняя панель и кнопки видов скрыты, на весь экран — только
 * карта или глобус. Удобно для выступления и скриншота.
 *
 * Что прятать, помечено атрибутом data-chrome; правило скрытия — в Presentation.module.css
 * (действует, пока у <html> стоит data-presenting). Браузер по возможности уходит во весь экран;
 * на iPhone так нельзя — тогда просто скрываются панели. Выход — кнопка в углу, Esc или выход
 * из полноэкранного режима средствами браузера. Кнопка и указатель мыши прячутся, если мышь
 * не двигалась 2,5 с.
 */
import { Minimize2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import styles from './Presentation.module.css';

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };

const fullscreenElement = () => document.fullscreenElement ?? (document as FsDocument).webkitFullscreenElement ?? null;

/** Включить показ. Вызывать прямо из обработчика нажатия: браузер пускает во весь экран только по действию пользователя. */
export function startPresentation(): void {
  const root = document.documentElement as FsElement;
  try {
    if (root.requestFullscreen) void root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else root.webkitRequestFullscreen?.();
  } catch {
    /* браузер не умеет во весь экран (iPhone) — показ без этого */
  }
  useAppStore.getState().setPresenting(true);
}

function leaveFullscreen() {
  if (!fullscreenElement()) return;
  const doc = document as FsDocument;
  try {
    if (doc.exitFullscreen) void doc.exitFullscreen().catch(() => {});
    else doc.webkitExitFullscreen?.();
  } catch {
    /* уже вышли */
  }
}

/** Слой режима показа: кнопка выхода и обработка Esc. Пока показ выключен, ничего не делает. */
export function PresentationLayer() {
  const presenting = useAppStore((s) => s.presenting);
  return presenting ? <ExitButton /> : null;
}

const IDLE_MS = 2500;

function ExitButton() {
  const [idle, setIdle] = useState(false);
  const stop = () => useAppStore.getState().setPresenting(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.presenting = '';
    // Вышли из полноэкранного режима средствами браузера (Esc, зелёная кнопка окна) — выходим и из показа
    const onFullscreen = () => {
      if (!fullscreenElement()) useAppStore.getState().setPresenting(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useAppStore.getState().setPresenting(false);
    };
    // Кнопка и указатель мыши прячутся, когда мышь не двигается; касание или движение показывают их снова
    let timer = 0;
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    wake();
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', wake);
    window.addEventListener('pointerdown', wake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('webkitfullscreenchange', onFullscreen);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      delete root.dataset.presenting;
      delete root.dataset.idle;
      leaveFullscreen();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (idle) root.dataset.idle = '';
    else delete root.dataset.idle;
  }, [idle]);

  return (
    <button type="button" className={styles.exit} data-idle={idle || undefined} onClick={stop} title="Выйти из режима показа (Esc)">
      <Minimize2 size={16} aria-hidden="true" />
      Выйти из показа
    </button>
  );
}
