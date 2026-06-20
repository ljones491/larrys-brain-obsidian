import { App, TFile } from 'obsidian';
import { buildSearchNoteContents, SEARCH_TAG } from './memory-note';
import {
	createUniqueNote,
	makeFileStamp,
	sanitizeFileName,
} from './utils/notes';

/**
 * Larry's Brain edge name for a link from a search note to a note the user
 * opened from its results. This is the first use of the edge syntax
 * `EDGE: [[Note Title]]`; the default edge (plain `[[...]]`) reads as `LINKS`.
 */
const FOUND_EDGE = 'FOUND';

/**
 * Create a new note recording a "Remember" search and open it.
 *
 * The note is tagged `#search` and carries frontmatter (date, source). Its
 * title is the search query, falling back to a timestamp when the query has
 * no filename-safe characters. As the user opens results, links back to this
 * note will be added (see future work in the goal).
 */
export async function createSearchNote(
	app: App,
	query: string,
): Promise<TFile> {
	const baseName = sanitizeFileName(`${query} - ${SEARCH_TAG}`) || makeFileStamp();
	const contents = buildSearchNoteContents(query);
	const file = await createUniqueNote(app, baseName, contents);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}

/**
 * Record that the user opened `found` from a search by appending a
 * `FOUND: [[Note Title]]` edge link to the `#search` note. Idempotent: an
 * already-present link for the same note is left untouched, so re-opening a
 * result from a still-open results modal won't duplicate the edge.
 */
export async function linkFoundNote(
	app: App,
	searchNote: TFile,
	found: TFile,
): Promise<void> {
	const link = `${FOUND_EDGE}: [[${found.basename}]]`;
	const data = await app.vault.read(searchNote);
	if (data.includes(link)) return;
	const separator = data.length > 0 && !data.endsWith('\n') ? '\n' : '';
	await app.vault.modify(searchNote, `${data}${separator}${link}\n`);
}
