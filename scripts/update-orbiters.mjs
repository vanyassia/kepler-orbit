#!/usr/bin/env node
/**
 * Снимок элементов орбит спутников Луны и Марса (и самой Луны вокруг Земли) из JPL Horizons → public/data/orbiters.json.
 *
 * Запрашиваются оскулирующие элементы (EPHEM_TYPE=ELEMENTS) относительно центра тела
 * в системе «экватор тела и узел даты» (REF_PLANE=BODY) на текущий час; если эфемериды аппарата
 * уже закончились — за сутки до их конца.
 * Время Horizons — TDB; переводим в UTC: UTC = TDB − 69,184 с (TT − UTC при 37 високосных секундах).
 * У Земли «узел» этой системы — не точка весны, поэтому Ω пересчитывается (см. earthRaan).
 *
 * Запуск: npm run update:orbiters
 * С флагом --fixture дополнительно сохраняет контрольные точки (подспутниковая и подсолнечная
 * точки по Horizons) для юнит-тестов модели вращения тел.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const CENTER = { earth: '500@399', moon: '500@301', mars: '500@499' };
const TARGET = { earth: '399', moon: '301', mars: '499' };
const TDB_MINUS_UTC_MS = 69_184;

const src = readFileSync(join(ROOT, 'src', 'data', 'orbiters.ts'), 'utf8');
const list = [...src.matchAll(/naifId:\s*(-?\d+),\s*body:\s*'(\w+)'/g)].map((m) => ({ id: Number(m[1]), body: m[2] }));

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`;
const now = new Date();
now.setUTCMinutes(0, 0, 0);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** Конец эфемерид из ответа Horizons «No ephemeris for target … after A.D. 2026-AUG-14 11:58:59», мс Unix. */
function ephemerisEnd(message) {
  const m = /after A\.D\. (\d{4})-([A-Z]{3})-(\d{2}) (\d{2}):/.exec(message);
  return m ? Date.UTC(Number(m[1]), MONTHS.indexOf(m[2]), Number(m[3]), Number(m[4])) : null;
}

/**
 * Ω Луны от точки весны даты. В системе REF_PLANE=BODY для Земли Ω отсчитывается от узла экватора даты
 * на экваторе ICRF, а он отстоит от точки весны даты на 90° + z_A (z_A — угол прецессии, Lieske 1977).
 * Проверено по подлунной точке Horizons: без поправки расхождение 90,2°, с ней — меньше 0,01°.
 */
function earthRaan(omDeg, jdTdb) {
  const T = (jdTdb - 2451545) / 36525;
  const zA = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) / 3600;
  return (omDeg + 90 + zA) % 360;
}

async function horizons(params) {
  const url = `${API}?format=json&OBJ_DATA='NO'&MAKE_EPHEM='YES'&CSV_FORMAT='YES'&` + Object.entries(params).map(([k, v]) => `${k}='${encodeURIComponent(v)}'`).join('&');
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  const json = await res.json();
  const r = json.result ?? '';
  const i = r.indexOf('$$SOE');
  if (i < 0) throw new Error(r.trim().split('\n').slice(-3).join(' '));
  const name = /Target body name:\s*(.+?)\s{2,}/.exec(r)?.[1] ?? '';
  return { name, row: r.slice(i + 5).trim().split('\n')[0].split(',').map((x) => x.trim()) };
}

const dir = join(ROOT, 'public', 'data');
const file = join(dir, 'orbiters.json');

// Прежний снимок: аппарат, на который Horizons не ответил, остаётся с прежними элементами, а не исчезает с сайта
let previous = [];
try {
  previous = JSON.parse(readFileSync(file, 'utf8')).items ?? [];
} catch {
  // снимка ещё нет — соберём заново
}

