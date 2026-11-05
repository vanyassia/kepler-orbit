#!/usr/bin/env node
/**
 * Скачивание снимков аппаратов с Wikimedia Commons для миниатюры в боковой панели.
 * Список, подписи, авторы и лицензии — в src/data/photos.ts (Node читает .ts сам, без сборки).
 * Для каждого снимка: <image>.webp с длинной стороной до 720 px и миниатюра <image>-s.webp высотой 96 px.
 * Нужна утилита cwebp (brew install webp). Запуск: npm run fetch:photos
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PHOTOS } from '../src/data/photos.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public', 'photos');
const UA = 'KeplerOrbitSite/1.0 (https://vanyassia.github.io/kepler-orbit/)';
const LONG_SIDE = 720;
const THUMB_H = 96;

mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'kepler-photos-'));

/** Адрес уменьшенной копии с Commons (не больше оригинала) и ширина оригинала. */
async function thumbUrl(file) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size&iiurlwidth=${LONG_SIDE * 1.25}&titles=${encodeURIComponent('File:' + file)}`;
  const d = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  const ii = Object.values(d.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!ii) throw new Error(`Нет файла на Commons: ${file}`);
  // Для маленьких оригиналов Commons отдаёт сам оригинал
  return { url: ii.thumburl ?? ii.url, width: ii.thumbwidth ?? ii.width, height: ii.thumbheight ?? ii.height };
}

const done = new Set();
let total = 0;
try {
  for (const photo of Object.values(PHOTOS)) {
    if (done.has(photo.image)) continue;
    done.add(photo.image);
    const { url, width, height } = await thumbUrl(photo.commons);
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`${photo.commons}: ответ ${r.status}`);
    const src = join(tmp, photo.image + (/\.png/i.test(url) ? '.png' : '.jpg'));
    writeFileSync(src, Buffer.from(await r.arrayBuffer()));
    const full = join(OUT, `${photo.image}.webp`);
    const small = join(OUT, `${photo.image}-s.webp`);
    // Длинная сторона — не больше LONG_SIDE: высокие снимки иначе выходят тяжёлыми
    const resize = Math.max(width, height) <= LONG_SIDE ? [] : width >= height ? ['-resize', String(LONG_SIDE), '0'] : ['-resize', '0', String(LONG_SIDE)];
    execFileSync('cwebp', ['-quiet', '-q', '72', '-m', '6', '-metadata', 'none', ...resize, src, '-o', full]);
    execFileSync('cwebp', ['-quiet', '-q', '70', '-m', '6', '-metadata', 'none', '-resize', '0', String(THUMB_H), src, '-o', small]);
    const kb = (statSync(full).size + statSync(small).size) / 1024;
    total += kb;
    console.log(`${photo.image.padEnd(16)} ${kb.toFixed(0).padStart(4)} КБ`);
    await new Promise((res) => setTimeout(res, 300)); // не торопим Commons
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`Готово: ${done.size} снимков, ${(total / 1024).toFixed(1)} МБ`);
