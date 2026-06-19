import { App, normalizePath, TFile } from 'obsidian';
import { generateTitle } from './title';

/** Fields written into the frontmatter of a dump note. */
export interface DumpNoteMeta {
	/** Tag for the note, with or without a leading '#'. */
	tag: string;
}

/**
 * Create a new note containing the given raw text and open it.
 *
 * The note is prefixed with frontmatter (date, tag, source). Its title is
 * auto-generated from the content (e.g. "Thoughts About X"), falling back
 * to a timestamp when no usable subject can be found.
 */
export async function createDumpNote(
	app: App,
	text: string,
	meta: DumpNoteMeta,
): Promise<TFile> {
	const baseName = sanitizeFileName(generateTitle(text)) || makeFileStamp();
	const path = uniquePath(app, baseName);

	const contents = `${makeFrontmatter(meta)}${text}`;
	const file = await app.vault.create(path, contents);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}

/**
 * Strip characters that aren't safe in a filename and tidy the edges.
 * Returns an empty string if nothing usable remains.
 */
function sanitizeFileName(name: string): string {
	return name
		// Characters illegal in filenames or meaningful in Obsidian links.
		.replace(/[\\/:*?"<>|#^[\]]/g, '')
		.replace(/\s+/g, ' ')
		.replace(/^[.\s]+|[.\s]+$/g, '');
}

/**
 * A vault path for `baseName` that doesn't collide with an existing note,
 * appending a counter (e.g. "... 2") when needed.
 */
function uniquePath(app: App, baseName: string): string {
	let candidate = normalizePath(`${baseName}.md`);
	for (let n = 2; app.vault.getAbstractFileByPath(candidate); n++) {
		candidate = normalizePath(`${baseName} ${n}.md`);
	}
	return candidate;
}

/**
 * Build the YAML frontmatter block for a dump note: the date it was
 * written, its tag, and the source (always the user for now).
 */
function makeFrontmatter(meta: DumpNoteMeta): string {
	const tag = meta.tag.replace(/^#/, '').trim();
	return [
		'---',
		`date: ${makeDateStamp()}`,
		'tags:',
		`  - ${tag}`,
		'source: user',
		'---',
		'',
	].join('\n');
}

/** The date the note was written, e.g. `2026-06-18`. */
function makeDateStamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A filesystem-safe, sortable timestamp used as a fallback filename when no
 * title can be generated, e.g. `2026-06-18 1432`.
 */
function makeFileStamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `${date} ${time}`;
}
