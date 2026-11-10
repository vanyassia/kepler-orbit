/**
 * Проверки аудита (docs/audit.md): единицы, знаки и четверти углов, крайние случаи уравнения Кеплера,
 * независимость от часового пояса компьютера и совпадение подспутниковой точки на карте (шаги листка)
 * с положением спутника на глобусе (координаты x, y, z и поворот тела).
 *
 * Сами примеры с ответами из docs/formulas.md проверяются рядом: sheet.test.ts (листок, МКС),
 * kepler.test.ts, orbit.test.ts, time-sun.test.ts, propagate.test.ts, bodies.test.ts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { exportFileName, fmtTableTime, fromInputValue, toInputValue } from '../../data/exportData';
import { ommToElements, type OmmRecord } from '../../data/omm';
import { parseTle, tleEpochToMs } from '../../data/tle';
import { fmtDateTime } from '../../ui/format';
import { BODIES } from '../bodies';
import { DEG, JD_UNIX_EPOCH, MU, OMEGA_EARTH, OMEGA_EARTH_DEG_PER_MIN, RAD, R_EARTH, SIDEREAL_DAY_MIN, TWO_PI } from '../constants';
import { greenwichToGeo } from '../frames';
import { groundTrack, splitAtAntimeridian } from '../groundTrack';
import { meanMotionFromRevPerDay, periodFromRevPerDay, semiMajorAxis, solveKepler, trueAnomalyFromEccentric } from '../kepler';
import { wrap180 } from '../math';
import { centralAngle } from '../passes';
import type { OrbitalElements } from '../propagate';
import { prepareOrbit, propagate } from '../propagate';
import { equatorPath, latitudeFromArgument } from '../subpoint';
import { greenwichSiderealTime, julianDate, julianDateFromTleEpoch, julianDateJan1, parseEpochUtc } from '../time';

const dataDir = join(import.meta.dirname, '..', '..', '..', 'public', 'data');
const gp = (JSON.parse(readFileSync(join(dataDir, 'fallback-gp.json'), 'utf8')) as { items: OmmRecord[] }).items;
interface HorizonsItem {
  naifId: number;
  body: 'earth' | 'moon' | 'mars';
  epoch: string;
  eccentricity: number;
  inclinationDeg: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  meanMotionDegPerSec: number;
}
const horizons = (JSON.parse(readFileSync(join(dataDir, 'orbiters.json'), 'utf8')) as { items: HorizonsItem[] }).items;
const fromHorizons = (it: HorizonsItem): OrbitalElements => ({
  name: `NAIF ${it.naifId}`,
  noradId: it.naifId,
  body: it.body,
  epochMs: Date.parse(it.epoch),
  meanMotion: (it.meanMotionDegPerSec * 86400) / 360,
  eccentricity: it.eccentricity,
  inclinationDeg: it.inclinationDeg,
  raanDeg: it.raanDeg,
  argPerigeeDeg: it.argPerigeeDeg,
  meanAnomalyDeg: it.meanAnomalyDeg,
});

/** МКС из листка «Трасса спутника». */
const SHEET_JD = julianDateFromTleEpoch(2026, 299.20906838);
const ISS: OrbitalElements = {
  name: 'ISS (ZARYA)',
  noradId: 25544,
  epochMs: (SHEET_JD - JD_UNIX_EPOCH) * 86_400_000,
  meanMotion: 15.49059765,
  eccentricity: 0.000692,
  inclinationDeg: 51.6337,
  raanDeg: 11.7282,
  argPerigeeDeg: 310.9581,
  meanAnomalyDeg: 49.0809,
};

