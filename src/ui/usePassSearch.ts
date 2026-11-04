/**
 * Поиск пролётов над поставленной точкой — общий для раздела в боковой панели и плашки на карте.
 * Пока точки нет, ничего не считается.
 */
import { useEffect, useMemo, useState } from 'react';
import { useThrottledSimTime } from '../hooks/useSimClock';
import type { Pass, PassSearch } from '../physics/passes';
import { findPasses } from '../physics/passes';
import type { PreparedOrbit } from '../physics/propagate';
import type { PassTarget } from '../state/store';
import { passRadiusOf, useAppStore } from '../state/store';

export const DAY_MS = 86_400_000;

export interface PassSearchState {
  orbit: PreparedOrbit;
  target: PassTarget;
  radius: number;
  days: number;
  /** Время модели (обновляется раз в секунду). */
  t: number;
  /** Момент, от которого искали. */
  anchor: number;
  research: () => void;
  result: PassSearch;
  /** Состояние пролёта относительно текущего времени. */
  stateOf: (p: Pass) => 'past' | 'now' | 'next';
}

export function usePassSearch(): PassSearchState | null {
  const orbit = useAppStore((s) => s.orbit);
  const body = useAppStore((s) => s.body);
  const target = useAppStore((s) => s.passTargets[body] ?? null);
  const radius = useAppStore((s) => passRadiusOf(s, body));
  const days = useAppStore((s) => s.passDays);
  const t = useThrottledSimTime(1000);

  // Момент, от которого ищем. Сдвигается при смене точки, спутника, настроек и при уходе времени за пределы списка
  const [anchor, setAnchor] = useState(t);
  useEffect(() => {
    setAnchor(useAppStore.getState().simTime);
  }, [orbit, target, radius, days]);
  useEffect(() => {
    if (t < anchor - 60_000 || t > anchor + days * DAY_MS) setAnchor(t);
  }, [t, anchor, days]);

  // Начинаем на 15 минут раньше: пролёт, который идёт прямо сейчас, остаётся в списке
  const result = useMemo(
    () => (orbit && target ? findPasses(orbit, target, anchor - 15 * 60_000, anchor + days * DAY_MS, { maxDistanceKm: radius }) : null),
    [orbit, target, anchor, days, radius],
  );

  if (!orbit || !target || !result) return null;
  // «Сейчас» — пока спутник в пределах шестидесятой доли витка от момента сближения (у МКС ≈ 1,5 мин)
  const nowWindow = Math.min(30 * 60_000, Math.max(60_000, (orbit.T * 1000) / 60));
  return {
    orbit,
    target,
    radius,
    days,
    t,
    anchor,
    research: () => setAnchor(useAppStore.getState().simTime),
    result,
    stateOf: (p) => (p.timeMs < t - nowWindow ? 'past' : p.timeMs <= t + nowWindow ? 'now' : 'next'),
  };
}

/** Боковая панель выдвижная (телефон, планшет): её надо убрать, чтобы увидеть карту. */
export const drawerSidebar = () => matchMedia('(max-width: 1100px)').matches;

/** Перейти к моменту пролёта (на телефоне — закрыв панель, чтобы видеть карту). */
export function goToPass(p: Pass) {
  const st = useAppStore.getState();
  st.setSimTime(p.timeMs);
  if (drawerSidebar()) st.setSidebarOpen(false);
}
