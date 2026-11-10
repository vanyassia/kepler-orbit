#!/usr/bin/env node
/**
 * Обновление запасного снимка элементов орбит (public/data/fallback-gp.json).
 * Используется, когда CelesTrak недоступен и в кэше браузера ничего нет.
 *
 * Запуск: npm run update:fallback
 * Скрипт делает по одному запросу на спутник — в пределах правил CelesTrak
 * (не чаще раза в 2 часа для одних и тех же данных).
 * Спутник, на который CelesTrak не ответил, остаётся в снимке с прежними элементами.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const popularSrc = readFileSync(join(ROOT, 'src', 'data', 'popular.ts'), 'utf8');
const ids = [...popularSrc.matchAll(/noradId:\s*(\d+)/g)].map((m) => Number(m[1]));

const dir = join(ROOT, 'public', 'data');
const file = join(dir, 'fallback-gp.json');

// Прежний снимок: если CelesTrak не ответил или убрал спутник из каталога (так 04.11.2026 пропал Спектр-Р —
// «No GP data found»), запись остаётся прежней, а не исчезает с сайта.
let previous = [];
try {
  previous = JSON.parse(readFileSync(file, 'utf8')).items ?? [];
} catch {
  // снимка ещё нет — соберём заново
}
const previousById = new Map(previous.map((r) => [Number(r.NORAD_CAT_ID), r]));

const out = [];
let fresh = 0;
for (const id of ids) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=json`;
  let record = null;
  let reason = '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    try {
      const arr = JSON.parse(text);
      record = (Array.isArray(arr) ? arr : []).find((r) => Number(r?.NORAD_CAT_ID) === id) ?? null;
      if (!record) reason = 'в ответе нет этого спутника';
    } catch {
      reason = text.trim().slice(0, 80) || `пустой ответ (${res.status})`;
    }
  } catch (e) {
    reason = e.message;
  }
  if (record) {
    out.push(record);
    fresh++;
    console.log(`✓ ${id} ${record.OBJECT_NAME} (эпоха ${record.EPOCH})`);
  } else if (previousById.has(id)) {
    const old = previousById.get(id);
    out.push(old);
    console.warn(`✗ ${id}: ${reason} — оставлена прежняя запись ${old.OBJECT_NAME} (эпоха ${old.EPOCH})`);
  } else {
    console.warn(`✗ ${id}: ${reason} — прежней записи нет`);
  }
}

// Ни одного свежего ответа — сеть или CelesTrak недоступны: снимок не трогаем, запуск считается неудачным
if (fresh === 0) {
  console.error('CelesTrak не ответил ни на один запрос — снимок оставлен без изменений');
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
const snapshot = { savedAt: new Date().toISOString(), source: 'https://celestrak.org (GP API, OMM JSON)', items: out };
writeFileSync(file, JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Сохранено ${out.length} спутников (свежих ${fresh}, прежних ${out.length - fresh}) → public/data/fallback-gp.json`);
