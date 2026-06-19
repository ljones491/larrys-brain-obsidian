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
				placeholder: 'Larry write now. Larry think later...',
			},
		});
		textarea.focus();

		textarea.addEventListener('input', () => {
			this.value = textarea.value;
		});

		// Plain Enter submits; Shift/Cmd/Ctrl+Enter inserts a new line.
		textarea.addEventListener('keydown', (evt) => {
			if (evt.key !== 'Enter') {
				return;
			}
			if (evt.shiftKey || evt.metaKey || evt.ctrlKey) {
				// Let a modified Enter fall through as a normal newline.
				return;
			}
			evt.preventDefault();
			this.submit();
		});

		const footer = new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('Save')
				.setCta()
				.onClick(() => this.submit()),
		);
		footer.infoEl.createSpan({
			cls: 'larry-write-hint',
			text: 'Enter: save · Shift + Enter: new line',
		});
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
