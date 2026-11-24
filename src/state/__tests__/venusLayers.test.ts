import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../store';

vi.hoisted(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
});

beforeEach(() => useAppStore.getState().setVenusClouds(false));

describe('переключатели облаков Венеры', () => {
  const { toggleLayer, setVenusClouds } = useAppStore.getState();

  it('выбор облаков или поверхности в верхних кнопках показывает снимок', () => {
    for (const on of [true, false]) {
      toggleLayer('imagery');
      setVenusClouds(on);
      expect(useAppStore.getState().layers).toMatchObject({ venusClouds: on, imagery: true });
    }
  });

  it('флажок показывает облака и после скрытия облачного снимка', () => {
    toggleLayer('imagery');
    toggleLayer('venusClouds');
    expect(useAppStore.getState().layers).toMatchObject({ venusClouds: true, imagery: true });

    toggleLayer('imagery');
    toggleLayer('venusClouds');
    expect(useAppStore.getState().layers).toMatchObject({ venusClouds: true, imagery: true });

    toggleLayer('venusClouds');
    expect(useAppStore.getState().layers).toMatchObject({ venusClouds: false, imagery: true });
  });
});
