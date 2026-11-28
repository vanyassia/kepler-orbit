import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

it('после ошибки отклоняет старый запрос и создаёт новый поток', async () => {
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onerror?: () => void;
    onmessage?: (event: { data: { id: number; width: number; height: number } }) => void;
    terminate = vi.fn();
    postMessage = vi.fn();
    constructor() { workers.push(this); }
  }
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('document', { baseURI: 'https://example.test/' });
  const { askWorker } = await import('../imageClient');
  const first = askWorker({ type: 'open', id: 1, url: 'pic.webp' });
  workers[0].onerror?.();
  await expect(first).rejects.toThrow('остановился');
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  const second = askWorker({ type: 'open', id: 2, url: 'pic.webp' });
  expect(workers).toHaveLength(2);
  workers[1].onmessage?.({ data: { id: 2, width: 16, height: 8 } });
  await expect(second).resolves.toEqual({ id: 2, width: 16, height: 8 });
});
