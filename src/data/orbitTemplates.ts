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
  /** Повторяющаяся трасса: n витков ровно за m звёздных суток тела. */
  repeat?: RepeatCycle;
}

/** Цикл повторяющейся трассы: n витков за m звёздных суток тела. */
export interface RepeatCycle {
  n: number;
  m: number;
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

/* ── Повторяющаяся трасса («цветок») ──────────────────────────────────────────────────────────────
 * В задаче двух тел плоскость орбиты в пространстве неподвижна, а тело под ней поворачивается
 * за звёздные сутки T_сут. Если за n витков проходит ровно m звёздных суток (n·T = m·T_сут),
 * спутник возвращается в ту же точку над поверхностью — трасса замыкается в узор.
 * Отсюда период T = m·T_сут / n, а высота круговой орбиты — по третьему закону Кеплера.
 */

/** Пределы полей n и m в окне: больше витков — узор превращается в сплошную сетку. */
export const REPEAT_N_MAX = 60;
export const REPEAT_M_MAX = 20;

/** Узор, который открывается по умолчанию: немного «лепестков», чтобы цветок читался сразу. */
export const REPEAT_DEFAULTS: Record<BodyId, RepeatCycle & { inclinationDeg: number }> = {
  earth: { n: 5, m: 1, inclinationDeg: 60 },
  moon: { n: 7, m: 1, inclinationDeg: 60 },
  mars: { n: 5, m: 1, inclinationDeg: 60 },
};

/** Период повторяющейся орбиты, с: T = m·T_сут / n. */
export const repeatPeriod = (body: BodyId, c: RepeatCycle) => (c.m * ROTATION_PERIOD[body]) / c.n;

/** Высота круговой орбиты, на которой трасса замыкается за n витков и m суток (0,1 км). */
export const repeatHeight = (body: BodyId, c: RepeatCycle) => circularHeight(body, repeatPeriod(body, c));

/** Наибольший общий делитель: 10 витков за 2 суток — тот же узор, что 5 витков за 1 сутки. */
export function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Проверка n и m: целые, в пределах, и орбита выходит над поверхностью и не дальше 1 млн км. */
export function repeatError(body: BodyId, c: RepeatCycle): string | null {
  const whole = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
  if (!whole(c.n, REPEAT_N_MAX)) return `Число витков — целое, от 1 до ${REPEAT_N_MAX}`;
  if (!whole(c.m, REPEAT_M_MAX)) return `Число суток — целое, от 1 до ${REPEAT_M_MAX}`;
  const h = repeatHeight(body, c);
  if (h < 1) return 'Слишком много витков за эти сутки: орбита ушла бы под поверхность';
  if (h > 1_000_000) return 'Слишком мало витков: орбита дальше 1 000 000 км';
  return null;
}

/** Название спутника по шаблону: «Цветок 5/1». */
export const repeatName = (c: RepeatCycle) => `Цветок ${c.n}/${c.m}`;

/** Название поставлено шаблоном (его можно заменить при выборе другого шаблона). */
export const isTemplateName = (name: string) => ORBIT_TEMPLATES.some((t) => t.satName === name) || /^Цветок \d+\/\d+$/.test(name);

/** Слово после числа: 1 виток, 2 витка, 5 витков. */
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  return `${n}\u00a0${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`;
}
const revs = (n: number) => plural(n, 'виток', 'витка', 'витков');
const days = (n: number) => plural(n, 'сутки', 'суток', 'суток');

/** Как называются сутки тела в пояснении. */
const DAY_NAME: Record<BodyId, string> = {
  earth: 'звёздные сутки Земли — 23 ч 56 мин',
  moon: 'звёздные сутки Луны — 27,3 земных суток',
  mars: 'звёздные сутки Марса — 24 ч 37 мин',
};

/** Шаблон «Повторяющаяся трасса» для выбранных n и m (поля окна пересчитываются при их смене). */
export function repeatTemplate(body: BodyId, c: RepeatCycle, inclinationDeg: number): OrbitTemplate {
  const h = repeatHeight(body, c);
  const g = gcd(c.n, c.m);
  const same = g > 1 ? ` Это тот же узор, что ${revs(c.n / g)} за ${days(c.m / g)}.` : '';
  return {
    id: 'repeat',
    label: 'Повторяющаяся трасса',
    satName: repeatName(c),
    body,
    hPeri: h,
    hApo: h,
    inclinationDeg,
    ...zeroAngles,
    repeat: c,
    note: `Ровно ${revs(c.n)} за ${days(c.m)} (${DAY_NAME[body]}): тело поворачивается под орбитой, и спутник возвращается в ту же точку — трасса замыкается в узор.${same} На карте и глобусе показан весь цикл.`,
  };
}
