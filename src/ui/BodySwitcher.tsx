import { BODIES, type BodyId } from '../physics/bodies';
import { useAppStore } from '../state/store';
import { SURFACE } from '../views/assets';
import styles from './BodySwitcher.module.css';
import { rovingKeyDown, rovingTabIndex } from './roving';

const ORDER: BodyId[] = ['earth', 'moon', 'mars'];

/**
 * Выбор центрального тела. Диски — настоящие снимки поверхности (те же текстуры,
 * что у глобуса), у выбранного — кольцо орбиты.
 */
export function BodySwitcher() {
  const body = useAppStore((s) => s.body);
  const selectBody = useAppStore((s) => s.selectBody);
  return (
    <div className={styles.switcher} role="radiogroup" aria-label="Центральное тело" onKeyDown={(e) => rovingKeyDown(e, ORDER, body, selectBody)}>
      {ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={body === id}
          tabIndex={rovingTabIndex(body === id)}
          className={styles.item}
          data-body={id}
          onClick={() => selectBody(id)}
          title={`Спутники: ${BODIES[id].name}`}
        >
          <span className={styles.disc} style={{ backgroundImage: `url(${SURFACE[id][0]})` }} aria-hidden="true">
            <span className={styles.ring} />
          </span>
          <span className={styles.label}>{BODIES[id].name}</span>
        </button>
      ))}
    </div>
  );
}
