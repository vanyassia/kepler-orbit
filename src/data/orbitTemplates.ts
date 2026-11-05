/**
 * Готовые шаблоны для окна «Свой спутник»: кнопка заполняет поля типичными значениями,
 * дальше их можно менять. Модель расчёта не меняется — это только исходные числа.
 *
 * Высоты «стационарных» орбит и «Молнии» вычисляются из нужного периода по третьему закону Кеплера
 * с теми же μ и R, что и в модели: a = ∛(μ·(T/2π)²), h = a − R. Так спутник в модели и правда
 * стоит над одной точкой (или повторяет трассу), а не уплывает из-за округления.
 */
import type { BodyId } from '../physics/bodies';
import { BODIES, ROTATION_PERIOD } from '../physics/bodies';
import { TWO_PI } from '../physics/constants';

export interface OrbitTemplate {
  id: string;
  /** Подпись на кнопке. */
  label: string;
  /** Название спутника, которое подставляется в поле «Название». */
  satName: string;
  body: BodyId;
  hPeri: number;
  hApo: number;
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  /** Пояснение под полями: чем орбита интересна. */
  note: string;
}

/** Большая полуось по периоду: a = ∛(μ·(T/2π)²). */
export const axisFromPeriod = (T: number, mu: number) => Math.cbrt(mu * (T / TWO_PI) ** 2);

/** Округление до 0,1 км — так число удобно читать в поле и спутник почти не уплывает. */
const km = (v: number) => Math.round(v * 10) / 10;

/** Высота круговой орбиты с периодом T над телом. */
function circularHeight(body: BodyId, T: number): number {
  const b = BODIES[body];
  return km(axisFromPeriod(T, b.mu) - b.radius);
}

const geoH = circularHeight('earth', ROTATION_PERIOD.earth);
const areoH = circularHeight('mars', ROTATION_PERIOD.mars);

// «Молния»: период — половина звёздных суток, перигей 600 км, апогей — сколько получится при таком периоде
const molniyaPeri = 600;
const molniyaApo = km(2 * axisFromPeriod(ROTATION_PERIOD.earth / 2, BODIES.earth.mu) - 2 * BODIES.earth.radius - molniyaPeri);

const zeroAngles = { raanDeg: 0, argPerigeeDeg: 0, meanAnomalyDeg: 0 };

export const ORBIT_TEMPLATES: OrbitTemplate[] = [
  {
    id: 'geo',
    label: 'Геостационарная',
    satName: 'Геостационарный',
    body: 'earth',
    hPeri: geoH,
    hApo: geoH,
    inclinationDeg: 0,
    ...zeroAngles,
    note: 'Период равен звёздным суткам, i = 0°: спутник висит над одной точкой экватора. Долготу этой точки меняет Ω.',
  },
  {
    id: 'molniya',
    label: 'Молния',
    satName: 'Молния',
    body: 'earth',
    hPeri: molniyaPeri,
    hApo: molniyaApo,
    inclinationDeg: 63.4,
    raanDeg: 0,
    argPerigeeDeg: 270,
    meanAnomalyDeg: 0,
    note: 'Период — половина звёздных суток, i = 63,4°, апогей над северным полушарием (ω = 270°): спутник долго висит над севером, а мимо юга пролетает быстро.',
  },
  {
    id: 'sso',
    label: 'Солнечно-синхронная',
    satName: 'Солнечно-синхронный',
    body: 'earth',
    hPeri: 700,
    hApo: 700,
    inclinationDeg: 98.16,
    ...zeroAngles,
    note: 'Высота 700 км и наклонение 98,16°, как у настоящих солнечно-синхронных спутников. В модели двух тел плоскость орбиты не поворачивается за Солнцем: это делает сжатие Земли, которого в модели нет.',
  },
  {
    id: 'polar',
    label: 'Полярная',
    satName: 'Полярный',
    body: 'earth',
    hPeri: 600,
    hApo: 600,
    inclinationDeg: 90,
    ...zeroAngles,
    note: 'i = 90°: трасса проходит над обоими полюсами, и за сутки спутник пролетает над всей планетой.',
  },
  {
    id: 'mars-areo',
    label: 'Ареостационарная',
    satName: 'Ареостационарный',
    body: 'mars',
    hPeri: areoH,
    hApo: areoH,
    inclinationDeg: 0,
    ...zeroAngles,
    note: 'Период равен звёздным суткам Марса, i = 0°: спутник висит над одной точкой марсианского экватора.',
  },
  {
    id: 'mars-sso',
    label: 'Солнечно-синхронная',
    satName: 'Солнечно-синхронный',
    body: 'mars',
    hPeri: 255,
    hApo: 320,
    inclinationDeg: 92.65,
    raanDeg: 0,
    argPerigeeDeg: 270,
    meanAnomalyDeg: 0,
    note: 'Орбита картографических аппаратов Марса: 255 × 320 км, i = 92,65°. В модели двух тел плоскость не поворачивается за Солнцем — это делает сжатие Марса.',
  },
  {
    id: 'mars-polar',
    label: 'Полярная',
    satName: 'Полярный',
    body: 'mars',
    hPeri: 400,
    hApo: 400,
    inclinationDeg: 90,
    ...zeroAngles,
    note: 'i = 90°: трасса проходит над обоими полюсами Марса.',
  },
  {
    id: 'moon-polar',
    label: 'Полярная',
    satName: 'Полярный',
    body: 'moon',
    hPeri: 100,
    hApo: 100,
    inclinationDeg: 90,
    ...zeroAngles,
    note: 'Низкая полярная орбита картографических аппаратов: Луна медленно поворачивается под ней, и за месяц спутник пролетает над всей поверхностью.',
  },
  {
    id: 'moon-equator',
    label: 'Экваториальная',
    satName: 'Экваториальный',
    body: 'moon',
    hPeri: 100,
    hApo: 100,
    inclinationDeg: 0,
    ...zeroAngles,
    note: 'i = 0°: трасса идёт точно по лунному экватору.',
  },
  {
    id: 'moon-elliptic',
    label: 'Вытянутая',
    satName: 'Вытянутый',
    body: 'moon',
    hPeri: 100,
    hApo: 5000,
    inclinationDeg: 90,
    raanDeg: 0,
    argPerigeeDeg: 270,
    meanAnomalyDeg: 0,
    note: 'Перицентр 100 км над южным полушарием, апоцентр 5000 км над северным: у перицентра спутник проносится быстро, у апоцентра — медленно.',
  },
];

export const templatesFor = (body: BodyId) => ORBIT_TEMPLATES.filter((t) => t.body === body);
