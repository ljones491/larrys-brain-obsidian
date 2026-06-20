import { makeDateStamp } from '../utils/notes';
import { META_TAG } from '../meta';

/**
 * The schema of an OBJECT-kind definition note.
 *
 * An OBJECT is a structured note that obeys a contract and belongs to a set
 * (see CONTEXT.md / .dev/GOAL.md). The *kinds* of OBJECT — book, artist, skill
 * area — are not baked into this plugin: the user conjures a kind on request
 * and decides which properties it allows. So a kind's contract lives in the
 * vault as its own note, tagged `larrys-meta/object-kind`, whose frontmatter
 * declares the tag its instances carry and the properties they may set.
 *
 * This module is the single owner of what that definition note *is*: the
 * frontmatter fields and how one is recognized and read back. Kept pure (no
 * `App`) so the round-trip is testable with plain values — a caller fetches the
 * note's frontmatter from `metadataCache` and hands the plain object to
 * {@link recognizeObjectKind}.
 */

/** Frontmatter field names, referenced by both the builder and the reader. */
const FIELD_DATE = 'date';
const FIELD_TAGS = 'tags';
const FIELD_OBJECT_TAG = 'object-tag';
const FIELD_PROPERTIES = 'properties';
const FIELD_SOURCE = 'source';

/** Origin of the note. Always the user for now (mirrors the memory-note schema). */
const SOURCE_USER = 'user';

/** Tag marking a note as an OBJECT-kind definition. Nested under the meta namespace. */
export const OBJECT_KIND_TAG = `${META_TAG}/object-kind`;

/**
 * Namespace every OBJECT instance tag nests under, so `book` becomes
 * `object/book`. Lets the graph (and any query) target *all* objects at once via
 * the `object` parent tag, separate from the user's free-form tags.
 */
export const OBJECT_NAMESPACE = 'object';

/** A kind's contract: the tag its instances carry and the properties they may set. */
export interface ObjectKindDef {
	/** Tag that instances of this kind carry, e.g. `book`. Stored without a `#`. */
	objectTag: string;
	/** Property names instances of this kind may declare, in declared order. */
	properties: string[];
}

/**
 * Build the full initial contents of an OBJECT-kind definition note:
 * frontmatter (date, the `larrys-meta/object-kind` tag, the instance tag, the
 * allowed properties, source) followed by a one-line description.
 */
export function buildObjectKindContents(def: ObjectKindDef): string {
	const tag = def.objectTag.replace(/^#/, '').trim();
	const lines = [
		'---',
		`${FIELD_DATE}: ${makeDateStamp()}`,
		`${FIELD_TAGS}:`,
		`  - ${OBJECT_KIND_TAG}`,
		`${FIELD_OBJECT_TAG}: ${tag}`,
	];
	if (def.properties.length > 0) {
		lines.push(`${FIELD_PROPERTIES}:`);
		for (const property of def.properties) {
			lines.push(`  - ${property}`);
		}
	} else {
		lines.push(`${FIELD_PROPERTIES}: []`);
	}
	lines.push(`${FIELD_SOURCE}: ${SOURCE_USER}`, '---', '');
	// Show the bare kind name in the description, not the namespaced tag.
	const name = tag.split('/').pop() ?? tag;
	return `${lines.join('\n')}Defines the **${name}** object kind.\n`;
}

/**
 * Recognize and read an OBJECT-kind definition from its frontmatter. Returns the
 * kind's contract when `frontmatter` belongs to an `larrys-meta/object-kind`
 * note, or `null` otherwise. Tolerates a `tags` value that is either a single
 * string or a list, a missing `object-tag` (reported as `''`), and missing or
 * malformed `properties` (reported as `[]`).
 */
export function recognizeObjectKind(
	frontmatter: Record<string, unknown> | undefined,
): ObjectKindDef | null {
	if (!frontmatter) {
		return null;
	}
	const tags: unknown = frontmatter[FIELD_TAGS];
	const isKind = Array.isArray(tags)
		? tags.includes(OBJECT_KIND_TAG)
		: tags === OBJECT_KIND_TAG;
	if (!isKind) {
		return null;
	}
	const objectTag: unknown = frontmatter[FIELD_OBJECT_TAG];
	const properties: unknown = frontmatter[FIELD_PROPERTIES];
	return {
		objectTag: typeof objectTag === 'string' ? objectTag : '',
		properties: Array.isArray(properties)
			? properties.filter((p): p is string => typeof p === 'string')
			: [],
	};
}
