/**
 * The `#larrys-meta` tag convention. Larry's Brain stores some of its own data
 * inside ordinary vault notes (an OBJECT-kind definition, for instance). Every
 * such note is marked with a tag under the `larrys-meta` namespace so the
 * plugin can recognize its own bookkeeping notes and keep them out of the
 * user's way — in particular, out of search results.
 *
 * The namespace is unlikely to collide with a tag a person would reach for
 * naturally. New meta tags nest under it: `larrys-meta/object-kind`, etc.
 *
 * This module owns the convention so the writer (who tags a note) and the
 * readers (who exclude or recognize one) share a single definition.
 */

/** Root of the namespace for tags Larry's Brain uses to store its own data. */
export const META_TAG = 'larrys-meta';

/**
 * Whether `tag` belongs to the meta namespace — either `larrys-meta` itself or
 * any nested tag like `larrys-meta/object-kind`. A leading `#` is tolerated so
 * the same check works on frontmatter tags (`larrys-meta`) and inline tags
 * (`#larrys-meta`).
 */
export function isMetaTag(tag: string): boolean {
	const t = tag.replace(/^#/, '');
	return t === META_TAG || t.startsWith(`${META_TAG}/`);
}

/**
 * Turn a free-text name into a valid Obsidian tag: strip a leading `#`, lower
 * case it, and collapse whitespace runs into single hyphens (so "skill area"
 * becomes `skill-area`). Tags can't contain spaces, so a kind named with them
 * still yields a usable instance tag.
 */
export function normalizeTag(raw: string): string {
	return raw
		.trim()
		.replace(/^#/, '')
		.toLowerCase()
		.replace(/\s+/g, '-');
}
