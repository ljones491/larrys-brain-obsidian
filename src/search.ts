import { App, TFile } from 'obsidian';

/** A single note that matched a Remember search. */
export interface SearchResult {
	file: TFile;
	/** A short excerpt of the note around the first match, for preview. */
	snippet: string;
	/** Total term occurrences, used to rank results. */
	score: number;
}

/** Characters of context to show on each side of a snippet match. */
const SNIPPET_PAD = 60;

/**
 * Search the vault for notes matching `query` and return them ranked by how
 * many query terms they contain.
 *
 * Matching is a simple case-insensitive term scan over note titles and bodies:
 * the query is split into words, and a note scores by the total number of term
 * occurrences. Search notes (and the optional `exclude` file) are skipped so a
 * Remember search never turns up its own records.
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

	const results: SearchResult[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		if (file === exclude || isSearchNote(app, file)) {
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
			results.push({
				file,
				score,
				snippet: makeSnippet(haystack, firstHit),
			});
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results;
}

/** Whether `file` is itself a Remember search note (tagged `#search`). */
function isSearchNote(app: App, file: TFile): boolean {
	const tags: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.tags;
	if (Array.isArray(tags)) {
		return tags.includes('search');
	}
	return tags === 'search';
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
