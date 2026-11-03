import { POPULAR_SATELLITES } from '../data/popular';
import type { OrbitalElements } from '../physics/propagate';

/** Русское название для популярных спутников, иначе — название из каталога. */
export function satelliteTitle(el: OrbitalElements): { title: string; subtitle: string | null } {
  const popular = POPULAR_SATELLITES.find((p) => p.noradId === el.noradId);
  if (!popular) return { title: el.name, subtitle: null };
  return { title: popular.title, subtitle: el.name === popular.title ? null : el.name };
}
