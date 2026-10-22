/**
 * Быстрый выбор популярных спутников. Номера NORAD сверены с каталогом CelesTrak.
 * Порядок — от привычных низких орбит к высоким и вытянутым.
 */
export interface PopularSatellite {
  noradId: number;
  /** Название по-русски для интерфейса. */
  title: string;
  /** Короткая подпись: чем интересна орбита. */
  note: string;
}

export const POPULAR_SATELLITES: PopularSatellite[] = [
  { noradId: 25544, title: 'МКС', note: 'Низкая орбита, i ≈ 51,6°' },
  { noradId: 20580, title: 'Хаббл', note: 'Телескоп, i ≈ 28,5°' },
  { noradId: 48274, title: 'Тяньгун', note: 'Китайская станция' },
  { noradId: 57166, title: 'Метеор-М №2-3', note: 'Солнечно-синхронная' },
  { noradId: 33591, title: 'NOAA-19', note: 'Метеоспутник' },
  { noradId: 25994, title: 'Terra', note: 'Наблюдение Земли' },
  { noradId: 49260, title: 'Landsat 9', note: 'Съёмка поверхности' },
  { noradId: 32275, title: 'ГЛОНАСС', note: 'Средняя орбита, ~19 100 км' },
  { noradId: 52145, title: 'Меридиан-10', note: 'Орбита «Молния», e ≈ 0,68' },
  { noradId: 44903, title: 'Электро-Л №3', note: 'Геостационарная' },
];