const items = [];
const checks = [];
let fresh = 0;
for (const { id, body } of list) {
  try {
    const elementsAt = (d) =>
      horizons({
        COMMAND: String(id),
        EPHEM_TYPE: 'ELEMENTS',
        CENTER: CENTER[body],
        START_TIME: stamp(d),
        STOP_TIME: stamp(new Date(d.getTime() + 3_600_000)),
        STEP_SIZE: '1h',
        REF_PLANE: 'BODY',
        OUT_UNITS: 'KM-S',
      });
    const { name, row } = await elementsAt(now).catch((e) => {
      const end = ephemerisEnd(e.message);
      if (end === null) throw e;
      return elementsAt(new Date(end - 86_400_000));
    });
    const [jdTdb, , EC, , IN, OM, W, , N, MA, , A] = row;
    const epochMs = (Number(jdTdb) - 2440587.5) * 86_400_000 - TDB_MINUS_UTC_MS;
    const item = {
      naifId: id,
      body,
      name,
      epoch: new Date(epochMs).toISOString(),
      eccentricity: Number(EC),
      inclinationDeg: Number(IN),
      raanDeg: body === 'earth' ? earthRaan(Number(OM), Number(jdTdb)) : Number(OM),
      argPerigeeDeg: Number(W),
      meanAnomalyDeg: Number(MA),
      meanMotionDegPerSec: Number(N),
      semiMajorAxisKm: Number(A),
    };
    // Ответ без чисел (изменился формат таблицы) не должен попасть в снимок
    for (const k of ['eccentricity', 'inclinationDeg', 'raanDeg', 'argPerigeeDeg', 'meanAnomalyDeg', 'meanMotionDegPerSec', 'semiMajorAxisKm']) {
      if (!Number.isFinite(item[k])) throw new Error(`в ответе Horizons нет числа ${k}`);
    }
    if (!Number.isFinite(epochMs) || !(item.meanMotionDegPerSec > 0) || !(item.eccentricity >= 0 && item.eccentricity < 1)) {
      throw new Error('элементы Horizons не описывают замкнутую орбиту');
    }
    items.push(item);
    fresh++;
    console.log(`✓ ${id} ${name}: a = ${item.semiMajorAxisKm.toFixed(0)} км, e = ${item.eccentricity.toFixed(4)}`);

    if (process.argv.includes('--fixture')) {
      // Контроль: наблюдатель — сам КА, цель — центральное тело; величины 14 и 15 —
      // точка под наблюдателем (подспутниковая) и подсолнечная точка на теле.
      // Через 10 минут после эпохи; округление — чтобы 11:09:59,999 не превратилось в запрос на 11:09
      const t = new Date(Math.round((epochMs + TDB_MINUS_UTC_MS + 600_000) / 60_000) * 60_000);
      const obs = await horizons({
        COMMAND: TARGET[body],
        EPHEM_TYPE: 'OBSERVER',
        CENTER: `500@${id}`,
        START_TIME: `${stamp(t).slice(0, 14)}${pad(t.getUTCMinutes())}`,
        STOP_TIME: `${stamp(new Date(t.getTime() + 60_000)).slice(0, 14)}${pad(new Date(t.getTime() + 60_000).getUTCMinutes())}`,
        STEP_SIZE: '1m',
        QUANTITIES: '14,15',
        TIME_TYPE: 'UT',
      });
      const [, , , subLon, subLat, sunLon, sunLat] = obs.row;
      checks.push({ naifId: id, body, timeUtc: t.toISOString(), subLon: Number(subLon), subLat: Number(subLat), sunLon: Number(sunLon), sunLat: Number(sunLat) });
    }
  } catch (e) {
    const old = previous.find((x) => x.naifId === id && x.body === body);
    if (old) items.push(old);
    console.warn(`✗ ${id}: ${e.message}${old ? ` — оставлена прежняя запись (эпоха ${old.epoch})` : ' — прежней записи нет'}`);
  }
}

// Ни одного свежего ответа — сеть или Horizons недоступны: снимок не трогаем, запуск считается неудачным
if (fresh === 0) {
  console.error('JPL Horizons не ответил ни на один запрос — снимок оставлен без изменений');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(
  file,
  JSON.stringify({ savedAt: new Date().toISOString(), source: 'JPL Horizons (ssd.jpl.nasa.gov), REF_PLANE=BODY', items }, null, 2) + '\n',
);
console.log(`Сохранено ${items.length} аппаратов (свежих ${fresh}, прежних ${items.length - fresh}) → public/data/orbiters.json`);

if (checks.length) {
  const f = join(ROOT, 'src', 'physics', '__tests__', 'fixtures');
  mkdirSync(f, { recursive: true });
  writeFileSync(
    join(f, 'horizons-check.json'),
    JSON.stringify({ note: 'Долготы Horizons: Луна — восточные, Марс — западные (планетографические)', elements: items, checks }, null, 2) + '\n',
  );
  console.log(`Контрольные точки: ${checks.length} → src/physics/__tests__/fixtures/horizons-check.json`);
}
