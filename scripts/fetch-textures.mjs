#!/usr/bin/env node
/**
 * Скачивание и подготовка текстур планет.
 *
 * Исходники:
 *  - NASA Visible Earth, Blue Marble Next Generation (июль 2004, рельеф + батиметрия),
 *    21600×10800, общественное достояние.
 *  - NASA Earth Observatory, Black Marble 2016 (ночные огни), 13500×6750, общественное достояние.
 *  - NASA Visible Earth, облачный покров, 8192×4096, общественное достояние.
 *  - Solar System Scope: карта нормалей, маска бликов (океаны), звёздное небо, карты Луны и Марса, CC BY 4.0.
 *  - NASA Mercury Trek: глобальная трёхцветная мозаика MESSENGER MDIS (NASA / JHU APL / USGS).
 *
 * Пережатие выполняется встроенной в macOS утилитой `sips`, затем `cwebp` (brew install webp).
 * Качество WebP подобрано так, чтобы SSIM к JPEG был не ниже 0,99. Mars 8K и Земля 16K остаются в JPEG:
 * зернистый снимок Марса в WebP того же качества почти не легчает, а 16384 пикселя WebP не вмещает.
 * Запуск: npm run fetch:textures
 * Только Меркурий: npm run fetch:textures -- --mercury. Для сборки мозаики нужен ffmpeg.
 * Переменная SRC_DIR позволяет указать папку с уже скачанными исходниками.
 */
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = resolve(process.env.SRC_DIR ?? join(ROOT, '.cache', 'textures-src'));
const OUT = join(ROOT, 'public', 'textures');
const SSS_REFERER = 'https://www.solarsystemscope.com/textures/';
const MERCURY_MOSAIC = 'mercury_mdis_seamless_4k.png';
const mercuryOnly = process.argv.includes('--mercury');

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
  'sss_saturn.jpg': 'https://www.solarsystemscope.com/textures/download/8k_saturn.jpg',
  'sss_venus.jpg': 'https://www.solarsystemscope.com/textures/download/8k_venus_surface.jpg',
  'sss_venus_atmo.jpg': 'https://www.solarsystemscope.com/textures/download/4k_venus_atmosphere.jpg',
};

/** Качество WebP; файлов нет в списке — остаются в JPEG. */
const WEBP = {
  'earth_day_8k.jpg': 93,
  'earth_day_2k.jpg': 90,
  'earth_night_8k.jpg': 84,
  'earth_night_2k.jpg': 82,
  'earth_clouds_4k.jpg': 84,
  'earth_normal_4k.jpg': 85,
  'earth_specular_2k.jpg': 82,
  'stars_4k.jpg': 90,
  'moon_6k.jpg': 84,
  'moon_2k.jpg': 85,
  'mars_2k.jpg': 90,
  'venus_8k.jpg': 80,
  'venus_2k.jpg': 88,
  'venus_clouds_4k.jpg': 88,
  'venus_clouds_2k.jpg': 88,
  'saturn_4k.jpg': 86,
  'saturn_2k.jpg': 88,
  'mercury_4k.jpg': 88,
  'mercury_2k.jpg': 88,
};

/** Значки тел в переключателе. */
const THUMBS = {
  'earth_day_2k.jpg': 'thumb_earth.webp',
  'moon_2k.jpg': 'thumb_moon.webp',
  'mars_2k.jpg': 'thumb_mars.webp',
  'venus_2k.jpg': 'thumb_venus.webp',
  'saturn_2k.jpg': 'thumb_saturn.webp',
  'mercury_2k.jpg': 'thumb_mercury.webp',
};

/**
 * Поворот исходника, градусы: снимок Венеры на Solar System Scope перевёрнут на 180°
 * относительно системы IAU (из-за обратного вращения планеты север IAU оказался внизу).
 */
const ROTATE = { 'sss_venus.jpg': 180 };

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
  ['sss_venus.jpg', 'venus_8k.jpg', 8192, 84],
  ['sss_venus.jpg', 'venus_2k.jpg', 2048, 82],
  ['sss_venus_atmo.jpg', 'venus_clouds_4k.jpg', 4096, 96],
  ['sss_venus_atmo.jpg', 'venus_clouds_2k.jpg', 2048, 96],
  ['sss_saturn.jpg', 'saturn_4k.jpg', 4096, 96],
  ['sss_saturn.jpg', 'saturn_2k.jpg', 2048, 96],
  [MERCURY_MOSAIC, 'mercury_4k.jpg', 4096, 94],
  [MERCURY_MOSAIC, 'mercury_2k.jpg', 2048, 94],
];

