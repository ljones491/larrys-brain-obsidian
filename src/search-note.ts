import { App, TFile } from 'obsidian';
import {
	createUniqueNote,
	makeDateStamp,
	makeFileStamp,
	sanitizeFileName,
} from './utils/notes';

/** Tag applied to every search note. */
const SEARCH_TAG = 'search';

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
	const contents = `${makeFrontmatter(query)}Search for "${query}".\n`;
	const file = await createUniqueNote(app, baseName, contents);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}

/**
 * Build the YAML frontmatter block for a search note: the date of the
 * search, its `#search` tag, the query, and the source (always the user).
 */
function makeFrontmatter(query: string): string {
	return [
		'---',
		`date: ${makeDateStamp()}`,
		'tags:',
		`  - ${SEARCH_TAG}`,
		`query: ${JSON.stringify(query)}`,
		'source: user',
		'---',
		'',
	].join('\n');
}
