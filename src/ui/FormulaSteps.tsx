/**
 * «Расчёт по шагам»: цепочка формул (1)–(14) с подставленными числами
 * для текущего момента времени симуляции (нумерация — как в docs/formulas.md).
 */
import katex from 'katex';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { RAD } from '../physics/constants';
import { propagate } from '../physics/propagate';
import { useAppStore } from '../state/store';
import styles from './FormulaSteps.module.css';
import { fmt } from './format';

/** Число для TeX: десятичная запятая без лишнего пробела, тонкий пробел между разрядами. */
function n(value: number, digits = 3): string {
  // Сначала десятичная запятая, затем разделители разрядов (иначе заменится запятая из «\,»)
  return fmt(value, digits).replace('−', '-').replace(',', '{,}').replace(/[  ]/g, '\\,');
}

interface Step {
  no: string;
  title: string;
  tex: string;
}

function Formula({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: true, output: 'html', strict: 'ignore' }), [tex]);
  return <div className={styles.formula} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function FormulaSteps() {
  const orbit = useAppStore((s) => s.orbit);
  const [open, setOpen] = useState(true);
  const t = useThrottledSimTime(250);

  const steps = useMemo<Step[]>(() => {
    if (!orbit) return [];
    const s = propagate(orbit, t);
    const el = orbit.elements;
    const earth = orbit.body.id === 'earth';
    const sym = orbit.body.rotationSymbol;
    return [
      {
        no: '1–2',
        title: 'Среднее движение и большая полуось',
        tex: `\\begin{aligned}n&=\\frac{2\\pi N}{86400}=${n(orbit.n * 1e3, 5)}\\cdot10^{-3}\\ \\tfrac{\\text{рад}}{\\text{с}}\\\\a&=\\sqrt[3]{\\mu/n^2}=${n(orbit.a, 1)}\\ \\text{км}\\end{aligned}`,
      },
      {
        no: '3',
        title: 'Период и фокальный параметр',
        tex: `\\begin{aligned}T&=2\\pi\\sqrt{a^3/\\mu}=${n(orbit.T / 60, 2)}\\ \\text{мин}\\\\p&=a(1-e^2)=${n(orbit.p, 1)}\\ \\text{км}\\end{aligned}`,
      },
      {
        no: '4',
        title: 'Средняя аномалия',
        tex: `\\begin{aligned}M&=M_0+n(t-t_0)\\\\&=${n(el.meanAnomalyDeg, 3)}^\\circ+n\\cdot${n(s.dt, 0)}\\ \\text{с}\\\\&=${n(s.M * RAD, 4)}^\\circ\\ (\\text{mod}\\ 360^\\circ)\\end{aligned}`,
      },
      {
        no: '5',
        title: `Уравнение Кеплера (метод Ньютона, итераций: ${s.keplerIterations})`,
        tex: `E-e\\sin E=M\;\\Rightarrow\;E=${n(s.E * RAD, 4)}^\\circ`,
      },
      {
        no: '6',
        title: 'Истинная аномалия',
        tex: `\\operatorname{tg}\\frac{\\vartheta}{2}=\\sqrt{\\frac{1+e}{1-e}}\\operatorname{tg}\\frac{E}{2}\;\\Rightarrow\;\\vartheta=${n(s.theta * RAD, 4)}^\\circ`,
      },
      {
        no: '7',
        title: 'Радиус-вектор',
        tex: `r=a(1-e\\cos E)=${n(s.r, 2)}\\ \\text{км}`,
      },
      {
        no: '8',
        title: 'Аргумент широты',
        tex: `u=\\omega+\\vartheta=${n(s.u * RAD, 4)}^\\circ`,
      },
      {
        no: '9',
        title: 'Координаты в АГЭСК, км',
        tex: `\\begin{aligned}x&=r(\\cos u\\cos\\Omega-\\sin u\\sin\\Omega\\cos i)\\\\&=${n(s.eci.x, 1)}\\\\y&=r(\\cos u\\sin\\Omega+\\sin u\\cos\\Omega\\cos i)\\\\&=${n(s.eci.y, 1)}\\\\z&=r\\sin u\\sin i=${n(s.eci.z, 1)}\\end{aligned}`,
      },
      {
        no: '10',
        title: 'Скорость, км/с',
        tex: `\\begin{aligned}V_r&=\\sqrt{\\mu/p}\;e\\sin\\vartheta=${n(s.Vr, 4)}\\\\V_n&=\\sqrt{\\mu/p}\\,(1+e\\cos\\vartheta)=${n(s.Vn, 4)}\\\\V&=\\sqrt{V_r^2+V_n^2}=${n(s.V, 4)}\\end{aligned}`,
      },
      {
        no: '11',
        title: earth ? 'Гринвичское звёздное время' : `Угол поворота тела W (IAU), ${orbit.body.name}`,
        tex: `${sym}=${n(s.S * RAD, 4)}^\\circ`,
      },
      {
        no: '12',
        title: earth ? 'Поворот в гринвичскую систему (ГСК), км' : 'Поворот во вращающуюся систему тела, км',
        tex: `\\begin{aligned}x_{\\text{г}}&=x\\cos ${sym}+y\\sin ${sym}=${n(s.ecef.x, 1)}\\\\y_{\\text{г}}&=-x\\sin ${sym}+y\\cos ${sym}=${n(s.ecef.y, 1)}\\\\z_{\\text{г}}&=z=${n(s.ecef.z, 1)}\\end{aligned}`,
      },
      {
        no: '13–14',
        title: 'Подспутниковая точка и высота',
        tex: `\\begin{aligned}\\varphi&=\\arcsin(z_{\\text{г}}/r)=${n(s.lat * RAD, 4)}^\\circ\\\\\\lambda&=\\operatorname{arctg}(y_{\\text{г}}/x_{\\text{г}})=${n(s.lon * RAD, 4)}^\\circ\\\\h&=r-R=${n(s.h, 1)}\\ \\text{км}\\end{aligned}`,
      },
    ];
  }, [orbit, t]);

  if (!orbit) return null;

  return (
    <section className={styles.section}>
      <button type="button" className={styles.head} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>Расчёт по шагам</span>
        <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      {open && (
        <>
          <p className={styles.note}>
            Задача двух тел: {orbit.body.name}, μ = <span className="num">{fmt(orbit.body.mu, 4)}</span> км³/с², R ={' '}
            <span className="num">{fmt(orbit.body.radius, 1)}</span> км.{orbit.body.id === 'mars' ? ' Для Марса в повороте учтена разница полюсов IAU 2015 и 2009 (формула 20).' : ''} Числа соответствуют текущему моменту; чтобы
            рассмотреть их, остановите время (пробел).
          </p>
          <ol className={styles.list}>
            {steps.map((st) => (
              <li key={st.no} className={styles.step}>
                <div className={styles.stepHead}>
                  <span className={`${styles.no} num`}>({st.no})</span>
                  <span>{st.title}</span>
                </div>
                <Formula tex={st.tex} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
