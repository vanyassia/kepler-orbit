/**
 * Плашка записи видео над видом: ход записи с кнопкой «Остановить», затем «Скачать» и «Отправить».
 * Сохранение — по нажатию: браузеры (Safari, телефоны) пускают загрузку и окно «Поделиться» только
 * по действию пользователя. В само видео плашка не попадает — записывается только холст вида.
 */
import { Download, Share, Square, X } from 'lucide-react';
import { useMemo } from 'react';
import { dismissRecording, stopRecording, useRecorder } from '../views/recorder';
import { fmtClock } from '../views/videoFormat';
import { canShareFile, downloadBlob, shareFile } from './download';
import { fmt } from './format';
import styles from './RecordingChip.module.css';

export function RecordingChip() {
  const state = useRecorder((s) => s.state);
  const shareable = useMemo(canShareFile, []);
  if (state.status === 'idle') return null;

  if (state.status === 'recording') {
    return (
      <div className={styles.chip} role="status">
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.text}>
          Запись <span className="num">{fmtClock(state.elapsed)}</span> из <span className="num">{fmtClock(state.duration)}</span>
        </span>
        <button type="button" className={styles.btn} onClick={stopRecording}>
          <Square size={12} fill="currentColor" aria-hidden="true" /> Остановить
        </button>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.chip} role="alert">
        <span className={styles.text}>{state.message}</span>
        <button type="button" className={styles.icon} onClick={dismissRecording} aria-label="Закрыть" title="Закрыть">
          <X size={15} />
        </button>
      </div>
    );
  }

  const ext = state.name.split('.').pop()!.toUpperCase();
  return (
    <div className={styles.chip} role="status">
      <span className={styles.text}>
        Видео готово · <span className="num">{fmt(state.blob.size / 1024 / 1024, 1)}</span> МБ
      </span>
      {shareable && (
        <button type="button" className={styles.btn} onClick={() => void shareFile(state.blob, state.name)}>
          <Share size={14} aria-hidden="true" /> Отправить
        </button>
      )}
      <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => downloadBlob(state.blob, state.name)}>
        <Download size={14} aria-hidden="true" /> Скачать {ext}
      </button>
      <button type="button" className={styles.icon} onClick={dismissRecording} aria-label="Закрыть" title="Закрыть">
        <X size={15} />
      </button>
    </div>
  );
}