describe('Единицы: об/сут, рад/с, °/мин, км, секунды', () => {
  it('N = 1 об/сут → n = 2π/86400 рад/с = 0,25 °/мин, T = 86 400 с', () => {
    expect(meanMotionFromRevPerDay(1)).toBeCloseTo(TWO_PI / 86400, 18);
    expect(meanMotionFromRevPerDay(1) * RAD * 60).toBeCloseTo(0.25, 12);
    expect(periodFromRevPerDay(1)).toBe(86400);
  });

  it('a в километрах: N = 15,49059765 об/сут и μ = 398 602 км³/с² дают 6797,62 км, а не метры', () => {
    const a = semiMajorAxis(meanMotionFromRevPerDay(15.49059765), MU);
    expect(a).toBeCloseTo(6797.62, 1);
    expect(a - R_EARTH).toBeGreaterThan(400);
    expect(a - R_EARTH).toBeLessThan(450);
  });

  it('ω_З: 360° за 1436,0667 мин — одно и то же число в °/мин и в рад/с', () => {
    expect(OMEGA_EARTH_DEG_PER_MIN * SIDEREAL_DAY_MIN).toBeCloseTo(360, 10);
    expect(OMEGA_EARTH * RAD * 60).toBeCloseTo(OMEGA_EARTH_DEG_PER_MIN, 14);
    // поворот Земли за 30 минут — 7,5205°, как в листке
    expect(BODIES.earth.turn(0, 30 * 60_000) * RAD).toBeCloseTo(7.5205, 4);
  });

  it('время после эпохи: миллисекунды → секунды → минуты листка', () => {
    const s = propagate(prepareOrbit(ISS), ISS.epochMs + 30 * 60_000);
    expect(s.dt).toBeCloseTo(1800, 6);
    // M = M₀ + n·t: 49,0809° + 3,87265 °/мин · 30 мин = 165,2604°
    expect(s.M * RAD).toBeCloseTo(49.0809 + 3.87265 * 30, 3);
  });

  it('спутники Луны и Марса: °/с из JPL Horizons переведены в об/сут', () => {
    const lro = horizons.find((x) => x.naifId === -85)!;
    const o = prepareOrbit(fromHorizons(lro));
    expect(o.n * RAD).toBeCloseTo(lro.meanMotionDegPerSec, 12); // обратно в °/с
    expect(o.T / 3600).toBeGreaterThan(1.8); // виток LRO — около двух часов
    expect(o.T / 3600).toBeLessThan(2.2);
  });
});

describe('Знаки и четверти углов', () => {
  it('истинная аномалия — в той же половине витка, что и E, и растёт вместе с ней', () => {
    for (const e of [0, 0.1, 0.7, 0.95]) {
      let prev = -1;
      for (let k = 0; k < 720; k++) {
        const E = (k / 720) * TWO_PI;
        const nu = trueAnomalyFromEccentric(E, e);
        expect(nu).toBeGreaterThanOrEqual(0);
        expect(nu).toBeLessThan(TWO_PI);
        expect(nu > Math.PI).toBe(E > Math.PI);
        expect(nu).toBeGreaterThan(prev);
        prev = nu;
      }
    }
  });

  it('путь по экватору ab: у прямой орбиты — в той же четверти, что и u', () => {
    const i = 51.6 * DEG;
    for (let deg = 1; deg < 360; deg += 7) {
      const ab = (equatorPath(deg * DEG, i) * RAD + 360) % 360;
      expect(Math.floor(ab / 90)).toBe(Math.floor(deg / 90));
    }
  });

  it('путь по экватору ab: у обратной орбиты (i > 90°) спутник идёт к западу', () => {
    const i = 98 * DEG;
    expect(equatorPath(10 * DEG, i)).toBeLessThan(0);
    expect(equatorPath(170 * DEG, i) * RAD).toBeLessThan(-90);
    // зеркально прямой орбите с наклонением 180° − i
    for (let deg = 0; deg < 360; deg += 13) {
      expect(equatorPath(deg * DEG, i)).toBeCloseTo(-equatorPath(deg * DEG, Math.PI - i), 12);
    }
  });

  it('широта: к северу на восходящей половине витка (0 < u < 180°), к югу — на нисходящей', () => {
    for (const i of [30 * DEG, 98 * DEG]) {
      expect(latitudeFromArgument(60 * DEG, i)).toBeGreaterThan(0);
      expect(latitudeFromArgument(240 * DEG, i)).toBeLessThan(0);
    }
  });

  it('восточная долгота положительна: узел на 30° восточнее Гринвича даёт λ = +30°', () => {
    const t0 = Date.UTC(2026, 10, 10, 12);
    const S0 = greenwichSiderealTime(t0) * RAD;
    const el: OrbitalElements = { name: 't', noradId: 1, epochMs: t0, meanMotion: 15, eccentricity: 0, inclinationDeg: 50, raanDeg: S0 + 30, argPerigeeDeg: 0, meanAnomalyDeg: 0 };
    const s = propagate(prepareOrbit(el), t0);
    expect(s.lat * RAD).toBeCloseTo(0, 9);
    expect(s.lon * RAD).toBeCloseTo(30, 9);
    // через минуту прямая орбита уходит на северо-восток
    const next = propagate(prepareOrbit(el), t0 + 60_000);
    expect(next.lat).toBeGreaterThan(0);
    expect(next.lon).toBeGreaterThan(s.lon);
  });

  it('Земля вращается к востоку: неподвижная в пространстве точка уходит по долготе к западу', () => {
    const t0 = Date.UTC(2026, 10, 10);
    const star = { x: 1, y: 0, z: 0 }; // направление на точку весны
    const lon0 = greenwichToGeo(BODIES.earth.toFixed(star, t0)).lon * RAD;
    const lon1 = greenwichToGeo(BODIES.earth.toFixed(star, t0 + 3_600_000)).lon * RAD;
    expect(wrap180(lon1 - lon0)).toBeCloseTo(-15.041, 2); // 360,9856°/сут · 1 ч
  });
});

