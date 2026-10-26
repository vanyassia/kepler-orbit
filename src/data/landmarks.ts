/**
 * Объекты на поверхности Луны и Марса — аналог городов на карте Земли.
 * Выделены (как Москва и Смоленск) места посадок советских аппаратов.
 * Координаты планетоцентрические, восточная долгота положительна (IAU).
 */
import type { BodyId } from '../physics/bodies';
import type { City } from './cities';
import { CITIES } from './cities';

const MOON: City[] = [
  { name: 'Луна-9', lat: 7.08, lon: -64.37, highlight: true },
  { name: 'Луноход-1', lat: 38.24, lon: -35.0, highlight: true },
  { name: 'Луноход-2', lat: 25.85, lon: 30.45, highlight: true },
  { name: 'Луна-24', lat: 12.71, lon: 62.21, highlight: true },
  { name: 'Аполлон-11', lat: 0.674, lon: 23.473 },
  { name: 'Аполлон-17', lat: 20.19, lon: 30.77 },
  { name: 'Чанъэ-4', lat: -45.44, lon: 177.6 },
  { name: 'Чандраян-3', lat: -69.37, lon: 32.32 },
  { name: 'Кратер Тихо', lat: -43.31, lon: -11.36 },
  { name: 'Кратер Коперник', lat: 9.62, lon: -20.08 },
  { name: 'Море Спокойствия', lat: 8.5, lon: 31.4, labelSide: 'left' },
];

const MARS: City[] = [
  { name: 'Марс-3', lat: -45.0, lon: -158.0, highlight: true },
  { name: 'Марс-6', lat: -23.9, lon: -19.42, highlight: true },
  { name: 'Олимп', lat: 18.65, lon: -133.8 },
  { name: 'Долины Маринер', lat: -13.9, lon: -59.2 },
  { name: 'Равнина Эллада', lat: -42.4, lon: 70.5 },
  { name: 'Кьюриосити', lat: -4.59, lon: 137.44 },
  { name: 'Персеверанс', lat: 18.44, lon: 77.45 },
  { name: 'Чжужун', lat: 25.07, lon: 109.93 },
  { name: 'Викинг-1', lat: 22.27, lon: -47.95 },
  { name: 'Гора Арсия', lat: -8.26, lon: -120.09, labelSide: 'left' },
];

export const PLACES: Record<BodyId, City[]> = { earth: CITIES, moon: MOON, mars: MARS };

/** Как называется слой отметок на поверхности. */
export const PLACES_LABEL: Record<BodyId, string> = { earth: 'Города', moon: 'Места посадок и кратеры', mars: 'Места посадок и объекты' };
