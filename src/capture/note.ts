import { App, TFile } from 'obsidian';
import { generateTitle } from './title';
import { buildDumpNoteContents, DumpNoteMeta } from '../memory-note';
import { createUniqueNote, makeFileStamp, sanitizeFileName } from '../utils/notes';

export type { DumpNoteMeta };

/**
 * Create a new note containing the given raw text and open it.
 *
 * The note's contents (frontmatter + text) come from the memory-note schema.
 * Its title is auto-generated from the content (e.g. "Thoughts About X"),
 * falling back to a timestamp when no usable subject can be found.
 */
export async function createDumpNote(
	app: App,
	text: string,
	meta: DumpNoteMeta,
): Promise<TFile> {
	const baseName =
		sanitizeFileName(generateTitle(text, meta.titleSuffix)) || makeFileStamp();
	const contents = buildDumpNoteContents(text, meta);
	const file = await createUniqueNote(app, baseName, contents);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}