describe('Уравнение Кеплера: крайние случаи', () => {
  const tricky = [0, 1e-15, 1e-12, 1e-9, 1e-6, 1e-3, Math.PI - 1e-9, Math.PI, Math.PI + 1e-9, TWO_PI - 1e-3, TWO_PI - 1e-9, TWO_PI - 1e-12];

  it.each([0, 1e-12, 1e-9, 0.7999999, 0.8, 0.9, 0.9874, 0.9965, 0.999999])('e = %f: сходится на всей сетке M и у 0, π, 2π', (e) => {
    const Ms = [...tricky];
    for (let k = 0; k <= 5000; k++) Ms.push((k / 5000) * TWO_PI);
    for (const M of Ms) {
      const { E, iterations } = solveKepler(M, e);
      expect(Number.isFinite(E)).toBe(true);
      expect(E).toBeGreaterThanOrEqual(0);
      expect(E).toBeLessThanOrEqual(TWO_PI);
      expect(iterations).toBeLessThan(30); // предел метода — 50 итераций; сюда он не доходит
      expect(Math.abs(Math.sin((E - e * Math.sin(E) - M) / 2))).toBeLessThan(1e-12);
    }
  });

  it('почти круговая орбита (e ≈ 0): E = M с точностью до e', () => {
    for (const M of [0.3, 2, 4, 6]) expect(solveKepler(M, 1e-9).E).toBeCloseTo(M, 8);
  });

  it('самая вытянутая орбита, которую можно задать на сайте (1 км × 1 000 000 км у Луны, e ≈ 0,9965)', () => {
    const R = BODIES.moon.radius;
    const e = (1_000_000 - 1) / (2 * R + 1_000_001);
    expect(e).toBeCloseTo(0.9965, 3);
    const el: OrbitalElements = { name: 't', noradId: 1, body: 'moon', epochMs: 0, meanMotion: 0.02, eccentricity: e, inclinationDeg: 30, raanDeg: 0, argPerigeeDeg: 0, meanAnomalyDeg: 0 };
    const o = prepareOrbit(el);
    for (let k = -200; k <= 200; k++) {
      const s = propagate(o, k * 7_919_000);
      expect(s.h).toBeGreaterThan(o.hPerigee - 1e-6);
      expect(s.h).toBeLessThan(o.hApogee + 1e-6);
      expect(Number.isFinite(s.lat) && Number.isFinite(s.lon)).toBe(true);
    }
  });

  it('отрицательный и неправильный эксцентриситет отвергается', () => {
    expect(() => solveKepler(1, -0.1)).toThrow(RangeError);
    expect(() => solveKepler(1, 1.5)).toThrow(RangeError);
  });
});

