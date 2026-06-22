import { makeDateStamp } from '../utils/notes';
import { ObjectKindDef } from './object-note';

/**
 * The schema of an OBJECT *instance* note — a single member of a kind's set
 * (see CONTEXT.md / .dev/GOAL.md). Where {@link ObjectKindDef} is the contract
 * ("a book has an author and a status"), an instance is a note that obeys it
 * ("*Dune* by Frank Herbert, status: read").
 *
 * An instance carries the kind's `object-tag` (so Obsidian groups the set) and
 * one frontmatter field per declared property, filled with the user's value.
 * Unfilled properties are still written, blank, so the note shows the whole
 * contract for later editing.
 *
 * This module owns what an instance note *is*: its frontmatter and how one is
 * read back. Kept pure (no `App`) so the round-trip is testable with plain
 * values, mirroring {@link object-note}.
 */

/** Frontmatter field names shared by the builder and the reader. */
const FIELD_DATE = 'date';
const FIELD_TAGS = 'tags';
const FIELD_SOURCE = 'source';

/** Origin of the note. Always the user for now (mirrors the other schemas). */
const SOURCE_USER = 'user';

/** A single OBJECT, ready to write: its kind's tag and its property values. */
export interface ObjectInstance {
	/** Tag this instance carries, e.g. `book`. Stored without a `#`. */
	objectTag: string;
	/** Property values keyed by name. Missing keys are treated as blank. */
	properties: Record<string, string>;
}

/**
 * Build the full initial contents of an OBJECT instance note: frontmatter
 * (date, the kind's instance tag, one field per declared property, source)
 * followed by an empty body for the user to write into.
 *
 * `properties` is the kind's declared property list, in order — it fixes which
 * fields are written (and their order), so the note always reflects the full
 * contract even where {@link ObjectInstance.properties} has no value.
 */
export function buildObjectInstanceContents(
	instance: ObjectInstance,
	properties: string[],
): string {
	const tag = instance.objectTag.replace(/^#/, '').trim();
	const lines = [
		'---',
		`${FIELD_DATE}: ${makeDateStamp()}`,
		`${FIELD_TAGS}:`,
		`  - ${tag}`,
	];
	for (const property of properties) {
		const value = instance.properties[property] ?? '';
		lines.push(value.length > 0 ? `${property}: ${yamlScalar(value)}` : `${property}:`);
	}
	lines.push(`${FIELD_SOURCE}: ${SOURCE_USER}`, '---', '');
	return lines.join('\n');
}

/**
 * Recognize and read an OBJECT instance from its frontmatter. Returns the
 * instance's tag and property values when `frontmatter` belongs to a note
 * carrying `def.objectTag`, or `null` otherwise. Every declared property is
 * reported (blank when absent or non-scalar), so a reader always sees the full
 * contract. Tolerates a `tags` value that is either a single string or a list.
 */
export function recognizeObjectInstance(
	frontmatter: Record<string, unknown> | undefined,
	def: ObjectKindDef,
): ObjectInstance | null {
	if (!frontmatter || def.objectTag.length === 0) {
		return null;
	}
	const tags: unknown = frontmatter[FIELD_TAGS];
	const carriesTag = Array.isArray(tags)
		? tags.includes(def.objectTag)
		: tags === def.objectTag;
	if (!carriesTag) {
		return null;
	}
	const properties: Record<string, string> = {};
	for (const property of def.properties) {
		const value: unknown = frontmatter[property];
		properties[property] =
			typeof value === 'string'
				? value
				: typeof value === 'number' || typeof value === 'boolean'
					? String(value)
					: '';
	}
	return { objectTag: def.objectTag, properties };
}

/**
 * Render a string as a YAML scalar, quoting only when the raw value could be
 * misread (contains a colon, `#`, quote, or leading/trailing space). Keeps the
 * common case unquoted to match the plain look of the other note schemas.
 */
function yamlScalar(value: string): string {
	const needsQuote = /[:#"']/.test(value) || value !== value.trim();
	if (!needsQuote) {
		return value;
	}
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
