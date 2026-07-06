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

/**
 * Compose an OBJECT instance tag from an optional domain and a kind, both bare
 * (no `#`). A domain adds a middle level — `media` + `book` → `object/media/book`
 * — so kinds can be grouped: the parent `object/media` tag then targets every
 * kind in that domain at once (one graph color group, one Bases filter). A blank
 * domain yields the flat `object/book`, so ungrouped kinds keep their old tag.
 *
 * The tag *is* the source of truth for a kind's domain — there is no separate
 * field — so this and {@link parseObjectTag} are the single round-trip both the
 * writer and the reader share.
 */
export function buildObjectTag(domain: string, kind: string): string {
	const d = domain.trim().replace(/^#/, '').trim();
	const k = kind.trim().replace(/^#/, '').trim();
	return d.length > 0 ? `${OBJECT_NAMESPACE}/${d}/${k}` : `${OBJECT_NAMESPACE}/${k}`;
}

/**
 * Split an OBJECT instance tag back into its domain and kind. Drops the leading
 * `object` namespace, treats the final `/` segment as the kind and everything
 * between as the domain (blank when the kind sits directly under the namespace):
 * `object/media/book` → `{ domain: 'media', kind: 'book' }`, `object/book` →
 * `{ domain: '', kind: 'book' }`. The inverse of {@link buildObjectTag}.
 */
export function parseObjectTag(objectTag: string): { domain: string; kind: string } {
	const segments = objectTag.replace(/^#/, '').trim().split('/');
	if (segments[0] === OBJECT_NAMESPACE) {
		segments.shift();
	}
	const kind = segments.pop() ?? '';
	return { domain: segments.join('/'), kind };
}

/**
 * Rewrite a note's `tags` value, replacing `oldTag` with `newTag` and leaving the
 * rest as they are. Accepts the frontmatter shapes Obsidian reports — a list, a
 * single string, or nothing — and always returns a clean list: each tag stripped
 * of a leading `#` and trimmed, blanks and duplicates dropped. The primitive
 * behind moving a kind into (or out of) a domain, where every instance's tag has
 * to swap from `object/book` to `object/media/book`.
 */
export function replaceTagInList(tags: unknown, oldTag: string, newTag: string): string[] {
	const from = oldTag.replace(/^#/, '').trim();
	const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? [tags] : [];
	const out: string[] = [];
	for (const raw of list) {
		if (typeof raw !== 'string') {
			continue;
		}
		const tag = raw.replace(/^#/, '').trim();
		const mapped = tag === from ? newTag : tag;
		if (mapped.length > 0 && !out.includes(mapped)) {
			out.push(mapped);
		}
	}
	return out;
}

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
