import { META_FOLDER } from '../meta';

/**
 * Points — the system-owned note kind that subsumes the Points CLI into the
 * vault. This module owns every literal the Points feature is built from (tags,
 * edge types, folders, name matching), mirroring how `meta.ts` and `edge.ts`
 * own their magic strings: change a literal here, never at a call site.
 *
 * Points is *not* an Object/Set — it has a fixed structure and fixed edge
 * semantics, so it rides the raw typed-edge convention (`edge.ts`) directly
 * rather than the user-authored schema machinery in `object.ts`.
 *
 * The pieces here are pure (no `App`), so name matching is unit-testable with
 * plain strings; the vault I/O that uses these constants lives in the Points
 * shell.
 */

/** Tag marking an **area** note — a linkable, searchable hub. */
export const AREA_TAG = 'points/area';

/** Tag marking a **point** note — a tiny, timestamped focus event. */
export const POINT_TAG = 'points/point';

/** Edge from a child area up to a parent area: `UNDER: [[Parent area]]`. */
export const UNDER_EDGE = 'UNDER';

/** Edge from a point to the area it lands on: `ON: [[Area]]`. */
export const ON_EDGE = 'ON';

/**
 * Home for **point** event notes. Under the meta folder so `search-index.ts`
 * excludes them by location (`isInMetaFolder`) — they are numerous and tiny and
 * would be BM25 noise. They stay in the graph and in backlinks regardless.
 */
export const POINTS_FOLDER = `${META_FOLDER}/points`;

/**
 * Home for **area** hub notes. Deliberately *outside* the meta folder so areas
 * stay searchable and freely linkable — the core power the vault buys over the
 * CLI. GOAL.md's prose files areas under the meta tree too, but that folder is
 * excluded from search wholesale; keeping areas searchable is the stronger,
 * explicit requirement, so areas live in their own searchable folder instead.
 */
export const AREAS_FOLDER = 'points';

/**
 * Fold an area name to its **matching identity**: trimmed, internal whitespace
 * collapsed, lower-cased. "Dishes", " dishes ", and "DISHES" all match the same
 * area, so a casing or spacing slip can't silently fork a duplicate. This is a
 * comparison key only — the note keeps the name the user typed as its display
 * title.
 */
export function normalizeAreaName(raw: string): string {
	return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}
