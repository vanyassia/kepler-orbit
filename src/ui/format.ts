/**
 * Форматирование чисел и времени для интерфейса (русская локаль:
 * десятичная запятая, неразрывный пробел между разрядами, «−» вместо дефиса).
 */
const nf = (digits: number) =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

const cache = new Map<number, Intl.NumberFormat>();

export function fmt(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  let f = cache.get(digits);
  if (!f) cache.set(digits, (f = nf(digits)));
  return f.format(value).replace('-', '−');
}

/** «1 виток», «2 витка», «5 витков». */
export function revsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'виток' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'витка' : 'витков';
  return `${n}\u00a0${word}`;
}

/** Широта: 55,756° с. ш. */
export function fmtLat(deg: number, digits = 3): string {
  return `${fmt(Math.abs(deg), digits)}° ${deg >= 0 ? 'с. ш.' : 'ю. ш.'}`;
}

/** Долгота: 37,617° в. д. */
export function fmtLon(deg: number, digits = 3): string {
  return `${fmt(Math.abs(deg), digits)}° ${deg >= 0 ? 'в. д.' : 'з. д.'}`;
}

/** Часовые пояса интерфейса: всемирное время и московское. */
export type Zone = 'UTC' | 'MSK';
const TZ: Record<Zone, string> = { UTC: 'UTC', MSK: 'Europe/Moscow' };

const dtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(zone: Zone, withDate: boolean, withSeconds: boolean): Intl.DateTimeFormat {
  const key = `${zone}|${withDate}|${withSeconds}`;
  let f = dtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('ru-RU', {
      timeZone: TZ[zone],
      ...(withDate ? { day: '2-digit', month: '2-digit', year: 'numeric' } : {}),
      hour: '2-digit',
      minute: '2-digit',
      ...(withSeconds ? { second: '2-digit' } : {}),
      hourCycle: 'h23',
    });
    dtCache.set(key, f);
  }
  return f;
}

/** «22.10.2026 14:05:09» во всемирном (UTC) или московском времени. */
export function fmtDateTime(ms: number, zone: Zone = 'UTC', withSeconds = true): string {
  return dtf(zone, true, withSeconds).format(ms).replace(',', '');
}

/** «14:05:09». */
export function fmtTime(ms: number, zone: Zone = 'UTC'): string {
  return dtf(zone, false, true).format(ms);
}

/** Длительность: «1 ч 32 мин», «2 сут 4 ч», «45 с». */
export function fmtDuration(seconds: number): string {
  const s = Math.abs(seconds);
  if (s < 60) return `${Math.round(s)} с`;
  if (s < 3600) return `${Math.floor(s / 60)} мин ${Math.round(s % 60)} с`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч ${Math.round((s % 3600) / 60)} мин`;
  return `${Math.floor(s / 86400)} сут ${Math.round((s % 86400) / 3600)} ч`;
}

/** Возраст данных: «5 мин назад», «3 ч назад», «2 сут назад». */
export function fmtAge(ms: number): string {
  const s = ms / 1000;
  if (s < 90) return 'только что';
  if (s < 5400) return `${Math.round(s / 60)} мин назад`;
  if (s < 172800) return `${Math.round(s / 3600)} ч назад`;
  return `${Math.round(s / 86400)} сут назад`;
}
