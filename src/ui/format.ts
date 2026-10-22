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

/** Широта: 55,756° с. ш. */
export function fmtLat(deg: number, digits = 3): string {
  return `${fmt(Math.abs(deg), digits)}° ${deg >= 0 ? 'с. ш.' : 'ю. ш.'}`;
}

/** Долгота: 37,617° в. д. */
export function fmtLon(deg: number, digits = 3): string {
  return `${fmt(Math.abs(deg), digits)}° ${deg >= 0 ? 'в. д.' : 'з. д.'}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** «22.10.2026 14:05:09» в UTC или со смещением (МСК = +3 ч). */
export function fmtDateTime(ms: number, offsetHours = 0, withSeconds = true): string {
  const d = new Date(ms + offsetHours * 3_600_000);
  const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${withSeconds ? ':' + pad(d.getUTCSeconds()) : ''}`;
  return `${date} ${time}`;
}

export function fmtTime(ms: number, offsetHours = 0): string {
  const d = new Date(ms + offsetHours * 3_600_000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
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
