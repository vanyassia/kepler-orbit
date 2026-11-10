/**
 * Координаты видов: карта (равнопромежуточная проекция) и глобус (оси сцены, наложение снимка на шар).
 * Проверяется, что точка с широтой φ и долготой λ попадает на одно и то же место снимка тела
 * и на карте, и на глобусе.
 */
import { SphereGeometry, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { geoToGreenwich } from '../../physics/frames';
import { geoToLocal, toScene } from '../globe3d/coords';
import { toScreen, toWorldLonLat, type View } from '../map2d/renderMap';

const view = (over: Partial<View> = {}): View => ({ s: 3, ox: 10, oy: 20, w: 1100, h: 580, dpr: 2, k: 1, ...over }) as View;

describe('Карта: равнопромежуточная проекция', () => {
  it('долгота −180° — левый край, +180° — правый; север сверху; градус широты равен градусу долготы', () => {
    const v = view();
    expect(toScreen(v, -180, 90)).toEqual([10, 20]);
    expect(toScreen(v, 180, -90)).toEqual([10 + 3 * 360, 20 + 3 * 180]);
    expect(toScreen(v, 0, 0)).toEqual([10 + 3 * 180, 20 + 3 * 90]);
    // восток — вправо, север — вверх
    expect(toScreen(v, 31, 0)[0]).toBeGreaterThan(toScreen(v, 30, 0)[0]);
    expect(toScreen(v, 0, 31)[1]).toBeLessThan(toScreen(v, 0, 30)[1]);
    expect(toScreen(v, 1, 0)[0] - toScreen(v, 0, 0)[0]).toBe(toScreen(v, 0, 0)[1] - toScreen(v, 0, 1)[1]);
  });

  it('экран → широта и долгота — обратное преобразование (щелчок по карте ставит точку там, где нажали)', () => {
    const v = view({ s: 7.25, ox: -412.5, oy: 33 });
    for (const [lon, lat] of [[37.617, 55.756], [-179.9, -89.9], [179.9, 89.9], [0, 0], [-98.0649, 0.08]]) {
      const [x, y] = toScreen(v, lon, lat);
      const [lon2, lat2] = toWorldLonLat(v, x, y);
      expect(lon2).toBeCloseTo(lon, 10);
      expect(lat2).toBeCloseTo(lat, 10);
    }
  });
});

describe('Глобус: оси сцены и наложение снимка', () => {
  it('точка (φ, λ) в группе тела — та же, что её координаты ГСК, переставленные в оси сцены', () => {
    for (const [lat, lon] of [[0, 0], [0, 90], [55.756, 37.617], [-33.9, 151.2], [89, -120], [-45, -158]]) {
      const local = geoToLocal(lat, lon);
      const viaGsk = toScene(geoToGreenwich((lat * Math.PI) / 180, (lon * Math.PI) / 180, 0, 1), new Vector3(), 1);
      expect(local.distanceTo(viaGsk)).toBeLessThan(1e-12);
    }
  });

  it('оси: нулевой меридиан — +X, 90° в. д. — −Z, северный полюс — +Y (правая тройка сохраняется)', () => {
    expect(geoToLocal(0, 0).distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-12);
    expect(geoToLocal(0, 90).distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-12);
    expect(geoToLocal(90, 0).distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-12);
    // x × y = z в физической системе ⇒ в сцене X × (−Z) = Y
    const x = toScene({ x: 1, y: 0, z: 0 }, new Vector3(), 1);
    const y = toScene({ x: 0, y: 1, z: 0 }, new Vector3(), 1);
    const z = toScene({ x: 0, y: 0, z: 1 }, new Vector3(), 1);
    expect(new Vector3().crossVectors(x, y).distanceTo(z)).toBeLessThan(1e-12);
  });

  it('снимок на шаре three.js: пиксель (u, v) лежит на долготе (u − ½)·360° и широте (v − ½)·180°', () => {
    // Снимки тел — равнопромежуточные, долгота −180° у левого края, север сверху — как на карте.
    const g = new SphereGeometry(1, 72, 36);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    let checked = 0;
    for (let k = 0; k < pos.count; k++) {
      const u = uv.getX(k);
      const v = uv.getY(k);
      const lat = (v - 0.5) * 180;
      if (Math.abs(lat) > 89) continue; // на полюсах долгота не определена
      const lon = (u - 0.5) * 360;
      const expected = geoToLocal(lat, lon);
      expect(expected.distanceTo(new Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)))).toBeLessThan(1e-6);
      checked++;
    }
    expect(checked).toBeGreaterThan(2000);
  });
});
