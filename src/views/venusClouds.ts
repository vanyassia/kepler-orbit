/** Период супервращения облачного покрова Венеры: ≈ 4 земных суток на запад. */
export const VENUS_CLOUD_PERIOD_MS = 4 * 86_400_000;

/** Сдвиг координаты выборки снимка в [0, 1). При его росте облака уходят на запад. */
export function venusCloudShift(timeMs: number): number {
  const frac = (timeMs % VENUS_CLOUD_PERIOD_MS) / VENUS_CLOUD_PERIOD_MS;
  return frac < 0 ? frac + 1 : frac === 0 ? 0 : frac;
}
