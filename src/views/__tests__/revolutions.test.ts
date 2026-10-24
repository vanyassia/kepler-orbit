import { describe, expect, it } from 'vitest';
import { prepareOrbit } from '../../physics/propagate';
import { Revolutions, revolutionColor } from '../trackCache';

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
