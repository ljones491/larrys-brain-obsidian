import { App, Modal, Setting } from 'obsidian';

/**
 * Ask which domain to move a kind into. Prefilled with the kind's current domain
 * (blank when it has none) so the field shows where the kind sits today; the user
 * edits it to move the kind and its whole set. On submit the trimmed domain is
 * handed back via {@link onSubmit} — a blank value means "no domain", flattening
 * the kind back to `object/<kind>`.
 */
export class MoveToDomainModal extends Modal {
	private domain: string;

	constructor(
		app: App,
		private kindName: string,
		currentDomain: string,
		private onSubmit: (domain: string) => void,
	) {
		super(app);
		this.domain = currentDomain;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: `Move ${this.kindName} to domain` });

		new Setting(contentEl)
			.setName('Domain')
			.setDesc(
				'Retags this kind and every note in its set. Leave blank for no domain.',
			)
			.addText((text) =>
				text
					// Domains are lowercase by convention; keep the example lowercase.
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('media')
					.setValue(this.domain)
					.onChange((value) => {
						this.domain = value;
					}),
			);

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText('Move').setCta().onClick(() => this.submit()),
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
		this.close();
		this.onSubmit(this.domain.trim());
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
