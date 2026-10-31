/**
 * Быстрый выбор известных спутников Земли. Номера NORAD сверены с каталогом CelesTrak.
 * Группы идут в порядке показа; featured — короткий список в боковой панели.
 */
export interface PopularSatellite {
  noradId: number;
  /** Название по-русски для интерфейса. */
  title: string;
  /** Короткая подпись: чем интересна орбита. */
  note: string;
  /** Показывать в свёрнутом списке боковой панели. */
  featured?: boolean;
}

export interface PopularGroup {
  label: string;
  satellites: PopularSatellite[];
}

export const POPULAR_GROUPS: PopularGroup[] = [
  {
    label: 'Станции и телескопы',
    satellites: [
      { noradId: 25544, title: 'МКС', note: 'Низкая орбита, i ≈ 51,6°', featured: true },
      { noradId: 48274, title: 'Тяньгун', note: 'Китайская станция', featured: true },
      { noradId: 20580, title: 'Хаббл', note: 'Телескоп, i ≈ 28,5°', featured: true },
      { noradId: 25867, title: 'Чандра', note: 'Рентгеновский телескоп, e ≈ 0,76' },
      { noradId: 25989, title: 'XMM-Newton', note: 'Рентгеновский телескоп, e ≈ 0,46' },
      { noradId: 33053, title: 'Ферми', note: 'Гамма-телескоп, i ≈ 25,6°' },
    ],
  },
  {
    label: 'Россия: Земля и погода',
    satellites: [
      { noradId: 57166, title: 'Метеор-М №2-3', note: 'Метеоспутник, солнечно-синхронная', featured: true },
      { noradId: 59051, title: 'Метеор-М №2-4', note: 'Метеоспутник, солнечно-синхронная' },
      { noradId: 44387, title: 'Метеор-М №2-2', note: 'Метеоспутник, солнечно-синхронная' },
      { noradId: 62430, title: 'Ресурс-П №5', note: 'Детальная съёмка Земли', featured: true },
      { noradId: 59371, title: 'Ресурс-П №4', note: 'Детальная съёмка Земли' },
      { noradId: 43180, title: 'Канопус-В №3', note: 'Съёмка Земли' },
      { noradId: 67234, title: 'Обзор-Р №1', note: 'Радиолокационная съёмка' },
      { noradId: 56756, title: 'Кондор-ФКА №1', note: 'Радиолокационная съёмка' },
      { noradId: 67253, title: 'Аист-2Т №1', note: 'Стереосъёмка парой аппаратов' },
      { noradId: 61735, title: 'Ионосфера-М №1', note: 'Исследование ионосферы' },
      { noradId: 55506, title: 'Электро-Л №4', note: 'Метеоспутник, геостационарная', featured: true },
      { noradId: 67756, title: 'Электро-Л №5', note: 'Метеоспутник, геостационарная' },
      { noradId: 47719, title: 'Арктика-М №1', note: 'Погода над Арктикой, e ≈ 0,73' },
    ],
  },
  {
    label: 'Россия: связь и навигация',
    satellites: [
      { noradId: 32275, title: 'ГЛОНАСС-М', note: 'Космос-2433, средняя орбита ~19 100 км', featured: true },
      { noradId: 52984, title: 'ГЛОНАСС-К', note: 'Космос-2557, средняя орбита' },
      { noradId: 57517, title: 'ГЛОНАСС-К2', note: 'Космос-2569, средняя орбита' },
      { noradId: 52145, title: 'Меридиан-10', note: 'Орбита «Молния», e ≈ 0,68', featured: true },
      { noradId: 39487, title: 'Экспресс-АМ5', note: 'Связь, геостационарная' },
      { noradId: 41191, title: 'Экспресс-АМУ1', note: 'Связь, геостационарная' },
      { noradId: 44307, title: 'Ямал-601', note: 'Связь, геостационарная' },
      { noradId: 54150, title: 'Гонец-М №23', note: 'Связь, орбита ~1500 км' },
      { noradId: 54153, title: 'Скиф-Д', note: 'Демонстратор связи, орбита ~8000 км' },
      { noradId: 37755, title: 'Спектр-Р', note: 'Радиоастрон, e ≈ 0,93' },
    ],
  },
  {
    label: 'Мир: Земля и погода',
    satellites: [
      { noradId: 25994, title: 'Terra', note: 'Наблюдение Земли', featured: true },
      { noradId: 27424, title: 'Aqua', note: 'Наблюдение Земли' },
      { noradId: 49260, title: 'Landsat 9', note: 'Съёмка поверхности' },
      { noradId: 40697, title: 'Sentinel-2A', note: 'Съёмка поверхности' },
      { noradId: 39634, title: 'Sentinel-1A', note: 'Радиолокационная съёмка' },
      { noradId: 43613, title: 'ICESat-2', note: 'Лазерная высотометрия льдов' },
      { noradId: 41240, title: 'Jason-3', note: 'Высота поверхности океана' },
      { noradId: 33591, title: 'NOAA-19', note: 'Метеоспутник' },
      { noradId: 54234, title: 'NOAA-21', note: 'Метеоспутник' },
      { noradId: 43689, title: 'MetOp-C', note: 'Европейский метеоспутник' },
      { noradId: 60133, title: 'GOES-19', note: 'Метеоспутник, геостационарная' },
      { noradId: 41836, title: 'Himawari-9', note: 'Метеоспутник, геостационарная' },
      { noradId: 40732, title: 'Meteosat-11', note: 'Метеоспутник, геостационарная' },
    ],
  },
  {
    label: 'Мир: навигация и связь',
    satellites: [
      { noradId: 43873, title: 'GPS III', note: 'NAVSTAR 77, средняя орбита', featured: true },
      { noradId: 40544, title: 'Galileo', note: 'GSAT0203, средняя орбита' },
      { noradId: 43001, title: 'BeiDou-3', note: 'M1, средняя орбита' },
      { noradId: 53544, title: 'Starlink', note: 'STARLINK-4303, спутниковый интернет', featured: true },
      { noradId: 44057, title: 'OneWeb', note: 'Связь, орбита ~1200 км' },
      { noradId: 43922, title: 'Iridium', note: 'Связь, почти полярная орбита' },
    ],
  },
  {
    label: 'История',
    satellites: [
      { noradId: 5, title: 'Авангард-1', note: 'Старейший спутник на орбите, 1958' },
      { noradId: 340, title: 'Телстар-1', note: 'Спутник связи, запущен в 1962' },
      { noradId: 7530, title: 'AO-7', note: 'Радиолюбительский спутник, 1974' },
      { noradId: 27386, title: 'Envisat', note: 'Крупный недействующий спутник ЕКА' },
    ],
  },
];

export const POPULAR_SATELLITES: PopularSatellite[] = POPULAR_GROUPS.flatMap((g) => g.satellites);
