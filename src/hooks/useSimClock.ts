import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';

/** Единый цикл времени симуляции: каждый кадр t_sim += Δt_реальное · скорость. */
export function useSimClock(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      // Ограничиваем шаг, чтобы после сворачивания вкладки время не «прыгало»
      const dt = Math.min(now - last, 250);
      last = now;
      useAppStore.getState().advance(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Время симуляции с ограниченной частотой обновления — для текстовых панелей. */
export function useThrottledSimTime(intervalMs = 100): number {
  const [t, setT] = useState(() => useAppStore.getState().simTime);
  useEffect(() => {
    let lastSet = 0;
    return useAppStore.subscribe((s, prev) => {
      if (s.simTime === prev.simTime) return;
      const now = performance.now();
      // Скачок времени (ползунок, «Сейчас») показываем сразу
      const jump = Math.abs(s.simTime - prev.simTime) > 60_000 * Math.max(1, s.speed / 60);
      if (jump || now - lastSet >= intervalMs) {
        lastSet = now;
        setT(s.simTime);
      }
    });
  }, [intervalMs]);
  return t;
}

/** Реальное текущее время, обновляется раз в секунду. */
export function useWallClock(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
