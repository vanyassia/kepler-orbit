import { describe, expect, it } from 'vitest';
import { isIss, ISS_NORAD, naturalSatellite } from '../orbiters';

describe('своя модель и значок МКС', () => {
  it('МКС узнаётся по номеру 25544 у Земли', () => {
    expect(ISS_NORAD).toBe(25544);
    expect(isIss({ noradId: 25544 })).toBe(true);
    expect(isIss({ noradId: 25544, body: 'earth' })).toBe(true);
  });

  it('другие спутники и тот же номер у Луны или Марса — не МКС', () => {
    expect(isIss({ noradId: 20580 })).toBe(false); // Хаббл
    expect(isIss({ noradId: 25544, body: 'moon' })).toBe(false);
    expect(isIss({ noradId: 25544, body: 'mars' })).toBe(false);
  });

  it('МКС не считается естественным спутником (иначе вместо модели нарисуется тело)', () => {
    expect(naturalSatellite({ noradId: 25544 })).toBeNull();
  });
});
