/**
 * Содержимое «Расчёта по шагам»: цепочка формул листка «Трасса спутника» с подставленными числами
 * для текущего момента времени симуляции (нумерация шагов — как в листке).
 * Вынесено в отдельный чанк вместе с KaTeX: загружается при первом раскрытии панели.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';
import { useThrottledSimTime } from '../hooks/useSimClock';
import { RAD } from '../physics/constants';
import { propagate } from '../physics/propagate';
import { julianDate } from '../physics/time';
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

export default function FormulaStepsBody() {
  const orbit = useAppStore((s) => s.orbit);
  const t = useThrottledSimTime(250);

  const steps = useMemo<Step[]>(() => {
    if (!orbit) return [];
    const s = propagate(orbit, t);
    const el = orbit.elements;
    const earth = orbit.body.id === 'earth';
    const sym = orbit.body.rotationSymbol;
    const tMin = s.dt / 60;
    const nDegMin = orbit.n * RAD * 60;
    const iDeg = orbit.iEq * RAD;
    return [
      {
        no: '2',
        title: 'Период, средняя угловая скорость, большая полуось',
        tex: `\\begin{aligned}T&=\\frac{86400}{N}=\\frac{86400}{${n(el.meanMotion, 8)}}=${n(orbit.T, 2)}\\ \\text{с}=${n(orbit.T / 60, 4)}\\ \\text{мин}\\\\n&=\\frac{360^\\circ}{T}=${n(nDegMin, 5)}\\ {}^\\circ/\\text{мин}\\\\a&=\\sqrt[3]{\\mu/n^2}=${n(orbit.a, 2)}\\ \\text{км}\\\\h_{\\text{п}}&=a(1-e)-R=${n(orbit.hPerigee, 1)}\\ \\text{км},\\quad h_{\\text{а}}=a(1+e)-R=${n(orbit.hApogee, 1)}\\ \\text{км}\\end{aligned}`,
      },
      earth
        ? {
            no: '4',
            title: 'Угол поворота Земли на эпоху и долгота восходящего узла',
            tex: `\\begin{aligned}JD&=${n(julianDate(orbit.epochMs), 5)}\\\\S&=280{,}46062^\\circ+360{,}98564737^\\circ(JD-2451545{,}0)\\\\&=${n(orbit.S0 * RAD, 4)}^\\circ\\ (\\text{mod}\\ 360^\\circ)\\\\\\lambda_\\Omega&=\\Omega-S=${n(el.raanDeg, 4)}^\\circ-${n(orbit.S0 * RAD, 4)}^\\circ=${n(orbit.lambdaNode * RAD, 4)}^\\circ\\end{aligned}`,
          }
        : {
            no: '4',
            title: `Угол поворота тела W (IAU) на эпоху и долгота узла, ${orbit.body.name}`,
            tex: `\\begin{aligned}W_0&=${n(orbit.S0 * RAD, 4)}^\\circ\\\\\\lambda_\\Omega&=\\Omega-W_0=${n(orbit.lambdaNode * RAD, 4)}^\\circ\\end{aligned}`,
          },
      {
        no: '5.1',
        title: 'Средняя аномалия',
        tex: `\\begin{aligned}M&=M_0+n\\cdot t=${n(el.meanAnomalyDeg, 4)}^\\circ+${n(nDegMin, 5)}\\cdot${n(tMin, 2)}\\ \\text{мин}\\\\&=${n(s.M * RAD, 4)}^\\circ\\ (\\text{mod}\\ 360^\\circ)\\end{aligned}`,
      },
      {
        no: '5.2',
        title: `Уравнение Кеплера (метод Ньютона, итераций: ${s.keplerIterations})`,
        tex: `\\begin{aligned}&E-e\\sin E=M,\\quad E_0=M+e\\sin M\\\\&E_{\\text{новое}}=E-\\frac{E-e\\sin E-M}{1-e\\cos E}\\;\\Rightarrow\\;E=${n(s.E * RAD, 4)}^\\circ\\end{aligned}`,
      },
      {
        no: '5.3',
        title: 'Истинная аномалия',
        tex: `\\nu=2\\operatorname{atan2}\\Big(\\sqrt{1+e}\\sin\\frac{E}{2},\\ \\sqrt{1-e}\\cos\\frac{E}{2}\\Big)=${n(s.theta * RAD, 4)}^\\circ`,
      },
      {
        no: '5.4',
        title: 'Аргумент широты',
        tex: `u=\\omega+\\nu=${n(s.u * RAD, 4)}^\\circ\\ (\\text{mod}\\ 360^\\circ)`,
      },
      {
        no: '5.5',
        title: 'Широта',
        tex: `\\sin\\varphi=\\sin u\\cdot\\sin i\\;\\Rightarrow\\;\\varphi=${n(s.lat * RAD, 4)}^\\circ`,
      },
      {
        no: '5.6',
        title: 'Путь по экватору',
        tex: `ab=\\operatorname{atan2}(\\cos i\\cdot\\sin u,\\ \\cos u)=${n(s.ab * RAD, 4)}^\\circ\\quad(i=${n(iDeg, 4)}^\\circ)`,
      },
      {
        no: '5.7',
        title: earth ? 'Поворот Земли за время после эпохи' : `Поворот тела за время после эпохи, ${orbit.body.name}`,
        tex: earth
          ? `\\varDelta=\\omega_{\\text{З}}\\cdot t=0{,}250684\\cdot${n(tMin, 2)}=${n(s.turn * RAD, 4)}^\\circ`
          : `\\varDelta=${sym}(t)-${sym}_0=${n(s.turn * RAD, 4)}^\\circ`,
      },
      {
        no: '5.8',
        title: 'Долгота',
        tex: `\\lambda=\\lambda_\\Omega+ab-\\varDelta=${n(s.lon * RAD, 4)}^\\circ\\ (\\text{приведена к}\\ \\pm180^\\circ)`,
      },
      {
        no: 'h',
        title: 'Высота (для 3D и подписи спутника)',
        tex: `\\begin{aligned}r&=a(1-e\\cos E)=${n(s.r, 2)}\\ \\text{км}\\\\h&=r-R=${n(s.h, 1)}\\ \\text{км}\\end{aligned}`,
      },
    ];
  }, [orbit, t]);

  if (!orbit) return null;

  return (
    <>
      <p className={styles.note}>
        Задача двух тел: {orbit.body.name}, μ = <span className="num">{fmt(orbit.body.mu, 4)}</span> км³/с², R ={' '}
        <span className="num">{fmt(orbit.body.radius, 1)}</span> км.{orbit.body.id === 'mars' ? ' Для Марса i и u отсчитаны от экватора вращения (учтена разница полюсов IAU 2015 и 2009).' : ''} t — время
        после эпохи элементов. Числа соответствуют текущему моменту; чтобы рассмотреть их, остановите время (пробел).
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
  );
}
