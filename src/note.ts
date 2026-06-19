import { App, normalizePath, TFile } from 'obsidian';

/** Fields written into the frontmatter of a dump note. */
export interface DumpNoteMeta {
	/** Tag for the note, with or without a leading '#'. */
	tag: string;
}

/**
 * Create a new note containing the given raw text and open it.
 *
 * The note is prefixed with frontmatter (date, tag, source). The
 * auto-generated title is still a placeholder timestamp for now.
 */
export async function createDumpNote(
	app: App,
	text: string,
	meta: DumpNoteMeta,
): Promise<TFile> {
	const fileName = `${makeFileStamp()}.md`;
	const path = normalizePath(fileName);

	const contents = `${makeFrontmatter(meta)}${text}`;
	const file = await app.vault.create(path, contents);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
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
 * A filesystem-safe, sortable timestamp for a placeholder filename, e.g.
 * `2026-06-18 1432`. A proper auto-generated title comes later.
 */
function makeFileStamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `${date} ${time}`;
}
