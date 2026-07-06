import { App, Modal, Setting } from 'obsidian';

/** Text shown at the top and in the input, so one modal serves both creators. */
export interface AreaNamePrompt {
	/** Heading, e.g. "New area" or "New sub-area of Chores". */
	title: string;
	/** Input placeholder, e.g. "Dishes". */
	placeholder: string;
	/** Label on the confirm button, e.g. "Create". */
	cta: string;
}

/**
 * Ask for an area name. The minimal counterpart to the Cortex modals: a single
 * text field submitted on Enter or the confirm button. The trimmed name is handed
 * back via {@link onSubmit}; a blank name is ignored (nothing to create). Used
 * both to create a top-level area and to file a new sub-area under a parent — the
 * difference is only the {@link AreaNamePrompt} copy the shell passes in.
 */
export class AreaNameModal extends Modal {
	private name = '';

	constructor(
		app: App,
		private prompt: AreaNamePrompt,
		private onSubmit: (name: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: this.prompt.title });

		new Setting(contentEl).setName('Name').addText((text) =>
			text
				.setPlaceholder(this.prompt.placeholder)
				.onChange((value) => {
					this.name = value;
				}),
		);

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText(this.prompt.cta).setCta().onClick(() => this.submit()),
		);

		const input = contentEl.querySelector('input');
		input?.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				this.submit();
			}
		});
		input?.focus();
	}

	private submit(): void {
		const name = this.name.trim();
		if (name.length === 0) {
			return;
		}
		this.close();
		this.onSubmit(name);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
