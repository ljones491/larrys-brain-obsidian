import { makeDateStamp } from '../utils/notes';
import { ObjectKindDef } from './object-note';
import { yamlScalar } from './object-instance';

/**
 * Promoting a thought to an OBJECT (see .dev/GOAL.md): sometimes a thought note
 * *is* the object, so rather than create a 1-to-1 duplicate the user reshapes the
 * existing note into an instance of a kind — keeping the body verbatim, swapping
 * its memory tag for the kind's instance tag, and populating the kind's declared
 * properties (blank where the note has no value yet).
 *
 * This module owns that transform. It produces the same frontmatter shape as
 * {@link buildObjectInstanceContents} — so a promoted note is recognized by
 * {@link recognizeObjectInstance} — but seeded from the note's existing values
 * instead of created fresh. Kept pure (no `App`) so the round-trip is testable
 * with plain values: the caller reads the file, splits off the body with
 * {@link splitFrontmatter}, hands the parsed frontmatter (from `metadataCache`)
 * and the body here, then writes the result back.
 */

/** Frontmatter field names, mirrored from the instance schema. */
const FIELD_DATE = 'date';
const FIELD_TAGS = 'tags';
const FIELD_SOURCE = 'source';

/** Origin of the note. Always the user for now (mirrors the other schemas). */
const SOURCE_USER = 'user';

/** An existing note about to be promoted: its parsed frontmatter and verbatim body. */
export interface PromotionSource {
	/** Parsed frontmatter values (from `metadataCache`), or undefined when none. */
	frontmatter: Record<string, unknown> | undefined;
	/** The note body, exactly as it should be preserved (everything after the frontmatter). */
	body: string;
}

/** Options controlling how the promotion rewrites the note's tags. */
export interface PromotionOptions {
	/**
	 * A tag to drop while promoting — the memory tag the note is being promoted
	 * *away from* (e.g. the configured `thought`). Any other existing tags are
	 * preserved. With a leading `#` or without.
	 */
	dropTag?: string;
}

/**
 * Build the full contents of a note promoted to an OBJECT instance of `def`.
 *
 * Frontmatter: the note's existing `date` (a fresh stamp when absent); a `tags`
 * list led by the kind's instance tag, dropping `options.dropTag` and de-duping
 * but keeping any other tags the user had; one field per declared property,
 * seeded from a matching existing frontmatter value (numbers/booleans coerced to
 * strings, same as the reader) and left blank otherwise so the whole contract
 * shows; then the existing `source` (defaulting to `user`). The body is appended
 * verbatim.
 *
 * Frontmatter fields outside this known shape are not carried over — a thought
 * note only has date/tags/source, so this is lossless for the intended use.
 */
export function buildPromotedContents(
	source: PromotionSource,
	def: ObjectKindDef,
	options: PromotionOptions = {},
): string {
	const fm = source.frontmatter ?? {};
	const objectTag = def.objectTag.replace(/^#/, '').trim();
	const dropTag = options.dropTag?.replace(/^#/, '').trim();

	const date = typeof fm[FIELD_DATE] === 'string' ? fm[FIELD_DATE] : makeDateStamp();
	const sourceValue = typeof fm[FIELD_SOURCE] === 'string' ? fm[FIELD_SOURCE] : SOURCE_USER;

	const lines = ['---', `${FIELD_DATE}: ${date}`, `${FIELD_TAGS}:`];
	for (const tag of mergeTags(objectTag, fm[FIELD_TAGS], dropTag)) {
		lines.push(`  - ${tag}`);
	}
	for (const property of def.properties) {
		const value = coerceScalar(fm[property]);
		lines.push(value.length > 0 ? `${property}: ${yamlScalar(value)}` : `${property}:`);
	}
	lines.push(`${FIELD_SOURCE}: ${sourceValue}`, '---', '');

	return `${lines.join('\n')}${source.body}`;
}

/**
 * Split a raw note into its body, dropping the leading YAML frontmatter block if
 * present. Returns the whole note as the body when there is no frontmatter. Pure
 * string op so the caller's read-then-write stays the only `App`-dependent part.
 */
export function splitFrontmatter(raw: string): { body: string } {
	const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(raw);
	return { body: match ? raw.slice(match[0].length) : raw };
}

/**
 * Build the promoted tags list: the instance tag first, then the note's existing
 * tags (single string or list), minus `dropTag` and the instance tag itself, with
 * `#` stripped and duplicates removed.
 */
function mergeTags(objectTag: string, existing: unknown, dropTag: string | undefined): string[] {
	const candidates: unknown[] = Array.isArray(existing)
		? existing
		: typeof existing === 'string'
			? [existing]
			: [];
	const tags: string[] = [];
	for (const raw of [objectTag, ...candidates]) {
		if (typeof raw !== 'string') {
			continue;
		}
		const tag = raw.replace(/^#/, '').trim();
		if (tag.length === 0 || tag === dropTag || tags.includes(tag)) {
			continue;
		}
		tags.push(tag);
	}
	return tags;
}

/** Read a frontmatter value as a string, coercing numbers/booleans like the reader. */
function coerceScalar(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return '';
}
