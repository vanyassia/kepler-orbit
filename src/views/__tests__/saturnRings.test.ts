import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { SATURN } from '../../physics/bodies';
import { SATURN_RING_INNER, SATURN_RING_OUTER, saturnRingMaterial } from '../globe3d/saturn';

describe('Текстура колец Сатурна', () => {
  it('сохраняет тонкие щели и разную прозрачность основных колец', () => {
    const material = saturnRingMaterial({ value: new Vector3(1, 0, 0) }, { value: 1 });
    const profile = material.uniforms.ringProfile.value;
    const { data, width } = profile.image;
    const opacity = (km: number) => {
      const u = (km / SATURN.radius - SATURN_RING_INNER) / (SATURN_RING_OUTER - SATURN_RING_INNER);
      return data[Math.floor(u * width) * 4 + 3] / 255;
    };

    expect(opacity(78000)).toBeGreaterThan(0.1);
    expect(opacity(78000)).toBeLessThan(opacity(100000));
    expect(opacity(117640)).toBeLessThan(0.08); // Щель Гюйгенса
    expect(opacity(133584)).toBeLessThan(0.08); // Щель Энке
    expect(opacity(136504)).toBeLessThan(0.25); // Щель Килера
    expect(opacity(135000)).toBeGreaterThan(0.5);
    expect(opacity(137500)).toBeLessThan(0.03);
    expect(opacity(140224)).toBeGreaterThan(0.3); // Ядро узкого кольца F
    expect(profile.generateMipmaps).toBe(true);
    material.dispose();
  });
});
