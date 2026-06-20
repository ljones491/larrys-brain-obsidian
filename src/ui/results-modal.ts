import { App, Modal, TFile } from 'obsidian';
import { SearchResult } from '../search';

/**
 * Presents the results of a Remember search and lets the user choose which
 * notes to investigate. Each result shows its title and a preview snippet;
 * selecting one hands the file back to the caller via {@link onChoose}.
 *
 * Choosing is the point: only notes the user opens become memory-like links
 * back into the search note. The modal stays open across choices so one
 * search can spawn several such links; chosen rows are marked as linked, and
 * the user closes the modal manually when done.
 */
export class ResultsModal extends Modal {
	constructor(
		app: App,
		private query: string,
		private results: SearchResult[],
		private onChoose: (file: TFile) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		this.modalEl.addClass('remember-results-modal');

		contentEl.createEl('div', {
			cls: 'remember-results-header',
			text: `Remembering "${this.query}"`,
		});

		if (this.results.length === 0) {
			contentEl.createEl('div', {
				cls: 'remember-results-empty',
				text: 'Nothing came to mind.',
			});
			return;
		}

		const repeats = this.results.filter((r) => r.isRepeat).length;
		if (repeats > 0) {
			contentEl.createEl('div', {
				cls: 'remember-results-repeat-note',
				text:
					repeats === 1
						? "You've searched this once before."
						: `You've searched this ${repeats} times before.`,
			});
		}

		const list = contentEl.createEl('div', { cls: 'remember-results-list' });
		for (const result of this.results) {
			const row = list.createEl('div', { cls: 'remember-result' });
			if (result.isSearchNote) {
				row.addClass('is-search-note');
			}
			const title = row.createEl('div', {
				cls: 'remember-result-title',
				text: result.file.basename,
			});
			if (result.isRepeat) {
				title.createEl('span', {
					cls: 'remember-result-tag',
					text: 'Same search',
				});
			} else if (result.isSearchNote) {
				title.createEl('span', {
					cls: 'remember-result-tag',
					text: 'Past search',
				});
			}
			row.createEl('div', {
				cls: 'remember-result-snippet',
				text: result.snippet,
			});
			row.addEventListener('click', () => {
				// Stay open so the user can link several notes from one search;
				// mark this row so it reads as remembered.
				row.addClass('is-linked');
				this.onChoose(result.file);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
