import { App, Modal, Setting } from 'obsidian';
import { NewObjectKind } from './object-kind';

/**
 * Gather a new OBJECT kind: a name and a comma-separated list of properties. On
 * submit, the trimmed name and parsed property list are handed back via
 * {@link onSubmit}. A blank name does nothing.
 */
export class DefineObjectKindModal extends Modal {
	private name = '';
	private propertiesRaw = '';

	constructor(
		app: App,
		private onSubmit: (kind: NewObjectKind) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: 'Define object kind' });

		new Setting(contentEl)
			.setName('Kind name')
			// The example tag is lowercase by convention; keep it lowercase.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('What this set holds, e.g. book.')
			.addText((text) =>
				text
					// Kind names are lowercase by convention; keep the example lowercase.
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('book')
					.onChange((value) => {
						this.name = value;
					}),
			);

		new Setting(contentEl)
			.setName('Properties')
			// Example property names are lowercase by convention; keep them lowercase.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('Comma-separated fields each one can have, e.g. author, status.')
			.addText((text) =>
				text
					// Property names are lowercase by convention; keep the example lowercase.
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('author, status')
					.onChange((value) => {
						this.propertiesRaw = value;
					}),
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('Create')
				.setCta()
				.onClick(() => this.submit()),
		);

		// Submit from either field so Enter works wherever the cursor sits.
		const inputs = Array.from(contentEl.querySelectorAll('input'));
		for (const input of inputs) {
			input.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') {
					evt.preventDefault();
					this.submit();
				}
			});
		}
		inputs[0]?.focus();
	}

	private submit(): void {
		const name = this.name.trim();
		if (name.length === 0) {
			return;
		}
		this.close();
		this.onSubmit({ name, properties: parseProperties(this.propertiesRaw) });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Split a comma-separated properties string into a clean list: trimmed, with
 * blanks dropped and case-insensitive duplicates removed (first spelling wins).
 */
function parseProperties(raw: string): string[] {
	const seen = new Set<string>();
	const properties: string[] = [];
	for (const part of raw.split(',')) {
		const property = part.trim();
		if (property.length === 0) {
			continue;
		}
		const key = property.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		properties.push(property);
	}
	return properties;
}
