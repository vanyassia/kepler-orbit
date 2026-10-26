#!/usr/bin/env node
/**
 * Снимок элементов орбит спутников Луны и Марса из JPL Horizons → public/data/orbiters.json.
 *
 * Запрашиваются оскулирующие элементы (EPHEM_TYPE=ELEMENTS) относительно центра тела
 * в системе «экватор тела и узел даты» (REF_PLANE=BODY) на текущий час.
 * Время Horizons — TDB; переводим в UTC: UTC = TDB − 69,184 с (TT − UTC при 37 високосных секундах).
 *
 * Запуск: npm run update:orbiters
 * С флагом --fixture дополнительно сохраняет контрольные точки (подспутниковая и подсолнечная
 * точки по Horizons) для юнит-тестов модели вращения тел.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const API = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const CENTER = { moon: '500@301', mars: '500@499' };
const TARGET = { moon: '301', mars: '499' };
const TDB_MINUS_UTC_MS = 69_184;

const src = readFileSync(join(ROOT, 'src', 'data', 'orbiters.ts'), 'utf8');
const list = [...src.matchAll(/naifId:\s*(-?\d+),\s*body:\s*'(\w+)'/g)].map((m) => ({ id: Number(m[1]), body: m[2] }));

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`;
const now = new Date();
now.setUTCMinutes(0, 0, 0);
const t0 = stamp(now);
const t1 = stamp(new Date(now.getTime() + 3_600_000));

async function horizons(params) {
  const url = `${API}?format=json&OBJ_DATA='NO'&MAKE_EPHEM='YES'&CSV_FORMAT='YES'&` + Object.entries(params).map(([k, v]) => `${k}='${encodeURIComponent(v)}'`).join('&');
  const res = await fetch(url);
  const json = await res.json();
  const r = json.result ?? '';
  const i = r.indexOf('$$SOE');
  if (i < 0) throw new Error(r.trim().split('\n').slice(-1)[0]);
  const name = /Target body name:\s*(.+?)\s{2,}/.exec(r)?.[1] ?? '';
  return { name, row: r.slice(i + 5).trim().split('\n')[0].split(',').map((x) => x.trim()) };
}

const items = [];
const checks = [];
for (const { id, body } of list) {
  try {
    const { name, row } = await horizons({
      COMMAND: String(id),
      EPHEM_TYPE: 'ELEMENTS',
      CENTER: CENTER[body],
      START_TIME: t0,
      STOP_TIME: t1,
      STEP_SIZE: '1h',
      REF_PLANE: 'BODY',
      OUT_UNITS: 'KM-S',
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
      raanDeg: Number(OM),
      argPerigeeDeg: Number(W),
      meanAnomalyDeg: Number(MA),
      meanMotionDegPerSec: Number(N),
      semiMajorAxisKm: Number(A),
    };
    items.push(item);
    console.log(`✓ ${id} ${name}: a = ${item.semiMajorAxisKm.toFixed(0)} км, e = ${item.eccentricity.toFixed(4)}`);

    if (process.argv.includes('--fixture')) {
      // Контроль: наблюдатель — сам КА, цель — центральное тело; величины 14 и 15 —
      // точка под наблюдателем (подспутниковая) и подсолнечная точка на теле.
      const t = new Date(epochMs + TDB_MINUS_UTC_MS + 600_000); // через 10 минут после эпохи
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
    console.warn(`✗ ${id}: ${e.message}`);
  }
}

const dir = join(ROOT, 'public', 'data');
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, 'orbiters.json'),
  JSON.stringify({ savedAt: new Date().toISOString(), source: 'JPL Horizons (ssd.jpl.nasa.gov), REF_PLANE=BODY', items }, null, 2) + '\n',
);
console.log(`Сохранено ${items.length} аппаратов → public/data/orbiters.json`);

if (checks.length) {
  const f = join(ROOT, 'src', 'physics', '__tests__', 'fixtures');
  mkdirSync(f, { recursive: true });
  writeFileSync(
    join(f, 'horizons-check.json'),
    JSON.stringify({ note: 'Долготы Horizons: Луна — восточные, Марс — западные (планетографические)', elements: items, checks }, null, 2) + '\n',
  );
  console.log(`Контрольные точки: ${checks.length} → src/physics/__tests__/fixtures/horizons-check.json`);
}
