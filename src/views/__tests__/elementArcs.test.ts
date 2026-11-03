import { describe, expect, it } from 'vitest';
import { DEG } from '../../physics/constants';
import { inertialPosition } from '../../physics/orbit';
import { equatorArc, inclinationArc, inOrbitPlane, nodeTangents, orbitArc } from '../globe3d/elementArcs';

const o = { raan: 123.4 * DEG, i: 51.6 * DEG };
const close = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

describe('схема элементов орбиты', () => {
  it('точка плоскости орбиты совпадает с формулой (9)', () => {
    for (const u of [0, 0.7, 2.1, 4.5]) close(inOrbitPlane(o, u, 7000), inertialPosition(7000, u, o.raan, o.i));
  });

  it('дуга Ω идёт по экватору от оси x до восходящего узла', () => {
    const arc = equatorArc(o.raan, 1.3);
    close(arc[0], { x: 1.3, y: 0, z: 0 });
    close(arc[arc.length - 1], inOrbitPlane(o, 0, 1.3));
    for (const p of arc) expect(p.z).toBe(0);
  });

  it('дуги ω и ν лежат в плоскости орбиты и идут по ходу движения', () => {
    const omega = 270 * DEG;
    const arc = orbitArc(o, 0, omega, 2);
    close(arc[0], inOrbitPlane(o, 0, 2));
    close(arc[arc.length - 1], inOrbitPlane(o, omega, 2));
    // Нормаль к плоскости орбиты (sin Ω sin i, −cos Ω sin i, cos i) перпендикулярна каждой точке
    const n = { x: Math.sin(o.raan) * Math.sin(o.i), y: -Math.cos(o.raan) * Math.sin(o.i), z: Math.cos(o.i) };
    for (const p of arc) expect(p.x * n.x + p.y * n.y + p.z * n.z).toBeCloseTo(0, 9);
    // Отрицательный угол тоже рисуется по ходу движения: −90° — это дуга в 270°
    expect(orbitArc(o, 0, -90 * DEG, 2).length).toBe(arc.length);
  });

  it('дуга i — от касательной к экватору до касательной к орбите, угол между ними равен i', () => {
    const node = inOrbitPlane(o, 0, 1.1);
    const a = 0.3;
    const arc = inclinationArc(o, node, a);
    const { E, T } = nodeTangents(o);
    const dir = (p: { x: number; y: number; z: number }) => ({ x: (p.x - node.x) / a, y: (p.y - node.y) / a, z: (p.z - node.z) / a });
    close(dir(arc[0]), E);
    close(dir(arc[arc.length - 1]), T);
    expect(Math.acos(E.x * T.x + E.y * T.y + E.z * T.z)).toBeCloseTo(o.i, 12);
  });
});
