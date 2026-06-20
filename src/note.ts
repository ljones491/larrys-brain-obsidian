import { App, TFile } from 'obsidian';
import { generateTitle } from './title';
import {
	createUniqueNote,
	makeDateStamp,
	makeFileStamp,
	sanitizeFileName,
} from './utils/notes';

/** Fields written into the frontmatter of a dump note. */
export interface DumpNoteMeta {
	/** Tag for the note, with or without a leading '#'. */
	tag: string;
	/** Suffix appended to the generated title, e.g. `X - hmm`. */
	titleSuffix: string;
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
	const baseName =
		sanitizeFileName(generateTitle(text, meta.titleSuffix)) || makeFileStamp();
	const contents = `${makeFrontmatter(meta)}${text}`;
	const file = await createUniqueNote(app, baseName, contents);
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
