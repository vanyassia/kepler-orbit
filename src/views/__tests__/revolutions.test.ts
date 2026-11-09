import { describe, expect, it } from 'vitest';
import { prepareOrbit } from '../../physics/propagate';
import { nodesInWindow, Revolutions, revolutionColor, revolutionsAhead, trackSpan } from '../trackCache';

const ISS = prepareOrbit({
  name: 'ISS',
  noradId: 25544,
  epochMs: Date.UTC(2026, 9, 21, 1, 8, 59),
  meanMotion: 15.48967427,
  eccentricity: 0.00067597,
  inclinationDeg: 51.6327,
  raanDeg: 37.2623,
  argPerigeeDeg: 289.5321,
  meanAnomalyDeg: 70.4938,
});

describe('Нумерация витков относительно текущего', () => {
  const t = ISS.epochMs + 5 * 3_600_000;
  const revs = new Revolutions(ISS, t, 1, 3);
  const Tms = ISS.T * 1000;

  it('текущий момент — виток 0, через период — +1, период назад — −1', () => {
    expect(revs.offsetAt(t)).toBe(0);
    expect(revs.offsetAt(t + Tms)).toBe(1);
    expect(revs.offsetAt(t + 3 * Tms)).toBe(3);
    expect(revs.offsetAt(t - Tms)).toBe(-1);
  });

  it('граница витка — восходящий узел', () => {
    const next = revs.nodes.find((n) => n > t)!;
    expect(revs.offsetAt(next - 1)).toBe(0);
    expect(revs.offsetAt(next)).toBe(1);
  });

  it('цвета: у текущего и трёх следующих свои, дальше — общий, прошедшие — один приглушённый', () => {
    const c = [0, 1, 2, 3].map(revolutionColor);
    expect(new Set(c).size).toBe(4);
    expect(revolutionColor(4)).toBe(revolutionColor(7));
    expect(revolutionColor(-1)).toBe(revolutionColor(-3));
  });
});

/** Луна вокруг Земли, JPL Horizons: виток ≈ 27,6 сут, окно трассы — пара суток. */
const MOON = prepareOrbit({
  name: 'Moon',
  noradId: 301,
  epochMs: Date.parse('2026-11-09T10:58:50.815Z'),
  meanMotion: (0.0001509413537743414 * 86400) / 360,
  eccentricity: 0.04384260737555326,
  inclinationDeg: 27.71649257851659,
  raanDeg: 354.0158341704791,
  argPerigeeDeg: 102.7390024942568,
  meanAnomalyDeg: 127.7762203448116,
});

describe('Начала витков на показанной трассе', () => {
  it('у обычной орбиты впереди ровно столько начал витков, сколько выбрано', () => {
    for (let h = 0; h < 6; h += 0.37) expect(revolutionsAhead(ISS, ISS.epochMs + h * 3_600_000, 3)).toBe(3);
  });

  it('у Луны «+1» есть, только когда узел попал в окно трассы', () => {
    const forward = trackSpan(MOON, 0, 2).forward;
    const Tms = MOON.T * 1000;
    const node = new Revolutions(MOON, MOON.epochMs + Tms, 0, 0).nodes.find((n) => n > MOON.epochMs)!;
    const windowMs = forward * Tms;
    expect(revolutionsAhead(MOON, node - windowMs / 2, forward)).toBe(1); // узел в середине окна
    expect(revolutionsAhead(MOON, node + 3_600_000, forward)).toBe(0); // узел только что прошёл
    expect(revolutionsAhead(MOON, node - windowMs - 3_600_000, forward)).toBe(0); // узел ещё за окном
  });

  it('в окно попадают и прошедшие начала витков (0, −1), и будущие (+1…)', () => {
    const t = ISS.epochMs + 5 * 3_600_000;
    const revs = new Revolutions(ISS, t, 1, 3);
    const offsets = nodesInWindow(revs, t, 1, 3, ISS.T).map((n) => n.offset);
    expect(offsets).toEqual([0, 1, 2, 3]); // за один виток назад — ровно одно начало: текущего витка
    const wide = new Revolutions(ISS, t, 2, 1);
    expect(nodesInWindow(wide, t, 2, 1, ISS.T).map((n) => n.offset)).toEqual([-1, 0, 1]);
  });
});
