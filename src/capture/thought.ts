import { App, TFile } from 'obsidian';
import { isInMetaFolder, isMetaTag, normalizeTag } from '../meta';

/**
 * Whether a note is a loose *thought* — a Larry Write dump that hasn't been
 * promoted into an OBJECT. Recognized by its configured memory tag (`thought`
 * by default) in the frontmatter `tags`, tolerating a single string or a list.
 * A note carrying any `larrys-meta` tag is never a thought, so the plugin's own
 * bookkeeping notes can't be surfaced by mistake.
 *
 * The thought-side mirror of {@link recognizeObjectInstance}: where that reads a
 * structured object back, this just answers membership in the unstructured
 * thought pool. Kept pure (no `App`) so it's testable with plain frontmatter.
 */
export function isThoughtNote(
	frontmatter: Record<string, unknown> | undefined,
	tag: string,
): boolean {
	const want = normalizeTag(tag);
	if (want.length === 0 || !frontmatter) {
		return false;
	}
	const raw: unknown = frontmatter.tags;
	const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
	const strings = list.filter((t): t is string => typeof t === 'string');
	if (strings.some((t) => isMetaTag(t))) {
		return false;
	}
	return strings.some((t) => normalizeTag(t) === want);
}

/**
 * List every loose thought note in the vault — the unstructured counterpart to
 * {@link listObjects}. Scans markdown frontmatter (warm in `metadataCache` after
 * layout-ready), skips the meta folder outright, and keeps the notes
 * {@link isThoughtNote} accepts. Sorted by name for a stable list; the primitive
 * behind surfacing a random thought.
 */
export function listThoughtNotes(app: App, tag: string): TFile[] {
	const thoughts: TFile[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (isInMetaFolder(file.path)) {
			continue;
		}
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isThoughtNote(frontmatter, tag)) {
			thoughts.push(file);
		}
	}
	thoughts.sort((a, b) => a.basename.localeCompare(b.basename));
	return thoughts;
}
