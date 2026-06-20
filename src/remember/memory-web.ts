import type { App, TFile } from 'obsidian';
import type { SearchIndexHandle } from './search-index';
import { runSearch, SearchResult } from './search';
import { buildSearchNoteContents, SEARCH_TAG } from '../memory-note';
import {
	createUniqueNote,
	makeFileStamp,
	sanitizeFileName,
} from '../utils/notes';

/**
 * Larry's Brain edge name for a link from a search note to a note the user
 * opened from its results. This is the first use of the edge syntax
 * `EDGE: [[Note Title]]`; the default edge (plain `[[...]]`) reads as `LINKS`.
 */
const FOUND_EDGE = 'FOUND';

/**
 * One run of Remember: the `#search` note it recorded and the results it
 * surfaced. Passed back into {@link MemoryWeb.recordFound} so a chosen result
 * links home to the right search note.
 */
export interface RememberSession {
	searchNote: TFile;
	results: SearchResult[];
}

/**
 * The memory-web forming logic, lifted out of the plugin shell. A Remember
 * records a `#search` note, runs the search, and links each opened result back
 * to that note as a `FOUND` edge — that web of search→result links is the
 * point of Remember (see CONTEXT.md).
 *
 * Depends only on {@link App} and a {@link SearchIndexHandle}, never on the UI:
 * creating notes and writing edges live here, while opening leaves and showing
 * modals stay in the shell. That keeps this orchestration unit-testable with a
 * fake app and a stub index.
 */
export class MemoryWeb {
	constructor(
		private app: App,
		private index: SearchIndexHandle,
	) {}

	/**
	 * Record `query` as a `#search` note, make sure the index is ready, then run
	 * the search excluding that just-created note and return both. The caller
	 * decides how to surface the note and results (opening a leaf, a modal).
	 */
	async remember(query: string): Promise<RememberSession> {
		const searchNote = await this.createSearchNote(query);
		// Make sure the index is built before the first search after load.
		await this.index.ready();
		const results = runSearch(this.app, this.index, query, searchNote);
		return { searchNote, results };
	}

	/**
	 * Record that the user opened `found` from `session` by appending a
	 * `FOUND: [[Note Title]]` edge to the session's `#search` note. Idempotent:
	 * an already-present link for the same note is left untouched, so re-opening
	 * a result from a still-open results modal won't duplicate the edge.
	 */
	async recordFound(session: RememberSession, found: TFile): Promise<void> {
		const link = `${FOUND_EDGE}: [[${found.basename}]]`;
		const data = await this.app.vault.read(session.searchNote);
		if (data.includes(link)) return;
		const separator = data.length > 0 && !data.endsWith('\n') ? '\n' : '';
		await this.app.vault.modify(
			session.searchNote,
			`${data}${separator}${link}\n`,
		);
	}

	/**
	 * Create the note recording a Remember search. Tagged `#search`, titled from
	 * the query (falling back to a timestamp when nothing filename-safe remains).
	 * Does not open it — that's the shell's job.
	 */
	private async createSearchNote(query: string): Promise<TFile> {
		const baseName =
			sanitizeFileName(`${query} - ${SEARCH_TAG}`) || makeFileStamp();
		const contents = buildSearchNoteContents(query);
		return createUniqueNote(this.app, baseName, contents);
	}
}
