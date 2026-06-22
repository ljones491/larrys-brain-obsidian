import { App, Modal, TFile } from 'obsidian';
import type { SearchResult } from '../remember/search';
import { renderHighlighted } from '../remember/results-modal';

/** How long to wait after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * Pick an existing note to be the object of a relate, using the Remember search
 * (body and title relevance) rather than a title-only fuzzy match. Because the
 * link comes *from* an existing note, nothing is logged — this is a read-only
 * search, so it's wired to {@link MemoryWeb.search}, not `remember`.
 *
 * A search box drives a live results list: typing searches (debounced), each
 * result shows its title and a highlighted snippet, and choosing one hands the
 * file back via {@link onChoose} and closes. The subject and the plugin's meta
 * notes never appear — the subject is excluded by the caller, meta notes by the
 * index itself.
 */
export class RelateSearchModal extends Modal {
	private query = '';
	private resultsEl!: HTMLElement;
	/** Pending debounced search, cleared on the next keystroke and on close. */
	private debounce: number | null = null;
	/** Guards against a slow search overwriting the results of a later one. */
	private searchSeq = 0;

	constructor(
		app: App,
		private search: (query: string) => Promise<SearchResult[]>,
		private onChoose: (file: TFile) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('remember-results-modal');

		const input = contentEl.createEl('input', {
			cls: 'remember-input',
			type: 'text',
			placeholder: 'Link to which note?',
		});
		// Inherit Remember's input styling (sits under `.remember-modal`).
		this.modalEl.addClass('remember-modal');

		this.resultsEl = contentEl.createEl('div', {
			cls: 'remember-results-list',
		});

		input.addEventListener('input', () => {
			this.query = input.value;
			this.scheduleSearch();
		});
		// Enter searches immediately instead of waiting out the debounce.
		input.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				void this.runSearch();
			}
		});
		input.focus();
	}

	private scheduleSearch(): void {
		if (this.debounce !== null) {
			window.clearTimeout(this.debounce);
		}
		this.debounce = window.setTimeout(() => {
			this.debounce = null;
			void this.runSearch();
		}, SEARCH_DEBOUNCE_MS);
	}

	private async runSearch(): Promise<void> {
		const seq = ++this.searchSeq;
		const results = await this.search(this.query);
		// A newer search started while this one was in flight; drop this one.
		if (seq !== this.searchSeq) {
			return;
		}
		this.renderResults(results);
	}

	private renderResults(results: SearchResult[]): void {
		this.resultsEl.empty();
		if (this.query.trim().length === 0) {
			return;
		}
		if (results.length === 0) {
			this.resultsEl.createEl('div', {
				cls: 'remember-results-empty',
				text: 'Nothing came to mind.',
			});
			return;
		}

		for (const result of results) {
			const row = this.resultsEl.createEl('div', { cls: 'remember-result' });
			if (result.isSearchNote) {
				row.addClass('is-search-note');
			}
			row.createEl('div', {
				cls: 'remember-result-title',
				text: result.file.basename,
			});
			const snippet = row.createEl('div', { cls: 'remember-result-snippet' });
			renderHighlighted(snippet, result.snippet, result.terms);
			row.addEventListener('click', () => {
				this.onChoose(result.file);
				this.close();
			});
		}
	}

	onClose(): void {
		if (this.debounce !== null) {
			window.clearTimeout(this.debounce);
		}
		this.contentEl.empty();
	}
}