/** Уровень 3 NASA Trek: 16 × 8 тайлов по 256 px от 180° з. д. к 180° в. д. */
async function fetchMercuryMosaic(dst) {
  if (existsSync(dst)) return;
  const url = 'https://trek.nasa.gov/tiles/Mercury/EQ/Mercury_MESSENGER_MDIS_Basemap_MD3Color_Mosaic_Global_665m/1.0.0/default/default028mm/3';
  const tiles = join(SRC, 'mercury-mdis-tiles');
  mkdirSync(tiles, { recursive: true });
  const run = promisify(execFile);
  for (let row = 0; row < 8; row++) {
    console.log(`↓ Меркурий: ряд ${row + 1} из 8`);
    await Promise.all(Array.from({ length: 16 }, async (_, col) => {
      const file = join(tiles, `${String(row * 16 + col).padStart(3, '0')}.jpg`);
      if (existsSync(file)) return;
      await run('curl', ['-fsSL', '--retry', '3', '--max-time', '30', '-o', `${file}.part`, `${url}/${row}/${col}.jpg`]);
      renameSync(`${file}.part`, file);
    }));
  }
  // Последний столбец мозаики NASA затемнён. На стыке долгот ±180° восстанавливаем
  // его средним между предпоследним и первым столбцами, сохраняя привязку текстуры.
  const filters = [
    'tile=16x8:nb_frames=128,format=gbrp,split=3[base][west][east]',
    '[west]crop=1:ih:0:0[westEdge]',
    '[east]crop=1:ih:iw-2:0[eastEdge]',
    '[westEdge][eastEdge]blend=all_mode=average[seam]',
    '[base][seam]overlay=x=W-w:y=0:format=gbrp',
  ];
  const partial = `${dst}.part.png`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', join(tiles, '%03d.jpg'), '-filter_complex', filters.join(';'), '-frames:v', '1', partial], { stdio: 'inherit' });
  renameSync(partial, dst);
}

mkdirSync(SRC, { recursive: true });
mkdirSync(OUT, { recursive: true });

for (const [file, url] of mercuryOnly ? [] : Object.entries(sources)) {
  const dst = join(SRC, file);
  if (existsSync(dst) && statSync(dst).size > 100_000) continue;
  console.log(`↓ ${file}`);
  const args = ['-sSL', '--fail', '-o', dst, url];
  if (url.includes('solarsystemscope')) args.unshift('-e', SSS_REFERER);
  execFileSync('curl', args, { stdio: 'inherit' });
}

await fetchMercuryMosaic(join(SRC, MERCURY_MOSAIC));
for (const [src, out, width, quality] of outputs) {
  if (mercuryOnly && src !== MERCURY_MOSAIC) continue;
  const dst = join(OUT, out);
  console.log(`⚙ ${out} (${width}×${width / 2})`);
  execFileSync(
    'sips',
    [...(ROTATE[src] ? ['-r', String(ROTATE[src])] : []), '-z', String(width / 2), String(width), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), join(SRC, src), '--out', dst],
    { stdio: 'ignore' },
  );
  console.log(`  ${(statSync(dst).size / 1e6).toFixed(1)} МБ`);
  if (THUMBS[out]) {
    const small = join(SRC, `${out}.thumb.png`);
    execFileSync('sips', ['-z', '80', '160', '-s', 'format', 'png', dst, '--out', small], { stdio: 'ignore' });
    execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', '-sharp_yuv', small, '-o', join(OUT, THUMBS[out])]);
  }
  if (WEBP[out]) {
    const webp = dst.replace(/\.jpg$/, '.webp');
    execFileSync('cwebp', ['-quiet', '-mt', '-q', String(WEBP[out]), '-m', '6', '-sharp_yuv', dst, '-o', webp]);
    rmSync(dst);
    console.log(`  WebP: ${(statSync(webp).size / 1e6).toFixed(1)} МБ`);
  }
}
console.log('Готово:', OUT);
