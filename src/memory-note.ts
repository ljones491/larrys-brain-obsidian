import { makeDateStamp } from './utils/notes';

/**
 * The schema of a memory note — a note Larry's Brain captures and later
 * resurfaces. This module is the single owner of what each kind of memory note
 * *is*: the frontmatter fields, the `#search` tag, and how a search note is
 * recognized and read back. Writers build contents here; readers interpret
 * frontmatter here, so the two can never silently drift apart.
 *
 * Kept pure (no `App`) so the round-trip is testable with plain values: the
 * caller fetches a note's frontmatter from `metadataCache` and hands the plain
 * object to {@link recognizeSearchNote}.
 */

/** Frontmatter field names, referenced by both the builders and the reader. */
const FIELD_DATE = 'date';
const FIELD_TAGS = 'tags';
const FIELD_QUERY = 'query';
const FIELD_SOURCE = 'source';

/** Origin of a memory note. Always the user for now (see CONTEXT.md). */
const SOURCE_USER = 'user';

/** Tag that marks a note as a Remember search note. */
export const SEARCH_TAG = 'search';

/** Fields written into the frontmatter of a dump note. */
export interface DumpNoteMeta {
	/** Tag for the note, with or without a leading '#'. */
	tag: string;
	/** Suffix appended to the generated title, e.g. `X - hmm`. */
	titleSuffix: string;
}

/** What a search note records, recovered from its frontmatter. */
export interface SearchNoteInfo {
	/** The query the search note recorded (`''` if the field is absent). */
	query: string;
}

/**
 * Build the full initial contents of a dump note: frontmatter (date, tag,
 * source) followed by the raw captured text. The tag's leading `#` is optional.
 */
export function buildDumpNoteContents(text: string, meta: DumpNoteMeta): string {
	const tag = meta.tag.replace(/^#/, '').trim();
	return `${frontmatter(tag)}${text}`;
}

/**
 * Build the full initial contents of a search note: frontmatter (date,
 * `#search` tag, query, source) followed by an opening body line. The query is
 * recorded in both the frontmatter and the body, and both are written here so
 * they stay in step.
 */
export function buildSearchNoteContents(query: string): string {
	return `${frontmatter(SEARCH_TAG, query)}Search for "${query}".\n\n`;
}

/**
 * Recognize and read a search note from its frontmatter. Returns the recorded
 * query when `frontmatter` belongs to a `#search` note, or `null` otherwise.
 * Tolerates a `tags` value that is either a single string or a list, and a
 * missing `query` (reported as `''`).
 */
export function recognizeSearchNote(
	frontmatter: Record<string, unknown> | undefined,
): SearchNoteInfo | null {
	if (!frontmatter) {
		return null;
	}
	const tags: unknown = frontmatter[FIELD_TAGS];
	const isSearch = Array.isArray(tags)
		? tags.includes(SEARCH_TAG)
		: tags === SEARCH_TAG;
	if (!isSearch) {
		return null;
	}
	const query: unknown = frontmatter[FIELD_QUERY];
	return { query: typeof query === 'string' ? query : '' };
}

/**
 * Build a YAML frontmatter block: the date, a single tag, an optional query,
 * and the source. Shared by both note kinds so the field names and ordering
 * have one definition.
 */
function frontmatter(tag: string, query?: string): string {
	const lines = [
		'---',
		`${FIELD_DATE}: ${makeDateStamp()}`,
		`${FIELD_TAGS}:`,
		`  - ${tag}`,
	];
	if (query !== undefined) {
		lines.push(`${FIELD_QUERY}: ${JSON.stringify(query)}`);
	}
	lines.push(`${FIELD_SOURCE}: ${SOURCE_USER}`, '---', '');
	return lines.join('\n');
}
