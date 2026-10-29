import { FileText, LoaderCircle, Orbit, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { SatelliteRecord } from '../data/celestrak';
import { searchSatellites } from '../data/celestrak';
import { ORBITERS } from '../data/orbiters';
import { POPULAR_SATELLITES } from '../data/popular';
import { BODIES } from '../physics/bodies';
import { useAppStore } from '../state/store';
import styles from './SatelliteSearch.module.css';
import { CustomOrbitDialog } from './CustomOrbitDialog';
import { TleDialog } from './TleDialog';

type Item = { kind: 'popular'; noradId: number; title: string; note: string } | { kind: 'result'; record: SatelliteRecord };

/** Поиск спутника по названию (латиницей, как в каталоге) или номеру NORAD. */
export function SatelliteSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SatelliteRecord[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [tleOpen, setTleOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const loadNorad = useAppStore((s) => s.loadNorad);
  const setRecord = useAppStore((s) => s.setRecord);
  const body = useAppStore((s) => s.body);
  const earth = body === 'earth';

  // Поиск с задержкой 300 мс; предыдущий запрос отменяется
  useEffect(() => {
    const q = query.trim();
    // Каталог CelesTrak — только для спутников Земли; на Луне и Марсе ищем по местному списку
    if (!earth || (q.length < 2 && !/^\d+$/.test(q))) {
      setResults(null);
      setNotice(null);
      setBusy(false);
      return;
    }
    const ctrl = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const res = await searchSatellites(q, { signal: ctrl.signal });
        setResults(res.items);
        setNotice(res.notice ?? null);
        setActive(0);
      } catch (e) {
        if (!ctrl.signal.aborted) setNotice(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [query, earth]);

  // Закрытие по клику вне
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const needle = query.trim().toLowerCase();
  const local: Item[] = earth
    ? POPULAR_SATELLITES.map((p) => ({ kind: 'popular', ...p }))
    : ORBITERS.filter((o) => o.body === body)
        .filter((o) => !needle || o.title.toLowerCase().includes(needle) || String(o.naifId).includes(needle))
        .map((o) => ({ kind: 'popular', noradId: o.naifId, title: o.title, note: o.note }));
  const items: Item[] = results === null ? local : results.map((record) => ({ kind: 'result', record }));

  const choose = (item: Item) => {
    if (item.kind === 'popular') void loadNorad(item.noradId);
    else setRecord(item.record);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && open && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <label className={styles.field}>
        {busy ? <LoaderCircle className={styles.spin} size={16} /> : <Search size={16} />}
        <span className="visually-hidden">Поиск спутника</span>
        <input
          ref={inputRef}
          type="search"
          name="satellite"
          enterKeyHint="search"
          value={query}
          placeholder={earth ? 'ISS, HST, 25544…' : body === 'moon' ? 'LRO, Danuri…' : 'MRO, TGO, Hope…'}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className={styles.kbd}>/</kbd>
      </label>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.heading}>{results === null ? (earth ? 'Популярные спутники' : `Аппараты: ${BODIES[body].name}, данные JPL Horizons`) : `Найдено: ${results.length}`}</div>
          {notice && <div className={styles.notice}>{notice}</div>}
          {results !== null && results.length === 0 && !busy && (
            <div className={styles.empty}>
              Ничего не найдено. Названия в каталоге CelesTrak — латиницей: ISS, HST, METEOR, GLONASS.
            </div>
          )}
          <ul id={listId} role="listbox" className={styles.list}>
            {items.map((item, idx) => {
              const key = item.kind === 'popular' ? `p${item.noradId}` : `r${item.record.elements.noradId}`;
              const title = item.kind === 'popular' ? item.title : item.record.elements.name;
              const id = item.kind === 'popular' ? item.noradId : item.record.elements.noradId;
              const note = item.kind === 'popular' ? item.note : item.record.elements.cosparId;
              return (
                <li
                  key={key}
                  id={`${listId}-${idx}`}
                  role="option"
                  aria-selected={idx === active}
                  className={styles.option}
                  onPointerEnter={() => setActive(idx)}
                  onClick={() => choose(item)}
                >
                  <span className={styles.optTitle} title={title}>
                    {title}
                  </span>
                  <span className={styles.optNote}>{note}</span>
                  <span className={`${styles.optId} num`}>{id}</span>
                </li>
              );
            })}
          </ul>
          {earth && <button
            type="button"
            className={styles.tleButton}
            onClick={() => {
              setTleOpen(true);
              setOpen(false);
            }}
          >
            <FileText size={14} /> Ввести TLE вручную
          </button>}
          <button
            type="button"
            className={styles.tleButton}
            onClick={() => {
              setCustomOpen(true);
              setOpen(false);
            }}
          >
            <Orbit size={14} /> Свой спутник: задать орбиту
          </button>
        </div>
      )}
      {/* Объявление результатов поиска для экранных читалок */}
      <div className="visually-hidden" role="status" aria-live="polite">
        {busy
          ? ''
          : notice ??
            (results === null ? '' : results.length === 0 ? 'Ничего не найдено' : `Найдено: ${results.length}`)}
      </div>
      <TleDialog open={tleOpen} onClose={() => setTleOpen(false)} />
      <CustomOrbitDialog open={customOpen} onClose={() => setCustomOpen(false)} />
      <SlashShortcut onTrigger={() => inputRef.current?.focus()} />
    </div>
  );
}

/** Клавиша «/» переводит фокус в поиск. */
function SlashShortcut({ onTrigger }: { onTrigger: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(t.tagName)) {
        e.preventDefault();
        onTrigger();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTrigger]);
  return null;
}
