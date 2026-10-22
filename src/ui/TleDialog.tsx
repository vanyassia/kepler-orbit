import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { parseTle } from '../data/tle';
import { useAppStore } from '../state/store';
import styles from './TleDialog.module.css';

const EXAMPLE = `ISS (ZARYA)
1 25544U 98067A   26294.04791053  .00009575  00000+0  18188-3 0  9996
2 25544  51.6327  37.2623 0006759 289.5321  70.4938 15.48967427591263`;

/** Ручной ввод TLE — последний запасной вариант без связи с CelesTrak. */
export function TleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const setRecord = useAppStore((s) => s.setRecord);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const elements = parseTle(text);
      setRecord({ elements, source: 'manual', fetchedAt: Date.now() });
      setError(null);
      setText('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="tle-title">
      <form onSubmit={submit} className={styles.form}>
        <div className={styles.head}>
          <h2 id="tle-title">Элементы орбиты в формате TLE</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>
        <p className={styles.hint}>
          Две строки TLE, можно с названием в первой строке. Контрольные суммы проверяются.
        </p>
        <textarea
          name="tle"
          aria-label="Строки TLE"
          autoComplete="off"
          className={styles.area}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          rows={4}
          spellCheck={false}
          aria-invalid={!!error}
        />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={() => setText(EXAMPLE)}>
            Подставить пример (МКС)
          </button>
          <button type="submit" className={styles.primary} disabled={!text.trim()}>
            Показать орбиту
          </button>
        </div>
      </form>
    </dialog>
  );
}