describe('Время: только UTC', () => {
  it('юлианская дата 1 января: 2000, 2024 (високосный), 2026', () => {
    expect(julianDateJan1(2000)).toBe(2451544.5);
    expect(julianDateJan1(2024)).toBe(2460310.5);
    expect(julianDateJan1(2025)).toBe(2460676.5); // 366 суток спустя
    expect(julianDateJan1(2026)).toBe(2461041.5);
  });

  it('эпоха листка 26299,20906838: по году и дню и по миллисекундам — один и тот же JD', () => {
    const ms = tleEpochToMs(26, 299.20906838);
    expect(julianDate(ms)).toBeCloseTo(SHEET_JD, 8);
    expect(new Date(ms).toISOString().slice(0, 19)).toBe('2026-10-26T05:01:03');
  });

  it('эпоха TLE: 31 декабря високосного года — день 366; годы 57–99 — XX век', () => {
    expect(new Date(tleEpochToMs(24, 366)).toISOString()).toBe('2024-12-31T00:00:00.000Z');
    expect(new Date(tleEpochToMs(57, 277.5)).toISOString()).toBe('1957-10-04T12:00:00.000Z');
    expect(new Date(tleEpochToMs(56, 1)).toISOString()).toBe('2056-01-01T00:00:00.000Z');
  });

  it('эпоха CelesTrak без «Z» читается как UTC, микросекунды не теряются', () => {
    expect(parseEpochUtc('2026-10-26T05:01:03.508032')).toBeCloseTo(Date.UTC(2026, 9, 26, 5, 1, 3) + 508.032, 6);
    expect(parseEpochUtc('2026-10-26T05:01:03')).toBe(Date.UTC(2026, 9, 26, 5, 1, 3));
    expect(parseEpochUtc('2026-10-26 05:01:03Z')).toBe(Date.UTC(2026, 9, 26, 5, 1, 3));
    expect(() => parseEpochUtc('26.10.2026 05:01')).toThrow();
  });

  describe('часовой пояс компьютера на расчёт не влияет', () => {
    const original = process.env.TZ;
    afterAll(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    const tle = readFileSync(join(import.meta.dirname, '..', '..', 'data', '__tests__', 'fixtures', 'iss.tle'), 'utf8');
    const iss = gp.find((r) => Number(r.NORAD_CAT_ID) === 25544)!;

    /** Всё, что зависит от времени: разбор эпох, юлианская дата, звёздное время, точка под спутником, подписи. */
    const snapshot = () => {
      const t = Date.UTC(2026, 10, 10, 23, 30, 5); // в Варшаве и на Камчатке это уже 11 ноября
      const s = propagate(prepareOrbit(ommToElements(iss)), t);
      return {
        offset: new Date(t).getTimezoneOffset(),
        values: [
          parseEpochUtc(String(iss.EPOCH)),
          tleEpochToMs(26, 299.20906838),
          parseTle(tle).epochMs,
          julianDate(t),
          greenwichSiderealTime(t),
          s.lat,
          s.lon,
          s.h,
          fromInputValue('2026-11-10T23:30:05'),
          toInputValue(t),
          fmtTableTime(t),
          exportFileName('МКС', 'трасса', t, 'csv'),
          fmtDateTime(t),
          fmtDateTime(t, 'MSK'),
        ],
      };
    };

    it('Варшава, Гонолулу и остров Рождества (UTC+14) дают те же числа, что и UTC', () => {
      process.env.TZ = 'UTC';
      const utc = snapshot();
      expect(utc.values[2]).toBeCloseTo(Date.UTC(2026, 9, 21, 1, 8, 59) + 470, -1); // эпоха TLE из примера: 21.10.2026 01:08:59 UTC
      expect(utc.values[8]).toBe(Date.UTC(2026, 10, 10, 23, 30, 5));
      expect(utc.values[9]).toBe('2026-11-10T23:30:05');
      expect(utc.values[12]).toBe('10.11.2026 23:30:05');
      expect(utc.values[13]).toBe('11.11.2026 02:30:05');
      const offsets = new Set([utc.offset]);
      for (const zone of ['Europe/Warsaw', 'Pacific/Honolulu', 'Pacific/Kiritimati']) {
        process.env.TZ = zone;
        const local = snapshot();
        offsets.add(local.offset);
        expect(local.values, zone).toEqual(utc.values);
      }
      // Проверка не пустая: пояс в тесте действительно переключался
      expect(offsets.size).toBeGreaterThan(1);
    });
  });
});

describe('Карта и глобус показывают одну и ту же точку', () => {
  /** Точка под спутником по цепочке глобуса: x, y, z (формула (9)) → поворот тела → широта и долгота. */
  const globePoint = (el: OrbitalElements, t: number) => {
    const o = prepareOrbit(el);
    const s = propagate(o, t);
    const g = greenwichToGeo(o.body.toFixed(s.eci, t), o.body.radius);
    return { dLat: (g.lat - s.lat) * RAD, dLon: wrap180((g.lon - s.lon) * RAD), dH: g.h - s.h };
  };

  it('Земля, на эпоху: совпадение до 10⁻⁹° (все спутники снимка)', () => {
    for (const r of gp) {
      const el = ommToElements(r);
      const d = globePoint(el, el.epochMs);
      expect(Math.abs(d.dLat), el.name).toBeLessThan(1e-9);
      expect(Math.abs(d.dLon) * Math.cos(propagate(prepareOrbit(el), el.epochMs).lat), el.name).toBeLessThan(1e-9);
      expect(Math.abs(d.dH), el.name).toBeLessThan(1e-6);
    }
  });

  it('Земля, после эпохи: расхождение растёт на 0,00037° в сутки — две скорости вращения в листке', () => {
    // S(t) идёт со скоростью 360,98564737°/сут (шаг 4), а поворот ω_З·t — 360°/1436,0667 мин = 360,98602°/сут (шаг 5.7)
    const perDay = OMEGA_EARTH * RAD * 86400 - 360.98564737;
    expect(perDay).toBeCloseTo(0.000371, 6);
    for (const days of [0.5, 1, 3, 10]) {
      const d = globePoint(ISS, ISS.epochMs + days * 86_400_000);
      expect(Math.abs(d.dLat)).toBeLessThan(1e-9);
      expect(d.dLon).toBeCloseTo(perDay * days, 6);
    }
    // за трое суток (старше элементы на сайте не бывают, пока обновляется снимок) — около 120 м по экватору
    expect(perDay * 3 * DEG * R_EARTH).toBeLessThan(0.13);
  });

  it('Луна: совпадение до 10⁻⁹° и через месяц после эпохи', () => {
    for (const it of horizons.filter((x) => x.body === 'moon')) {
      const el = fromHorizons(it);
      for (const days of [0, 1, 30]) {
        const d = globePoint(el, el.epochMs + days * 86_400_000);
        expect(Math.abs(d.dLat), el.name).toBeLessThan(1e-9);
        expect(Math.abs(d.dLon) * Math.cos(propagate(prepareOrbit(el), el.epochMs + days * 86_400_000).lat), el.name).toBeLessThan(1e-9);
      }
    }
  });

  it('Марс: совпадение лучше 0,0001° в течение месяца (полюс Марса медленно смещается)', () => {
    for (const it of horizons.filter((x) => x.body === 'mars')) {
      const el = fromHorizons(it);
      for (const days of [0, 1, 30]) {
        const d = globePoint(el, el.epochMs + days * 86_400_000);
        expect(Math.abs(d.dLat), el.name).toBeLessThan(1e-4);
        expect(Math.abs(d.dLon) * Math.cos(propagate(prepareOrbit(el), el.epochMs + days * 86_400_000).lat), el.name).toBeLessThan(1e-4);
      }
    }
  });
});

describe('Вращение тел: направление и скорость', () => {
  const t0 = Date.UTC(2026, 10, 10);
  /** Прямое восхождение нулевого меридиана тела в его инерциальной системе, °. */
  const meridian = (id: 'earth' | 'moon' | 'mars', t: number) => {
    const v = BODIES[id].toInertial({ x: 1, y: 0, z: 0 }, t);
    return Math.atan2(v.y, v.x) * RAD;
  };

  it.each([
    ['earth', 360.98564737],
    ['moon', 13.17635815],
    ['mars', 350.89198226],
  ] as const)('%s: нулевой меридиан уходит к востоку на %f° в сутки', (id, rate) => {
    const hour = wrap180(meridian(id, t0 + 3_600_000) - meridian(id, t0));
    expect(hour).toBeGreaterThan(0);
    expect(hour).toBeCloseTo(rate / 24, id === 'moon' ? 1 : 2); // у Луны — либрация по долготе
  });

  it('ось вращения — ось z: северный полюс тела не движется', () => {
    for (const id of ['earth', 'moon'] as const) {
      const p = BODIES[id].toInertial({ x: 0, y: 0, z: 1 }, t0);
      expect(p.x).toBeCloseTo(0, 12);
      expect(p.y).toBeCloseTo(0, 12);
      expect(p.z).toBeCloseTo(1, 12);
    }
    // у Марса ось вращения (IAU 2009) наклонена к оси системы элементов (IAU 2015) на 1,57°
    const m = BODIES.mars.toInertial({ x: 0, y: 0, z: 1 }, t0);
    expect(Math.acos(m.z) * RAD).toBeCloseTo(1.566, 2);
  });

  it('нулевой меридиан Земли на эпоху листка: S = 109,8545°', () => {
    expect(((meridian('earth', ISS.epochMs) % 360) + 360) % 360).toBeCloseTo(109.8545, 3);
  });
});

describe('Трасса на карте: без линий через всю карту', () => {
  const samples: OrbitalElements[] = [...gp.map(ommToElements), ...horizons.map(fromHorizons)];

  it('все спутники сайта: внутри участка соседние точки рядом, участки рвутся только на ±180°', () => {
    for (const el of samples) {
      const o = prepareOrbit(el);
      const span = Math.min(3 * o.T, 3 * 86400) * 1000;
      const segs = splitAtAntimeridian(groundTrack(o, el.epochMs, el.epochMs + span));
      for (const seg of segs) {
        for (let k = 1; k < seg.length; k++) {
          const a = seg[k - 1];
          const b = seg[k];
          expect(Math.abs(b.lon - a.lon), el.name).toBeLessThanOrEqual(180);
          expect(Math.abs(a.lat), el.name).toBeLessThanOrEqual(90);
          // дуга между соседними точками — не больше 15° (шаг трассы не длиннее 2 минут)
          expect(centralAngle(a.lat * DEG, a.lon * DEG, b.lat * DEG, b.lon * DEG) * RAD, el.name).toBeLessThan(15);
        }
      }
      for (let k = 0; k < segs.length - 1; k++) {
        const end = segs[k][segs[k].length - 1];
        const start = segs[k + 1][0];
        expect(Math.abs(end.lon), el.name).toBe(180);
        expect(start.lon, el.name).toBe(-end.lon);
        expect(start.lat, el.name).toBe(end.lat);
      }
    }
  });

  it('полярная орбита (i = 90°): трасса доходит до полюсов, долгота у полюса меняется на 180° без разрыва по карте', () => {
    const el: OrbitalElements = { name: 't', noradId: 1, epochMs: Date.UTC(2026, 10, 10), meanMotion: 14.5, eccentricity: 0.001, inclinationDeg: 90, raanDeg: 123, argPerigeeDeg: 40, meanAnomalyDeg: 10 };
    const o = prepareOrbit(el);
    const pts = groundTrack(o, el.epochMs, el.epochMs + 2 * o.T * 1000);
    expect(Math.max(...pts.map((p) => p.lat))).toBeGreaterThan(89.5);
    expect(Math.min(...pts.map((p) => p.lat))).toBeLessThan(-89.5);
    for (const seg of splitAtAntimeridian(pts)) {
      for (let k = 1; k < seg.length; k++) {
        const jump = Math.abs(seg[k].lon - seg[k - 1].lon);
        expect(jump).toBeLessThanOrEqual(180);
        // большой скачок долготы бывает только у самого полюса — там это верхний или нижний край карты
        if (jump > 30) expect(Math.max(Math.abs(seg[k].lat), Math.abs(seg[k - 1].lat))).toBeGreaterThan(88);
      }
    }
  });

  it('обратная орбита (i = 180°) и экваториальная (i = 0°): широта ноль, разрывы только на ±180°', () => {
    for (const inc of [0, 180]) {
      const el: OrbitalElements = { name: 't', noradId: 1, epochMs: Date.UTC(2026, 10, 10), meanMotion: 14.5, eccentricity: 0.001, inclinationDeg: inc, raanDeg: 123, argPerigeeDeg: 40, meanAnomalyDeg: 10 };
      const o = prepareOrbit(el);
      const segs = splitAtAntimeridian(groundTrack(o, el.epochMs, el.epochMs + 2 * o.T * 1000));
      expect(segs.length).toBeGreaterThanOrEqual(2);
      for (const seg of segs) {
        for (let k = 1; k < seg.length; k++) {
          expect(Math.abs(seg[k].lat)).toBeLessThan(1e-9);
          expect(Math.abs(seg[k].lon - seg[k - 1].lon)).toBeLessThan(2);
        }
      }
    }
  });
});
