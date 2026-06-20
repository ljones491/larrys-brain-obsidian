import { App, TFile } from 'obsidian';

/** A single note that matched a Remember search. */
export interface SearchResult {
	file: TFile;
	/** A short excerpt of the note around the first match, for preview. */
	snippet: string;
	/** Total term occurrences, used to rank results. */
	score: number;
	/** True when this match is itself a prior Remember `#search` note. */
	isSearchNote: boolean;
	/** True when this prior search note ran the same query as the current one. */
	isRepeat: boolean;
}

/** Characters of context to show on each side of a snippet match. */
const SNIPPET_PAD = 60;

/**
 * Search the vault for notes matching `query` and return them ranked by how
 * many query terms they contain.
 *
 * Matching is a simple case-insensitive term scan over note titles and bodies:
 * the query is split into words, and a note scores by the total number of term
 * occurrences. Only the just-created search note (`exclude`) is skipped; prior
 * `#search` notes are surfaced like any other note, flagged so the UI can mark
 * them — and flagged as a repeat when they ran the same query.
 */
export async function runSearch(
	app: App,
	query: string,
	exclude?: TFile,
): Promise<SearchResult[]> {
	const terms = query
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 0);
	if (terms.length === 0) {
		return [];
	}

	const normalizedQuery = normalizeQuery(query);
	const results: SearchResult[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (file === exclude) {
			continue;
		}

		const content = await app.vault.cachedRead(file);
		const haystack = `${file.basename}\n${content}`;
		const lower = haystack.toLowerCase();

		let score = 0;
		let firstHit = -1;
		for (const term of terms) {
			let from = lower.indexOf(term);
			if (from === -1) {
				continue;
			}
			if (firstHit === -1 || from < firstHit) {
				firstHit = from;
			}
			while (from !== -1) {
				score++;
				from = lower.indexOf(term, from + term.length);
			}
		}

		if (score > 0) {
			const searchNoteQuery = getSearchNoteQuery(app, file);
			results.push({
				file,
				score,
				snippet: makeSnippet(haystack, firstHit),
				isSearchNote: searchNoteQuery !== null,
				isRepeat:
					searchNoteQuery !== null &&
					normalizeQuery(searchNoteQuery) === normalizedQuery,
			});
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results;
}

/** Collapse whitespace and lowercase a query so repeats compare equal. */
function normalizeQuery(query: string): string {
	return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * If `file` is a Remember search note (tagged `#search`), return the query it
 * recorded (its `query` frontmatter, or `''` if absent); otherwise `null`.
 */
function getSearchNoteQuery(app: App, file: TFile): string | null {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const tags: unknown = frontmatter?.tags;
	const isSearch = Array.isArray(tags)
		? tags.includes('search')
		: tags === 'search';
	if (!isSearch) {
		return null;
	}
	const query: unknown = frontmatter?.query;
	return typeof query === 'string' ? query : '';
}

/** Extract a whitespace-collapsed excerpt of `text` centred on `index`. */
function makeSnippet(text: string, index: number): string {
	const start = Math.max(0, index - SNIPPET_PAD);
	const end = Math.min(text.length, index + SNIPPET_PAD);
	let snippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
	if (start > 0) {
		snippet = `…${snippet}`;
	}
	if (end < text.length) {
		snippet = `${snippet}…`;
	}
	return snippet;
}
