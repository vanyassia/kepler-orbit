import { POPULAR_SATELLITES } from '../data/popular';
import type { OrbitalElements } from '../physics/propagate';

/** Русское название для популярных спутников, иначе — название из каталога. */
export function satelliteTitle(el: OrbitalElements): { title: string; subtitle: string | null } {
  const popular = POPULAR_SATELLITES.find((p) => p.noradId === el.noradId);
  return popular ? { title: popular.title, subtitle: el.name } : { title: el.name, subtitle: null };
}
