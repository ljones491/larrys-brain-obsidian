import { App, Modal, Setting } from 'obsidian';

/**
 * A minimal search surface: one query field. On submit, the trimmed query is
 * handed back to the caller via {@link onSubmit}.
 */
export class RememberModal extends Modal {
	private value = '';

	constructor(
		app: App,
		private onSubmit: (query: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;

		this.modalEl.addClass('remember-modal');

		const input = contentEl.createEl('input', {
			cls: 'remember-input',
			attr: {
				type: 'text',
				placeholder: 'Remember...',
			},
		});
		input.focus();

		input.addEventListener('input', () => {
			this.value = input.value;
		});

		// Enter submits the search.
		input.addEventListener('keydown', (evt) => {
			if (evt.key !== 'Enter') {
				return;
			}
			evt.preventDefault();
			this.submit();
		});

		const footer = new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('Search')
				.setCta()
				.onClick(() => this.submit()),
		);
		footer.infoEl.createSpan({
			cls: 'remember-hint',
			text: 'Enter: search',
		});
	}

	private submit(): void {
		const query = this.value.trim();
		if (query.length === 0) {
			return;
		}
		this.close();
		this.onSubmit(query);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
