/**
 * «Расчёт по шагам» в боковой панели. По умолчанию свёрнут: формулы (KaTeX) загружаются
 * отдельным чанком и пересчитываются только пока панель открыта.
 */
import { ChevronDown } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useAppStore } from '../state/store';
import styles from './FormulaSteps.module.css';

const FormulaStepsBody = lazy(() => import('./FormulaStepsBody'));

export function FormulaSteps() {
  const hasOrbit = useAppStore((s) => !!s.orbit);
  const [open, setOpen] = useState(false);
  if (!hasOrbit) return null;

  return (
    <section className={styles.section}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>Расчёт по шагам</span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <Suspense fallback={<p className={styles.note}>Загрузка формул…</p>}>
          <FormulaStepsBody />
        </Suspense>
      )}
    </section>
  );
}
