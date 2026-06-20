import { App, Modal, TFile } from 'obsidian';
import { SearchResult } from '../search';

/**
 * Presents the results of a Remember search and lets the user choose which
 * notes to investigate. Each result shows its title and a preview snippet;
 * selecting one hands the file back to the caller via {@link onChoose}.
 *
 * Choosing is the point: only notes the user opens become memory-like links
 * back into the search note (future work). Browsing here does not link.
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

		const list = contentEl.createEl('div', { cls: 'remember-results-list' });
		for (const result of this.results) {
			const row = list.createEl('div', { cls: 'remember-result' });
			row.createEl('div', {
				cls: 'remember-result-title',
				text: result.file.basename,
			});
			row.createEl('div', {
				cls: 'remember-result-snippet',
				text: result.snippet,
			});
			row.addEventListener('click', () => {
				this.close();
				this.onChoose(result.file);
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
