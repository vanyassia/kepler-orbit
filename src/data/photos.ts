/**
 * Снимки аппаратов для маленькой миниатюры в боковой панели. Все снимки — со свободной лицензией
 * с Wikimedia Commons, у каждого указаны автор и лицензия (это обязательное условие лицензий CC BY и CC BY-SA).
 * Файлы лежат в public/photos: <image>.webp — крупный снимок (до 720 px), <image>-s.webp — миниатюра.
 * Скачать заново: npm run fetch:photos (scripts/fetch-photos.mjs берёт список отсюда).
 *
 * Настоящих снимков на орбите мало, поэтому у каждого снимка помечено, что на нём:
 * фото, макет на выставке, рисунок или почтовая марка. Если снимок однотипного аппарата — так и написано.
 * У своих спутников снимков нет; у кого свободного снимка не нашлось (Меридиан, Ямал-601, Экспресс-АМУ1,
 * Скиф-Д, Аист-2Т, AO-7, Фобос-2), миниатюры просто нет.
 */
import type { BodyId } from '../physics/bodies';

export type PhotoKind = 'photo' | 'model' | 'render' | 'stamp';

export interface SatellitePhoto {
  /** Имя файла в public/photos без расширения. Один снимок может служить нескольким аппаратам. */
  image: string;
  /** Имя файла на Wikimedia Commons: оттуда снимок скачан, там его страница с лицензией. */
  commons: string;
  kind: PhotoKind;
  /** Что на снимке, по-русски. */
  caption: string;
  author: string;
  license: string;
}

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  photo: 'Фото',
  model: 'Макет',
  render: 'Рисунок',
  stamp: 'Почтовая марка',
};

const NASA = 'NASA';
const PD = 'Общественное достояние';

// Снимки, которыми пользуются несколько аппаратов
const METEOR: SatellitePhoto = { image: 'meteor-m', commons: 'Meteor-M_2.jpeg', kind: 'render', caption: 'Аппарат серии «Метеор-М» №2 — однотипный', author: 'El Salvador', license: 'CC0' };
const RESURS: SatellitePhoto = { image: 'resurs-p', commons: 'MAKS_Airshow_2013_(Ramenskoye_Airport,_Russia)_(525-06).jpg', kind: 'model', caption: 'Макет «Ресурс-П» на авиасалоне МАКС-2013', author: 'Vitaly V. Kuzmin', license: 'CC BY-SA 4.0' };
const ELEKTRO: SatellitePhoto = { image: 'elektro-l', commons: 'Electro-L_Cebit_2011.jpg', kind: 'model', caption: 'Макет «Электро-Л» на выставке CeBIT, 2011', author: 'MKonair', license: 'CC BY-SA 2.0' };
const THEMIS: SatellitePhoto = { image: 'themis', commons: 'Five_Themis_satellites_seen_from_above.jpg', kind: 'photo', caption: 'Пять аппаратов THEMIS перед запуском, 2007; ARTEMIS-P1 и P2 — два из них', author: 'NASA / George Shelton', license: PD };

