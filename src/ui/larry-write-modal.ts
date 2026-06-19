import { App, Modal, Setting } from 'obsidian';

/**
 * A minimal "zen" writing surface: one large text box. On submit, the raw
 * text is handed back to the caller via {@link onSubmit}.
 */
export class LarryWriteModal extends Modal {
	private value = '';

	constructor(
		app: App,
		private onSubmit: (text: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;

		this.modalEl.addClass('larry-write-modal');
		// this.setTitle('Larry write');

		const textarea = contentEl.createEl('textarea', {
			cls: 'larry-write-textarea',
			attr: {
				placeholder: 'Just write…',
			},
		});
		textarea.focus();

		textarea.addEventListener('input', () => {
			this.value = textarea.value;
		});

		// Cmd/Ctrl+Enter submits; plain Enter stays free for new lines.
		textarea.addEventListener('keydown', (evt) => {
			if ((evt.metaKey || evt.ctrlKey) && evt.key === 'Enter') {
				evt.preventDefault();
				this.submit();
			}
		});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('Save')
				.setCta()
				.onClick(() => this.submit()),
		);
	}

	private submit(): void {
		const text = this.value.trim();
		if (text.length === 0) {
			return;
		}
		this.close();
		this.onSubmit(text);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
