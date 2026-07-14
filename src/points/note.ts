import { buildEdgeLine } from '../edge';
import { makeDateStamp } from '../utils/notes';
import { AREA_TAG, ON_EDGE, POINT_TAG } from './constants';

/**
 * The schema of the two system-owned Points note kinds — the **area** hub and
 * the **point** event — kept in one pure module (no `App`) so what each note
 * *is* has a single definition the writer and the readers share, and so the
 * round-trip is testable with plain values (mirroring `memory-note.ts`).
 *
 * Both notes ride the raw typed-edge convention (`edge.ts`) rather than the
 * Object/Set machinery: an area carries `UNDER` edges to its parents (added
 * later, when organizing), a point carries exactly one `ON` edge to its area,
 * baked into the note the moment it's created.
 */

/** Frontmatter field names, shared by the builders and the recognizers. */
const FIELD_DATE = 'date';
const FIELD_TAGS = 'tags';
const FIELD_SOURCE = 'source';

/** Origin of a points note when created through the app (see `memory-note.ts`). */
const SOURCE_USER = 'user';

/**
 * Overrides for how a points note's frontmatter is stamped. Both default to the
 * app's behavior (today's date, `source: user`); the CLI import overrides them to
 * preserve a point's original date and mark the note `source: migration`.
 */
export interface NoteMeta {
	/** Origin recorded in `source`. Defaults to `user` (app-created). */
	source?: string;
	/** `YYYY-MM-DD` date stamp. Defaults to today; set when importing history. */
	date?: string;
}

/**
 * Build the initial contents of an **area** hub note: frontmatter with the date,
 * `#points/area` tag, and source, then a heading. No edges — parentage (`UNDER`)
 * is added later through the organize path, and points link *in* rather than out.
 */
export function buildAreaNoteContents(name: string, meta: NoteMeta = {}): string {
	return `${frontmatter(AREA_TAG, meta)}# ${name}\n`;
}

/**
 * Build the initial contents of a **point** event note: frontmatter with the
 * date, `#points/point` tag, and source, then the single `ON: [[Area]]` edge that
 * lands it on its area. Tiny by design — the note's whole payload is the edge and
 * its timestamp. It can still be linked out to whatever prompted it, by hand or
 * through the relate affordance, later.
 */
export function buildPointNoteContents(
	areaBasename: string,
	meta: NoteMeta = {},
): string {
	return `${frontmatter(POINT_TAG, meta)}${buildEdgeLine(ON_EDGE, areaBasename)}\n`;
}

/**
 * Whether `frontmatter` belongs to an **area** note (carries the `#points/area`
 * tag). Tolerates a `tags` value that is a single string or a list, matching
 * how `memory-note.ts` reads its own tag.
 */
export function isAreaFrontmatter(
	frontmatter: Record<string, unknown> | undefined,
): boolean {
	return hasTag(frontmatter, AREA_TAG);
}

/** Whether `frontmatter` belongs to a **point** note (carries `#points/point`). */
export function isPointFrontmatter(
	frontmatter: Record<string, unknown> | undefined,
): boolean {
	return hasTag(frontmatter, POINT_TAG);
}

/** Whether a note's frontmatter `tags` includes `tag` (string or list form). */
function hasTag(
	frontmatter: Record<string, unknown> | undefined,
	tag: string,
): boolean {
	if (!frontmatter) {
		return false;
	}
	const tags: unknown = frontmatter[FIELD_TAGS];
	return Array.isArray(tags) ? tags.includes(tag) : tags === tag;
}

/** Build a YAML frontmatter block: the date, a single tag, and the source. */
function frontmatter(tag: string, meta: NoteMeta = {}): string {
	return [
		'---',
		`${FIELD_DATE}: ${meta.date ?? makeDateStamp()}`,
		`${FIELD_TAGS}:`,
		`  - ${tag}`,
		`${FIELD_SOURCE}: ${meta.source ?? SOURCE_USER}`,
		'---',
		'',
	].join('\n');
}
