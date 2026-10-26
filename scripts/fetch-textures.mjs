#!/usr/bin/env node
/**
 * Скачивание и подготовка текстур Земли.
 *
 * Исходники:
 *  - NASA Visible Earth, Blue Marble Next Generation (июль 2004, рельеф + батиметрия),
 *    21600×10800, общественное достояние.
 *  - NASA Earth Observatory, Black Marble 2016 (ночные огни), 13500×6750, общественное достояние.
 *  - NASA Visible Earth, облачный покров, 8192×4096, общественное достояние.
 *  - Solar System Scope: карта нормалей, маска бликов (океаны), звёздное небо, карты Луны и Марса, CC BY 4.0.
 *
 * Пережатие выполняется встроенной в macOS утилитой `sips` (без сторонних зависимостей).
 * Запуск: npm run fetch:textures
 * Переменная SRC_DIR позволяет указать папку с уже скачанными исходниками.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(process.env.SRC_DIR ?? join(ROOT, '.cache', 'textures-src'));
const OUT = join(ROOT, 'public', 'textures');
const SSS_REFERER = 'https://www.solarsystemscope.com/textures/';

const sources = {
  'day_21600.jpg':
    'https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/world.topo.bathy.200407.3x21600x10800.jpg',
  'night_13500.jpg':
    'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg',
  'clouds_8192.tif':
    'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif',
  'sss_normal.tif': 'https://www.solarsystemscope.com/textures/download/8k_earth_normal_map.tif',
  'sss_specular.tif': 'https://www.solarsystemscope.com/textures/download/8k_earth_specular_map.tif',
  'sss_stars.jpg': 'https://www.solarsystemscope.com/textures/download/8k_stars_milky_way.jpg',
  'sss_moon.jpg': 'https://www.solarsystemscope.com/textures/download/8k_moon.jpg',
  'sss_mars.jpg': 'https://www.solarsystemscope.com/textures/download/8k_mars.jpg',
};

/** [исходник, выходной файл, ширина, качество JPEG] — высота всегда ширина/2 (равнопромежуточная проекция) */
const outputs = [
  ['day_21600.jpg', 'earth_day_16k.jpg', 16384, 82],
  ['day_21600.jpg', 'earth_day_8k.jpg', 8192, 86],
  ['day_21600.jpg', 'earth_day_2k.jpg', 2048, 82],
  ['night_13500.jpg', 'earth_night_8k.jpg', 8192, 86],
  ['night_13500.jpg', 'earth_night_2k.jpg', 2048, 82],
  ['clouds_8192.tif', 'earth_clouds_4k.jpg', 4096, 85],
  ['sss_normal.tif', 'earth_normal_4k.jpg', 4096, 90],
  ['sss_specular.tif', 'earth_specular_2k.jpg', 2048, 85],
  ['sss_stars.jpg', 'stars_4k.jpg', 4096, 85],
  ['sss_moon.jpg', 'moon_6k.jpg', 6144, 72],
  ['sss_moon.jpg', 'moon_2k.jpg', 2048, 82],
  ['sss_mars.jpg', 'mars_8k.jpg', 8192, 70],
  ['sss_mars.jpg', 'mars_2k.jpg', 2048, 82],
];

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const [file, url] of Object.entries(sources)) {
  const dst = join(SRC, file);
  if (existsSync(dst) && statSync(dst).size > 100_000) continue;
  console.log(`↓ ${file}`);
  const args = ['-sSL', '--fail', '-o', dst, url];
  if (url.includes('solarsystemscope')) args.unshift('-e', SSS_REFERER);
  execFileSync('curl', args, { stdio: 'inherit' });
}

for (const [src, out, width, quality] of outputs) {
  const dst = join(OUT, out);
  console.log(`⚙ ${out} (${width}×${width / 2})`);
  execFileSync(
    'sips',
    ['-z', String(width / 2), String(width), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), join(SRC, src), '--out', dst],
    { stdio: 'ignore' },
  );
  console.log(`  ${(statSync(dst).size / 1e6).toFixed(1)} МБ`);
}
console.log('Готово:', OUT);
