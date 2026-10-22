import { describe, expect, it } from 'vitest';
import { DEG, MU } from '../constants';
import { cross, dot, norm } from '../math';
import { argumentOfLatitude, inertialPosition, inertialVelocity, velocityComponents } from '../orbit';
import { geoToGreenwich, greenwichToGeo, greenwichToInertial, inertialToGreenwich } from '../frames';

describe('Положение и скорость в АГЭСК — формулы (8)–(10)', () => {
  // Контрольный пример: Vallado D. A. Fundamentals of Astrodynamics and Applications, Example 2-6 (COE2RV).
  const p = 11067.79;
  const e = 0.83285;
  const i = 87.87 * DEG;
  const raan = 227.89 * DEG;
  const omega = 53.38 * DEG;
  const theta = 92.335 * DEG;

  const r = p / (1 + e * Math.cos(theta));
  const u = argumentOfLatitude(omega, theta);
  const pos = inertialPosition(r, u, raan, i);
  const { Vr, Vn, V } = velocityComponents(p, e, theta);
  const vel = inertialVelocity(Vr, Vn, u, raan, i);

  it('радиус-вектор совпадает с эталоном Vallado: (6525,368; 6861,532; 6449,119) км', () => {
    expect(pos.x).toBeCloseTo(6525.368, 2);
    expect(pos.y).toBeCloseTo(6861.532, 2);
    expect(pos.z).toBeCloseTo(6449.119, 2);
  });

  it('скорость совпадает с эталоном Vallado: (4,902279; 5,533140; −1,975710) км/с', () => {
    expect(vel.x).toBeCloseTo(4.902279, 5);
    expect(vel.y).toBeCloseTo(5.53314, 5);
    expect(vel.z).toBeCloseTo(-1.97571, 5);
  });

  it('модуль скорости из составляющих равен модулю вектора', () => {
    expect(norm(vel)).toBeCloseTo(V, 10);
  });

  it('интеграл энергии (Вис-вива): V² = μ(2/r − 1/a)', () => {
    const a = p / (1 - e * e);
    expect(V * V).toBeCloseTo(MU * (2 / r - 1 / a), 8);
  });

  it('интеграл площадей: |r × V| = √(μp)', () => {
    expect(norm(cross(pos, vel))).toBeCloseTo(Math.sqrt(MU * p), 6);
  });

  it('вектор площадей направлен по нормали к плоскости орбиты (задаётся Ω и i)', () => {
    const c = cross(pos, vel);
    const cn = norm(c);
    const nExpected = { x: Math.sin(raan) * Math.sin(i), y: -Math.cos(raan) * Math.sin(i), z: Math.cos(i) };
    expect(dot(c, nExpected) / cn).toBeCloseTo(1, 12);
  });

  it('z = r·sin u·sin i и широта не превышает наклонение', () => {
    expect(pos.z).toBeCloseTo(r * Math.sin(u) * Math.sin(i), 9);
    for (let k = 0; k < 360; k++) {
      const q = inertialPosition(7000, k * DEG, 1.1, 51.6 * DEG);
      expect(Math.abs(Math.asin(q.z / 7000))).toBeLessThanOrEqual(51.6 * DEG + 1e-12);
    }
  });

  it('восходящий узел (u = 0) лежит в плоскости экватора на долготе Ω', () => {
    const q = inertialPosition(7000, 0, 40 * DEG, 51.6 * DEG);
    expect(q.z).toBeCloseTo(0, 12);
    expect(Math.atan2(q.y, q.x)).toBeCloseTo(40 * DEG, 12);
  });
});

describe('Переход АГЭСК → ГСК и географические координаты — формулы (12)–(14)', () => {
  it('поворот на S сохраняет длину и обратим', () => {
    const v = { x: 1234, y: -5678, z: 4321 };
    const S = 2.345;
    const g = inertialToGreenwich(v, S);
    expect(norm(g)).toBeCloseTo(norm(v), 9);
    const back = greenwichToInertial(g, S);
    expect(back.x).toBeCloseTo(v.x, 9);
    expect(back.y).toBeCloseTo(v.y, 9);
    expect(back.z).toBeCloseTo(v.z, 9);
  });

  it('точка в направлении ♈ при S = 90° имеет долготу −90° (Земля повернулась на восток)', () => {
    const g = inertialToGreenwich({ x: 7000, y: 0, z: 0 }, 90 * DEG);
    expect(greenwichToGeo(g).lon / DEG).toBeCloseTo(-90, 9);
  });

  it('φ, λ, h ↔ x_г, y_г, z_г — взаимно обратные преобразования', () => {
    const lat = 55.7558 * DEG;
    const lon = 37.6173 * DEG;
    const geo = greenwichToGeo(geoToGreenwich(lat, lon, 420));
    expect(geo.lat).toBeCloseTo(lat, 12);
    expect(geo.lon).toBeCloseTo(lon, 12);
    expect(geo.h).toBeCloseTo(420, 9);
  });
});
