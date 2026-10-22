import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import styles from './AboutDialog.module.css';

/** Сведения о модели, точности, источниках данных и управлении. */
export function AboutDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="about-title">
      <div className={styles.body}>
        <div className={styles.head}>
          <h2 id="about-title">О модели</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </div>

        <section>
          <h3>Что считается</h3>
          <p>
            Движение спутника в центральном поле притяжения шарообразной Земли — задача двух тел. По начальным элементам орбиты
            решается уравнение Кеплера, находятся истинная аномалия и радиус-вектор, координаты в абсолютной геоцентрической
            экваториальной системе (АГЭСК), затем с учётом звёздного времени — в гринвичской системе и широта, долгота и высота
            подспутниковой точки. Все формулы с нумерацией — в файле <code>docs/formulas.md</code> и в панели «Расчёт по шагам».
          </p>
          <p>Не учитываются: сжатие Земли, сопротивление атмосферы, притяжение Луны и Солнца, давление света.</p>
        </section>

        <section>
          <h3>Точность</h3>
          <p>
            CelesTrak публикует средние элементы модели SGP4. Задача двух тел не учитывает прецессию орбиты из-за сжатия Земли
            (для МКС около 5° по долготе узла в сутки), поэтому расчёт постепенно расходится с реальным положением. Сравнение с SGP4
            для МКС (элементы от 21.10.2026):
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Время от эпохи</th>
                <th>Расхождение</th>
              </tr>
            </thead>
            <tbody className="num">
              <tr>
                <td>0 ч</td>
                <td>11 км</td>
              </tr>
              <tr>
                <td>3 ч</td>
                <td>44 км</td>
              </tr>
              <tr>
                <td>6 ч</td>
                <td>63 км</td>
              </tr>
              <tr>
                <td>24 ч</td>
                <td>≈ 440 км</td>
              </tr>
            </tbody>
          </table>
          <p className={styles.dim}>Чем свежее эпоха элементов, тем ближе трасса к реальной. Возраст эпохи показан в верхней панели.</p>
        </section>

        <section>
          <h3>Управление</h3>
          <dl className={styles.keys}>
            <dt>
              <kbd>Пробел</kbd>
            </dt>
            <dd>пауза и пуск</dd>
            <dt>
              <kbd>←</kbd> <kbd>→</kbd>
            </dt>
            <dd>шаг времени на минуту, с Shift — на час</dd>
            <dt>
              <kbd>/</kbd>
            </dt>
            <dd>поиск спутника</dd>
            <dt>Мышь</dt>
            <dd>вращение глобуса, колесо — приближение; на карте — сдвиг и масштаб</dd>
          </dl>
        </section>

        <section>
          <h3>Источники</h3>
          <ul className={styles.sources}>
            <li>Элементы орбит — CelesTrak GP API (celestrak.org); при недоступности — кэш браузера или встроенный снимок.</li>
            <li>Снимок Земли — NASA Visible Earth, Blue Marble Next Generation; ночные огни — NASA Black Marble 2016; облака — NASA (общественное достояние).</li>
            <li>Карта нормалей, маска океанов, звёздное небо — Solar System Scope, лицензия CC BY 4.0.</li>
            <li>Границы государств — Natural Earth (общественное достояние).</li>
            <li>
              Обозначения и терминология — по учебнику: Константинов М. С., Каменков Е. Ф., Перелыгин Б. П., Безвербый В. К. «Механика
              космического полёта». М.: Машиностроение, 1989.
            </li>
          </ul>
        </section>
      </div>
    </dialog>
  );
}
