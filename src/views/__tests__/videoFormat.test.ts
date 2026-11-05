import { describe, expect, it } from 'vitest';
import { fmtClock, pickVideoType, VIDEO_MAX_SIDE, videoBitrate, videoExtension, videoSize } from '../videoFormat';

describe('pickVideoType', () => {
  it('предпочитает MP4 (Safari, новый Chrome)', () => {
    expect(pickVideoType((t) => t === 'video/mp4' || t.startsWith('video/webm'))).toBe('video/mp4');
    expect(pickVideoType(() => true)).toBe('video/mp4;codecs=avc1.640028');
  });

  it('без MP4 берёт WebM с лучшим кодеком (Firefox)', () => {
    expect(pickVideoType((t) => t.startsWith('video/webm'))).toBe('video/webm;codecs=vp9');
    expect(pickVideoType((t) => t === 'video/webm;codecs=vp8' || t === 'video/webm')).toBe('video/webm;codecs=vp8');
  });

  it('пустая строка, если не подошёл ни один, и исключения не мешают', () => {
    expect(pickVideoType(() => false)).toBe('');
    expect(
      pickVideoType((t) => {
        if (t.includes('avc1')) throw new Error('незнакомая строка');
        return t === 'video/mp4';
      }),
    ).toBe('video/mp4');
  });
});

describe('videoExtension', () => {
  it('по типу записи', () => {
    expect(videoExtension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(videoExtension('video/x-matroska;codecs=avc1')).toBe('webm');
    expect(videoExtension('video/webm;codecs=vp9')).toBe('webm');
  });
});

describe('videoSize', () => {
  it('маленький вид не увеличивается, стороны чётные', () => {
    expect(videoSize(1281, 721)).toEqual({ width: 1282, height: 722 });
    expect(videoSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('большой вид уменьшается до Full HD по длинной стороне с сохранением пропорций', () => {
    const s = videoSize(2880, 1600);
    expect(s.width).toBe(VIDEO_MAX_SIDE);
    expect(s.height).toBe(1066);
    expect(s.width / s.height).toBeCloseTo(2880 / 1600, 2);
  });

  it('вертикальный вид телефона: ограничена высота', () => {
    const s = videoSize(1170, 2532);
    expect(s.height).toBe(VIDEO_MAX_SIDE);
    expect(s.width % 2).toBe(0);
    expect(s.width / s.height).toBeCloseTo(1170 / 2532, 2);
  });

  it('вырожденный размер не даёт ноль', () => {
    expect(videoSize(1, 1)).toEqual({ width: 2, height: 2 });
  });
});

describe('videoBitrate', () => {
  it('в пределах 2–12 Мбит/с, Full HD — около 8 Мбит/с', () => {
    expect(videoBitrate(320, 240)).toBe(2e6);
    expect(videoBitrate(1920, 1080)).toBeGreaterThan(7e6);
    expect(videoBitrate(1920, 1080)).toBeLessThan(9e6);
    expect(videoBitrate(4000, 4000)).toBe(12e6);
  });
});

describe('fmtClock', () => {
  it('минуты и секунды', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(7.9)).toBe('0:07');
    expect(fmtClock(65)).toBe('1:05');
    expect(fmtClock(-1)).toBe('0:00');
  });
});
