// node scripts/build-saturn-rings.mjs PIA11142.jpg
// Мозаика «Кассини», NASA/JPL/Space Science Institute:
// https://science.nasa.gov/photojournal/a-full-sweep-of-saturns-rings/
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const input = process.argv[2];
if (!input) throw new Error('Укажите путь к оригинальной мозаике PIA11142.jpg');
const width = 12126;
const height = 1439;
const image = execFileSync('ffmpeg', ['-v', 'error', '-i', input, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], {
  maxBuffer: width * height * 4,
});
if (image.length !== width * height * 3) throw new Error('Ожидается оригинальная мозаика 12126 × 1439');

// Привязка снимка к радиусу по краям колец и серединам щелей.
// https://pds-rings.seti.org/saturn/saturn_tables.html
const anchors = [
  [74491, 1134], [77837, 1701], [87477, 3321], [91975, 4070],
  [117570, 8104], [133584, 10579], [136504, 11020], [136770, 11060], [140224, 11633],
  [140612, 11696],
];
const inner = 66900;
const outer = 140612;
// Прозрачность приблизительная: в C и делении Кассини больше просветов, чем в A и B.
const densityByRegion = [[91975, 1.5], [117570, 3.2], [122050, 0.77], [136770, 1.53], [outer, 1.1]];
const count = 4096;
const data = Buffer.alloc(count * 4);
const clamp = (x) => Math.max(0, Math.min(1, x));
const linear = (x) => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;

// Несколько строк вдоль вершины дуг усредняют шум, сохраняя тонкие щели.
function sample(x, channel) {
  const col = Math.floor(x);
  const t = x - col;
  let sum = 0;
  for (let row = 817; row <= 823; row++) {
    const offset = (row * width + col) * 3 + channel;
    sum += image[offset] * (1 - t) + image[offset + 3] * t;
  }
  return sum / (7 * 255);
}

for (let i = 0, segment = 0; i < count; i++) {
  const r = inner + ((i + 0.5) / count) * (outer - inner);
  let color;
  let opacity;
  if (r < anchors[0][0]) {
    // Кольцо D не видно на снимке. Две слабые полосы на радиусах из каталога.
    color = [0.53, 0.49, 0.43];
    opacity = 0.012 + 0.05 * Math.exp(-(((r - 67580) / 100) ** 2))
      + 0.045 * Math.exp(-(((r - 71710) / 175) ** 2));
  } else {
    if (r > anchors[segment + 1][0]) segment++;
    const [r0, x0] = anchors[segment];
    const [r1, x1] = anchors[segment + 1];
    const x = x0 + (x1 - x0) * (r - r0) / (r1 - r0);
    const rgb = [sample(x, 0), sample(x, 1), sample(x, 2)];
    const brightness = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    const [, density] = densityByRegion.find(([edge]) => r < edge);
    opacity = clamp((brightness - 0.014) * density);
    color = rgb.map((v) => clamp(v / Math.max(0.18, opacity) ** 0.52));
  }
  // Храним линейный цвет, умноженный на непрозрачность.
  // Усреднение на дальних планах тогда не добавляет тёмные ореолы вокруг щелей.
  for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(255 * opacity * linear(color[c]));
  data[i * 4 + 3] = Math.round(255 * opacity);
}

writeFileSync(new URL('../src/views/globe3d/saturn-rings.base64', import.meta.url), data.toString('base64') + '\n');
