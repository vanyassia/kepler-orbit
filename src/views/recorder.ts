/**
 * Запись короткого видео вида (карта или глобус) — например, 10 секунд ускоренного полёта.
 *
 * Каждый кадр (30 в секунду) вид рисуется вместе с подписями на отдельный холст тем же способом,
 * что и картинка для выгрузки (snapshot.ts): название спутника, время и ускорение идут в кадре.
 * Холст отдаёт поток кадров (captureStream), MediaRecorder сжимает его в MP4 или WebM.
 * На время записи ставится выбранное ускорение, после — прежнее. Плашка с ходом записи и кнопкой
 * «Скачать» — src/ui/RecordingChip.tsx.
 */
import { create } from 'zustand';
import { useAppStore } from '../state/store';
import type { SnapshotCaption, SnapshotKind } from './snapshot';
import { drawView, viewSize } from './snapshot';
import { pickVideoType, videoBitrate, videoExtension, videoSize } from './videoFormat';

export type RecorderState =
  | { status: 'idle' }
  | { status: 'recording'; elapsed: number; duration: number }
  | { status: 'done'; blob: Blob; name: string }
  | { status: 'error'; message: string };

export const useRecorder = create<{ state: RecorderState }>(() => ({ state: { status: 'idle' } }));
const setState = (state: RecorderState) => useRecorder.setState({ state });

/** Умеет ли браузер записывать видео с холста. */
export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

export interface RecordOptions {
  kind: SnapshotKind;
  durationSec: number;
  /** Ускорение времени на время записи. */
  speed: number;
  /** Подпись кадра — пересчитывается каждый кадр (время идёт). */
  caption: () => SnapshotCaption;
  fileName: (ext: string) => string;
}

const FPS = 30;
let stopActive: (() => void) | null = null;

/** Начать запись. Строка — почему не получилось (вид не открыт, браузер не умеет). */
export function startRecording(o: RecordOptions): string | null {
  if (stopActive) return 'Запись уже идёт';
  if (!canRecordVideo()) return 'Этот браузер не умеет записывать видео';
  const view = viewSize(o.kind);
  if (!view) return 'Вид ещё не готов — откройте его и повторите';
  const { width, height } = videoSize(view.width, view.height);

  // Холст записи — в документе, но невидимый: некоторые браузеры не отдают кадры холста вне документа
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.001;pointer-events:none';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  const type = pickVideoType((t) => MediaRecorder.isTypeSupported(t));
  let stream: MediaStream | undefined;
  let rec: MediaRecorder;
  try {
    stream = canvas.captureStream(FPS);
    rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: videoBitrate(width, height) });
  } catch (e) {
    stream?.getTracks().forEach((track) => track.stop());
    canvas.remove();
    console.warn('Запись видео не началась:', e);
    return 'Браузер не дал записать видео';
  }

  const app = useAppStore.getState();
  const before = { record: app.record, speed: app.speed, playing: app.playing, time: app.simTime };
  app.setSpeed(o.speed);
  app.setPlaying(true);

  const chunks: Blob[] = [];
  let failed = false;
  let stopped = false;
  let published = false;
  let raf = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe = () => {};
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  rec.onerror = (e) => {
    console.warn('Ошибка записи видео:', e);
    failed = true;
    finish();
  };
  rec.onstop = publish;

  function publish() {
    if (published) return;
    published = true;
    stopClock();
    stream?.getTracks().forEach((t) => t.stop());
    canvas.remove();
    stopActive = null;
    const mime = rec.mimeType || type || 'video/webm';
    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    if (failed || blob.size === 0) setState({ status: 'error', message: 'Видео не записалось: браузер не отдал кадры' });
    else setState({ status: 'done', blob, name: o.fileName(videoExtension(mime)) });
  }

  function stopClock() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(deadline);
    unsubscribe();
    const s = useAppStore.getState();
    if (s.record === before.record) {
      s.setSpeed(before.speed);
      s.setPlaying(before.playing);
    }
  }

  function finish() {
    if (stopped) return;
    stopClock();
    try {
      if (rec.state !== 'inactive') rec.stop();
      else publish();
    } catch (e) {
      console.warn('Не удалось остановить кодировщик:', e);
      failed = true;
      publish();
    }
  }

  let lastFrame = -Infinity;
  let lastUi = -Infinity;
  const started = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const elapsed = Math.max(0, (now - started) / 1000);
    if (elapsed >= o.durationSec) return finish();
    // Кадр — не чаще 30 раз в секунду (с запасом на неровный шаг кадров экрана)
    if (now - lastFrame >= 1000 / FPS - 4) {
      lastFrame = now;
      drawView(o.kind, o.caption(), ctx);
    }
    if (now - lastUi >= 250) {
      lastUi = now;
      setState({ status: 'recording', elapsed, duration: o.durationSec });
    }
  };
  try {
    drawView(o.kind, o.caption(), ctx);
    rec.start(1000);
  } catch (e) {
    // Кодировщик не запустился: вернуть прежнее ускорение и убрать холст записи
    stream?.getTracks().forEach((t) => t.stop());
    canvas.remove();
    app.setSpeed(before.speed);
    app.setPlaying(before.playing);
    app.setSimTime(before.time);
    console.warn('Запись видео не началась:', e);
    return 'Браузер не дал записать видео';
  }
  setState({ status: 'recording', elapsed: 0, duration: o.durationSec });
  raf = requestAnimationFrame(frame);
  // В фоновой вкладке кадры не идут: запись всё равно кончится вовремя, и ускорение вернётся
  deadline = setTimeout(finish, o.durationSec * 1000 + 250);
  unsubscribe = useAppStore.subscribe((state) => {
    if (state.record !== before.record || (o.kind === 'globe' ? state.view === '2d' : state.view === '3d')) finish();
  });
  stopActive = finish;
  return null;
}

/** Остановить запись раньше срока — записанное сохраняется. */
export const stopRecording = () => stopActive?.();

/** Убрать плашку с готовым видео или ошибкой. */
export const dismissRecording = () => setState({ status: 'idle' });

// Доступ из консоли браузера при разработке: проверить записанный файл
if (import.meta.env.DEV) (globalThis as Record<string, unknown>).__keplerRecorder = useRecorder;
