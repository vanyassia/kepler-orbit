import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SatelliteRecord } from '../../data/celestrak';
import type { OmmRecord } from '../../data/omm';
import { ommToElements } from '../../data/omm';
import { extractTleLines } from '../../data/tle';
import { prepareOrbit, propagate } from '../../physics/propagate';
import { deviation } from '../compare';
import { createReference, referenceState } from '../sgp4';

const fixtures = join(import.meta.dirname, '..', '..', 'data', '__tests__', 'fixtures');
const omm = (JSON.parse(readFileSync(join(fixtures, 'iss.json'), 'utf8')) as OmmRecord[])[0];
const tleText = readFileSync(join(fixtures, 'iss.tle'), 'utf8');
const record: SatelliteRecord = { elements: ommToElements(omm), source: 'online', fetchedAt: 0, omm };

describe('Эталон SGP4', () => {
  it('создаётся из OMM JSON и из TLE, оба дают одно положение', () => {
    const a = createReference(record)!;
    const b = createReference({ ...record, omm: undefined, tle: extractTleLines(tleText)! })!;
    const t = record.elements.epochMs + 3_600_000;
    const pa = referenceState(a, t)!;
    const pb = referenceState(b, t)!;
    expect(Math.hypot(pa.eci.x - pb.eci.x, pa.eci.y - pb.eci.y, pa.eci.z - pb.eci.z)).toBeLessThan(0.5);
  });

  it('без исходных данных (только шесть элементов) эталона нет', () => {
    expect(createReference({ ...record, omm: undefined })).toBeNull();
  });

  it('на эпоху задача двух тел отличается от SGP4 на единицы–десятки км (средние элементы против оскулирующих)', () => {
    const sat = createReference(record)!;
    const orbit = prepareOrbit(record.elements);
    const t = record.elements.epochMs;
    const dev = deviation(propagate(orbit, t), referenceState(sat, t)!);
    expect(dev.total).toBeGreaterThan(1);
    expect(dev.total).toBeLessThan(40);
  });

  it('за сутки расхождение растёт, а плоскость орбиты уходит (бинормальная составляющая)', () => {
    const sat = createReference(record)!;
    const orbit = prepareOrbit(record.elements);
    const t0 = record.elements.epochMs;
    const d0 = deviation(propagate(orbit, t0), referenceState(sat, t0)!);
    const d1 = deviation(propagate(orbit, t0 + 86_400_000), referenceState(sat, t0 + 86_400_000)!);
    expect(d1.total).toBeGreaterThan(d0.total * 5);
    expect(Math.abs(d1.cross)).toBeGreaterThan(50);
  });
});

describe('Разложение расхождения по осям — формула (17)', () => {
  const ours = { eci: { x: 7000, y: 0, z: 0 }, vEci: { x: 0, y: 7.5, z: 0 }, lat: 0, lon: 0 };

  it('сдвиг по радиусу, вдоль движения и поперёк плоскости разделяются', () => {
    const d = deviation(ours, { eci: { x: 7003, y: 4, z: -12 }, lat: 0, lon: 0 });
    expect(d.radial).toBeCloseTo(3, 9);
    expect(d.along).toBeCloseTo(4, 9);
    expect(d.cross).toBeCloseTo(-12, 9);
    expect(d.total).toBeCloseTo(13, 9);
  });

  it('расстояние по поверхности: 1° дуги экватора ≈ 111,2 км', () => {
    const d = deviation(ours, { eci: ours.eci, lat: 0, lon: Math.PI / 180 });
    expect(d.ground).toBeCloseTo(111.19, 1);
  });
});
