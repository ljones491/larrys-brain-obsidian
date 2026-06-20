import { App, TFile } from 'obsidian';
import { SearchIndex } from './search-index';
import { recognizeSearchNote } from './memory-note';

/** A single note that matched a Remember search. */
export interface SearchResult {
	file: TFile;
	/** A short excerpt of the note around the first match, for preview. */
	snippet: string;
	/** Lowercased query terms that matched, so the UI can highlight them. */
	terms: string[];
	/** Relevance score (BM25, from the index), used to rank results. */
	score: number;
	/** True when this match is itself a prior Remember `#search` note. */
	isSearchNote: boolean;
	/** True when this prior search note ran the same query as the current one. */
	isRepeat: boolean;
}

/** Characters of context to show on each side of a snippet match. */
const SNIPPET_PAD = 60;

/**
 * Search the vault for notes matching `query`, ranked by relevance.
 *
 * Matching and scoring are delegated to the prebuilt {@link SearchIndex}
 * (BM25, title boosting, prefix + fuzzy). This function is the thin
 * Remember-specific layer over those hits: it drops the just-created search
 * note (`exclude`), centres a preview snippet on the first body match, and
 * flags prior `#search` notes — marking a repeat when one ran the same query.
 */
export function runSearch(
	app: App,
	index: SearchIndex,
	query: string,
	exclude?: TFile,
): SearchResult[] {
	if (query.trim().length === 0) {
		return [];
	}

	const normalizedQuery = normalizeQuery(query);

	return index
		.search(query)
		.filter((hit) => hit.file !== exclude)
		.map((hit) => {
			// Centre the snippet on the first matched term that appears in the
			// body; the title is matched too but makes for a poor preview.
			const lowerBody = hit.body.toLowerCase();
			let firstBodyHit = -1;
			for (const term of hit.terms) {
				const at = lowerBody.indexOf(term.toLowerCase());
				if (at !== -1 && (firstBodyHit === -1 || at < firstBodyHit)) {
					firstBodyHit = at;
				}
			}

			const searchNote = recognizeSearchNote(
				app.metadataCache.getFileCache(hit.file)?.frontmatter,
			);
			return {
				file: hit.file,
				score: hit.score,
				snippet: makeSnippet(hit.body, firstBodyHit),
				terms: hit.terms,
				isSearchNote: searchNote !== null,
				isRepeat:
					searchNote !== null &&
					normalizeQuery(searchNote.query) === normalizedQuery,
			};
		});
}

/** Collapse whitespace and lowercase a query so repeats compare equal. */
function normalizeQuery(query: string): string {
	return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extract a whitespace-collapsed excerpt of `text` centred on `index`. When
 * `index` is -1 (the match was in the title only), preview from the start.
 */
function makeSnippet(text: string, index: number): string {
	const anchor = index === -1 ? 0 : index;
	const start = Math.max(0, anchor - SNIPPET_PAD);
	const end = Math.min(text.length, anchor + SNIPPET_PAD);
	let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
	if (start > 0) {
		snippet = `…${snippet}`;
	}
	if (end < text.length) {
		snippet = `${snippet}…`;
	}
	return snippet;
}
