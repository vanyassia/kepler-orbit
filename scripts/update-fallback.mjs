#!/usr/bin/env node
/**
 * Обновление запасного снимка элементов орбит (public/data/fallback-gp.json).
 * Используется, когда CelesTrak недоступен и в кэше браузера ничего нет.
 *
 * Запуск: npm run update:fallback
 * Скрипт делает по одному запросу на спутник — в пределах правил CelesTrak
 * (не чаще раза в 2 часа для одних и тех же данных).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const popularSrc = readFileSync(join(ROOT, 'src', 'data', 'popular.ts'), 'utf8');
const ids = [...popularSrc.matchAll(/noradId:\s*(\d+)/g)].map((m) => Number(m[1]));

const out = [];
for (const id of ids) {
  const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${id}&FORMAT=json`;
  const res = await fetch(url);
  const text = await res.text();
  try {
    const arr = JSON.parse(text);
    out.push(...arr);
    console.log(`✓ ${id} ${arr[0]?.OBJECT_NAME} (эпоха ${arr[0]?.EPOCH})`);
  } catch {
    console.warn(`✗ ${id}: ${text.slice(0, 80)}`);
  }
}

const dir = join(ROOT, 'public', 'data');
mkdirSync(dir, { recursive: true });
const snapshot = { savedAt: new Date().toISOString(), source: 'https://celestrak.org (GP API, OMM JSON)', items: out };
writeFileSync(join(dir, 'fallback-gp.json'), JSON.stringify(snapshot, null, 2) + '\n');
console.log(`Сохранено ${out.length} спутников → public/data/fallback-gp.json`);