/** Ключ — тело и номер спутника (NORAD у Земли, NAIF у Луны и Марса): номера разных тел могут совпасть. */
export const PHOTOS: Record<string, SatellitePhoto> = {
  // Станции и телескопы
  'earth:25544': { image: 'iss', commons: 'The_station_pictured_from_the_SpaceX_Crew_Dragon_5.jpg', kind: 'photo', caption: 'МКС, снятая с корабля Crew Dragon, 2021', author: NASA, license: PD },
  'earth:48274': { image: 'tiangong', commons: 'Chinese_Tiangong_Space_Station.jpg', kind: 'render', caption: 'Станция «Тяньгун» в полном составе', author: 'Shujianyang', license: 'CC BY-SA 4.0' },
  'earth:20580': { image: 'hubble', commons: 'Hubble_2009_close-up_2.jpg', kind: 'photo', caption: 'Хаббл, снятый с шаттла «Атлантис», 2009', author: NASA, license: PD },
  'earth:25867': { image: 'chandra', commons: 'Chandra_artist_illustration.jpg', kind: 'render', caption: 'Рентгеновская обсерватория «Чандра»', author: 'NASA / CXC / NGST', license: PD },
  'earth:25989': { image: 'xmm-newton', commons: 'XMM-Newton_spacecraft_model.png', kind: 'render', caption: 'XMM-Newton в полёте', author: 'ESA', license: 'CC BY-SA 3.0 IGO' },
  'earth:33053': { image: 'fermi', commons: 'Fermi_Gamma-ray_Space_Telescope_spacecraft_model.png', kind: 'render', caption: 'Гамма-телескоп «Ферми»', author: NASA, license: PD },
  'earth:301': { image: 'moon', commons: 'FullMoon2010.jpg', kind: 'photo', caption: 'Полная Луна, снимок в телескоп с Земли, 2010', author: 'Gregory H. Revera', license: 'CC BY-SA 3.0' },

  // Исторические полёты
  'earth:-9611': { image: 'vostok', commons: 'Vostok_spacecraft.jpg', kind: 'model', caption: 'Макет корабля «Восток» на выставке «Россия в космосе», Франкфурт, 2002', author: 'HPH', license: 'CC BY-SA 3.0' },
  'earth:-9571': { image: 'sputnik-1', commons: 'Sputnik_asm.jpg', kind: 'model', caption: 'Копия Спутника-1 в Национальном музее авиации и космонавтики США', author: 'NSSDC, NASA', license: PD },

  // Россия: Земля и погода
  'earth:57166': METEOR,
  'earth:59051': METEOR,
  'earth:44387': METEOR,
  'earth:62430': RESURS,
  'earth:59371': RESURS,
  'earth:43180': { image: 'kanopus-v', commons: 'Kanopus-V_КА_Канопус-В.jpg', kind: 'render', caption: 'Аппарат «Канопус-В»', author: 'El Salvador', license: 'CC0' },
  'earth:67234': { image: 'obzor-r', commons: 'Obzor-R_satellite.jpg', kind: 'model', caption: 'Макет «Обзор-Р» на выставке «Россия»', author: 'F.Alexsandr', license: 'CC BY 4.0' },
  'earth:56756': { image: 'kondor', commons: '"Kondor-E"_reconnaissance_satellite_on_MAKS-2021_airshow.jpg', kind: 'model', caption: 'Макет «Кондор-Э» (экспортный вариант «Кондора») на МАКС-2021', author: 'Kirill Borisenko', license: 'CC BY-SA 4.0' },
  'earth:61735': { image: 'ionosfera-m', commons: 'Макет_космического_аппарата_«Ионосфера-М»_перспективного_проекта_«Ионозонд»,_ИКИ_РАН.jpg', kind: 'model', caption: 'Макет «Ионосферы-М» на выставке ИКИ РАН', author: 'TanyaIKIRAS', license: 'CC BY 4.0' },
  'earth:55506': ELEKTRO,
  'earth:67756': ELEKTRO,
  'earth:47719': { image: 'arktika-m', commons: 'Арктика-М.jpg', kind: 'model', caption: 'Макет «Арктики-М» на выставке «Армия-2023»', author: 'Vsatinet', license: 'CC BY-SA 4.0' },

  // Россия: связь и навигация
  'earth:32275': { image: 'glonass-m', commons: 'Glonass-M_small._CeBIT_2011_Samstag_PD_110.jpg', kind: 'model', caption: 'Макет «Глонасс-М» на выставке CeBIT, 2011', author: 'Bin im Garten', license: 'CC BY-SA 3.0' },
  'earth:52984': { image: 'glonass-k', commons: 'CeBit_2011_-_Glosnass-K_Satellite_Model_11.jpg', kind: 'model', caption: 'Макет «Глонасс-К» в натуральную величину, CeBIT, 2011', author: 'Patrick G.', license: 'CC BY-SA 2.0' },
  'earth:57517': { image: 'glonass-k2', commons: 'Глонасс-К2.jpg', kind: 'model', caption: 'Макет «Глонасс-К2» на выставке «Армия-2023»', author: 'Vsatinet', license: 'CC BY-SA 4.0' },
  'earth:39487': { image: 'express-am5', commons: 'Express-AM5_Satellite_with_stars.jpg', kind: 'model', caption: 'Макет «Экспресс-АМ5», Мадрид, 2011', author: 'Andrzej Olchawa', license: 'CC BY-SA 2.0' },
  'earth:54150': { image: 'gonets-m', commons: 'Gonets-M-Salon-du-Bourget-2013-DSC_0043.jpg', kind: 'model', caption: 'Макет «Гонец-М», авиасалон в Ле Бурже, 2013', author: 'Pline', license: 'CC BY-SA 3.0' },
  'earth:37755': { image: 'spektr-r', commons: 'RIAN_archive_930415_Russian_Spektr_R_space-born_radio_telescope.jpg', kind: 'photo', caption: 'Радиотелескоп «Спектр-Р» в цеху перед запуском', author: 'Олег Урусов / РИА Новости', license: 'CC BY-SA 3.0' },

  // Мир: Земля и погода
  'earth:25994': { image: 'terra', commons: 'Terra_spacecraft_model.png', kind: 'render', caption: 'Terra', author: NASA, license: PD },
  'earth:27424': { image: 'aqua', commons: 'Aqua_spacecraft_model.png', kind: 'render', caption: 'Aqua', author: NASA, license: PD },
  'earth:49260': { image: 'landsat-9', commons: 'LANDSAT-9.jpg', kind: 'render', caption: 'Landsat 9 над Землёй', author: 'NASA / Goddard', license: PD },
  'earth:40697': { image: 'sentinel-2', commons: 'Sentinel_2-IMG_5873-white_(crop).jpg', kind: 'model', caption: 'Макет Sentinel-2', author: 'Rama', license: 'CC BY-SA 2.0 FR' },
  'earth:39634': { image: 'sentinel-1', commons: 'Sentinel_1-IMG_5874-gradient.jpg', kind: 'model', caption: 'Макет Sentinel-1 (без антенны радара)', author: 'Rama', license: 'CC BY-SA 2.0 FR' },
  'earth:43613': { image: 'icesat-2', commons: 'ICESat-2_concept_illustration.jpg', kind: 'render', caption: 'ICESat-2', author: 'NASA / Goddard', license: PD },
  'earth:41240': { image: 'jason-3', commons: 'Jason-3_2015_illustration_(crop).jpg', kind: 'render', caption: 'Jason-3', author: 'NASA / JPL-Caltech', license: PD },
  'earth:33591': { image: 'noaa-19', commons: "NOAA-N'_satellite_in_Vandenberg_AFB_clean_room.jpg", kind: 'photo', caption: 'NOAA-19 (NOAA-N Prime) в цеху перед запуском', author: NASA, license: PD },
  'earth:54234': { image: 'noaa-21', commons: "Artist's_rendering_of_NOAA-21.png", kind: 'render', caption: 'NOAA-21 на орбите', author: 'NOAA', license: PD },
  'earth:43689': { image: 'metop', commons: 'MetOp-A_&_-B_spacecraft_model.png', kind: 'render', caption: 'Аппарат серии MetOp — однотипный', author: NASA, license: PD },
  'earth:60133': { image: 'goes-19', commons: 'GOES-U_night_(53390148447).png', kind: 'render', caption: 'GOES-19 (до запуска — GOES-U)', author: 'NOAA / Lockheed Martin', license: PD },
  'earth:41836': { image: 'himawari', commons: 'Himawari89_2.jpg', kind: 'render', caption: 'Однотипные «Химавари-8» и «Химавари-9»', author: 'Японское метеорологическое агентство', license: 'CC BY 4.0' },
  'earth:40732': { image: 'meteosat-11', commons: 'MSG-4_satellite_being_prepared_for_launch.jpg', kind: 'photo', caption: 'Meteosat-11 (MSG-4) перед запуском', author: 'ESA', license: 'CC BY-SA 2.0' },

  // Мир: навигация и связь
  'earth:43873': { image: 'gps-3', commons: 'GPS_Block_IIIA.jpg', kind: 'render', caption: 'Спутник GPS III на орбите', author: 'ВВС США', license: PD },
  'earth:40544': { image: 'galileo', commons: 'Galileo_satellite_model.jpg', kind: 'model', caption: 'Модель спутника Galileo первой серии', author: 'Science Museum Group', license: 'CC BY 4.0' },
  'earth:43001': { image: 'beidou-3', commons: 'Beidou-3_Satellite_Mockup.jpg', kind: 'model', caption: 'Макет спутника «Бэйдоу-3»', author: 'AKAMGO yalms', license: 'CC BY-SA 4.0' },
  'earth:53544': { image: 'starlink', commons: 'Starlink_Mission_(47926144123).jpg', kind: 'photo', caption: 'Связка спутников Starlink перед отделением от ракеты', author: 'SpaceX', license: 'CC0' },
  'earth:44057': { image: 'oneweb', commons: 'KSC-20170316-PH_KLS01_0007~orig.jpg', kind: 'model', caption: 'Модель спутника OneWeb, 2017', author: 'NASA / Kim Shiflett', license: PD },
  'earth:43922': { image: 'iridium', commons: 'Iridium_satellite.jpg', kind: 'model', caption: 'Спутник Iridium первого поколения в музее', author: 'ideonexus', license: 'CC BY-SA 2.0' },

  // История
  'earth:5': { image: 'vanguard-1', commons: 'Vanguard_1.jpg', kind: 'photo', caption: 'Авангард-1', author: NASA, license: PD },
  'earth:340': { image: 'telstar-1', commons: 'Telstar_1_replica.jpg', kind: 'model', caption: 'Копия «Телстара-1» в Музее науки, Лондон', author: 'Science Museum Group', license: 'CC BY 4.0' },
  'earth:27386': { image: 'envisat', commons: 'Envisatmod.jpg', kind: 'model', caption: 'Макет Envisat в натуральную величину', author: 'abrev', license: PD },

  // Луна
  'moon:-85': { image: 'lro', commons: 'Lunar_Reconnaissance_Orbiter_001.jpg', kind: 'render', caption: 'LRO над Луной', author: NASA, license: PD },
  'moon:-152': { image: 'chandrayaan-2', commons: 'GSLV_Mk_III_M1,_Chandrayaan-2_-_Vikram_lander_mounted_on_top_of_orbiter.jpg', kind: 'photo', caption: 'Чандраян-2 перед запуском: посадочный модуль «Викрам» на орбитальном', author: 'ISRO', license: 'GODL-India' },
  'moon:-155': { image: 'danuri', commons: 'Kplo_rendered_image.png', kind: 'render', caption: 'Danuri', author: 'Министерство науки и ИКТ Кореи', license: 'KOGL Type 1' },
  'moon:-192': THEMIS,
  'moon:-193': THEMIS,
  'moon:-86': { image: 'chandrayaan-1', commons: 'CY1_2007_(cropped).jpg', kind: 'render', caption: 'Чандраян-1', author: 'ISRO / VSSC', license: 'GODL-India' },

  // Марс
  'mars:-74': { image: 'mro', commons: "Mars_Reconnaissance_Orbiter,_front_view,_artist's_concept_(PIA07245).jpg", kind: 'render', caption: 'MRO над Марсом', author: 'NASA / JPL / Corby Waste', license: PD },
  'mars:-143': { image: 'tgo', commons: 'ExoMars_Trace_Gas_Orbiter_Model_at_ESOC.JPG', kind: 'model', caption: 'Макет TGO в центре управления ЕКА, Дармштадт', author: 'Gerbil', license: 'CC BY-SA 4.0' },
  'mars:-53': { image: 'mars-odyssey', commons: 'Mars_Odyssey_spacecraft_model.png', kind: 'render', caption: 'Mars Odyssey', author: NASA, license: PD },
  'mars:-41': { image: 'mars-express', commons: 'Mars_Express.jpg', kind: 'render', caption: 'Mars Express', author: 'ESA', license: 'CC BY-SA 3.0 IGO' },
  'mars:-62': { image: 'hope', commons: 'Emirates_Mars_Mission_mockup_at_IAC_2021_01_(cropped).jpg', kind: 'model', caption: 'Макет зонда Hope («Аль-Амаль»), Дубай, 2021', author: 'BugWarp', license: 'CC BY-SA 4.0' },
  'mars:-202': { image: 'maven', commons: 'The_MAVEN_spacecraft_and_the_limb_of_Mars.jpg', kind: 'render', caption: 'MAVEN над Марсом', author: NASA, license: PD },
  'mars:-3': { image: 'mangalyaan', commons: 'Mars_Orbiter_Mission_Over_Mars_(15237158879).jpg', kind: 'render', caption: 'Mangalyaan над Марсом', author: 'Kevin Gill', license: 'CC BY-SA 2.0' },
  'mars:401': { image: 'phobos', commons: 'Phobos_colour_2008.jpg', kind: 'photo', caption: 'Фобос, снимок MRO, 2008', author: 'NASA / JPL-Caltech / University of Arizona', license: PD },
  'mars:402': { image: 'deimos', commons: 'NASA-Deimos-MarsMoon-20090221.jpg', kind: 'photo', caption: 'Деймос, снимок MRO, 2009', author: 'NASA / JPL / University of Arizona', license: PD },
  'mars:-9711': { image: 'mars-2', commons: '1972_CPA_4113.jpg', kind: 'stamp', caption: 'СССР, 1972: станция «Марс-2» у планеты', author: 'Почта СССР', license: PD },
  'mars:-9712': { image: 'mars-3', commons: '1972_CPA_4114.jpg', kind: 'stamp', caption: 'СССР, 1972: спускаемый аппарат «Марса-3»', author: 'Почта СССР', license: PD },
  'mars:-9741': { image: 'mars-5', commons: 'Mars_4-5.jpg', kind: 'photo', caption: 'Однотипный «Марс-4»', author: NASA, license: PD },
};

/** Снимок аппарата или null, если его нет (свой спутник, не нашлось свободного снимка). */
export function photoFor(body: BodyId | undefined, id: number): SatellitePhoto | null {
  return PHOTOS[`${body ?? 'earth'}:${id}`] ?? null;
}

/** Адрес файла снимка: крупный или миниатюра. */
export function photoUrl(photo: SatellitePhoto, size: 'full' | 'small', base = import.meta.env.BASE_URL): string {
  return `${base}photos/${photo.image}${size === 'small' ? '-s' : ''}.webp`;
}

/** Страница снимка на Wikimedia Commons: там автор, лицензия и оригинал. */
export function photoSourceUrl(photo: SatellitePhoto): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(photo.commons)}`;
}
