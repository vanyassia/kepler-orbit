#!/usr/bin/env node
/**
 * Регионы Луны и Марса из справочника USGS Gazetteer of Planetary Nomenclature (названия IAU)
 * → src/data/regions.json.
 *
 * Источник: шейп-файлы центров объектов (asc-planetarynames-data, *_nomenclature_center_pts.zip).
 * Из атрибутивной таблицы (.dbf) берутся название, тип, центр и диаметр. Отбираются только
 * крупные площадные объекты (см. RULES), чтобы карта читалась.
 *
 * Запуск: npm run update:regions (нужны curl и unzip — есть в macOS и Linux).
 * USGS_DIR=<папка> — взять уже распакованные архивы (подпапки MOON и MARS).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASE = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com';

/** Разбор файла dBASE III (.dbf) — формата атрибутов шейп-файла. */
function readDbf(path) {
  const b = readFileSync(path);
  const n = b.readUInt32LE(4);
  const headerLen = b.readUInt16LE(8);
  const recLen = b.readUInt16LE(10);
  const fields = [];
  for (let p = 32; b[p] !== 0x0d; p += 32) {
    fields.push({ name: b.subarray(p, p + 11).toString('latin1').replace(/\0.*$/, ''), len: b[p + 16] });
  }
  const rows = [];
  for (let i = 0, off = headerLen; i < n; i++, off += recLen) {
    let q = off + 1;
    const row = {};
    for (const f of fields) {
      row[f.name] = b.subarray(q, q + f.len).toString('utf8').trim();
      q += f.len;
    }
    rows.push(row);
  }
  return rows;
}

/** Тип IAU → вид региона в приложении и минимальный размер, км. outline: рисовать ли контур. */
const RULES = {
  moon: [
    { re: /^(Mare|Oceanus)/, kind: 'mare', min: 0, outline: true },
    { re: /^(Lacus|Sinus|Palus)/, kind: 'mare', min: 150, outline: true },
    { re: /^Mons/, kind: 'mons', min: 300, outline: true },
    { re: /^Crater/, kind: 'crater', min: 200, outline: true },
  ],
  mars: [
    { re: /^Terra/, kind: 'land', min: 0, outline: true },
    { re: /^(Planitia|Vastitas)/, kind: 'plain', min: 0, outline: true },
    { re: /^Planum/, kind: 'plain', min: 800, outline: true },
    { re: /^(Mons|Tholus|Patera)/, kind: 'mons', min: 300, outline: true },
    { re: /^Crater/, kind: 'crater', min: 200, outline: true },
    { re: /^(Vallis|Labyrinthus|Chasma)/, kind: 'linear', min: 1100, outline: false },
  ],
};

const tmp = join(tmpdir(), 'kepler-usgs');
mkdirSync(tmp, { recursive: true });
const out = [];

for (const body of ['moon', 'mars']) {
  // USGS_DIR — папка с уже распакованными архивами (MOON/, MARS/), чтобы не скачивать заново
  let dir = process.env.USGS_DIR ? join(process.env.USGS_DIR, body.toUpperCase()) : join(tmp, body);
  if (!process.env.USGS_DIR) {
    const zip = join(tmp, `${body}.zip`);
    console.log(`↓ ${body}: справочник USGS`);
    execFileSync('curl', ['-sSL', '--fail', '-o', zip, `${BASE}/${body.toUpperCase()}_nomenclature_center_pts.zip`], { stdio: 'inherit' });
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  }
  const dbf = readdirSync(dir).find((f) => f.endsWith('.dbf'));
  const rows = readDbf(join(dir, dbf)).filter((r) => r.approval.startsWith('Adopted'));

  let count = 0;
  for (const r of rows) {
    const d = Number(r.diameter);
    const rule = RULES[body].find((x) => x.re.test(r.type));
    if (!rule || !(d >= rule.min)) continue;
    let lon = Number(r.center_lon);
    if (lon > 180) lon -= 360;
    out.push({
      body,
      name: r.name || r.clean_name,
      type: r.type.split(',')[0],
      kind: rule.kind,
      outline: rule.outline,
      lat: Math.round(Number(r.center_lat) * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      diameterKm: Math.round(d),
    });
    count++;
  }
  console.log(`✓ ${body}: ${count} регионов из ${rows.length} утверждённых объектов`);
}

out.sort((a, b) => b.diameterKm - a.diameterKm);
writeFileSync(
  join(ROOT, 'src', 'data', 'regions.json'),
  JSON.stringify({ source: 'USGS Gazetteer of Planetary Nomenclature (IAU), center points', savedAt: new Date().toISOString(), items: out }, null, 1) + '\n',
);
console.log(`Сохранено ${out.length} регионов → src/data/regions.json`);
