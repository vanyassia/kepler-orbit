import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';

/**
 * Единый цикл времени симуляции. Время считается от опорной точки
 * (t_sim = t_опорн + Δt_реальное · скорость), а не накоплением шагов кадра,
 * поэтому при пропуске кадров оно не отстаёт от реального.
 */
export function useSimClock(): void {
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      useAppStore.getState().tick(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // Вкладка снова видна — сразу догоняем время
    const onVisible = () => useAppStore.getState().tick(performance.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
      // На малых скоростях числа меняются медленно — обновлять панели чаще незачем
      const gap = s.speed <= 10 ? Math.max(intervalMs, 250) : intervalMs;
      if (jump || now - lastSet >= gap) {
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
