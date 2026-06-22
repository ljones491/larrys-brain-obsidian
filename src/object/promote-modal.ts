import { App, Modal, Setting } from 'obsidian';
import { ObjectKindOption } from './object';

/**
 * Promote the note on screen into an OBJECT instance: pick which kind it should
 * become. The note itself is already chosen (it's the active note), so this only
 * gathers the target kind — the property values come from the note's existing
 * frontmatter, filled in by the transform. On submit the chosen kind is handed
 * back via {@link onSubmit}.
 *
 * Assumes at least one kind exists; the caller checks and warns otherwise.
 */
export class PromoteModal extends Modal {
	private kind: ObjectKindOption;

	constructor(
		app: App,
		private subjectName: string,
		private kinds: ObjectKindOption[],
		private onSubmit: (kind: ObjectKindOption) => void,
	) {
		super(app);
		const first = kinds[0];
		if (!first) {
			throw new Error('PromoteModal requires at least one kind.');
		}
		this.kind = first;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: 'Promote to object' });
		contentEl.createEl('p', {
			text: `Reshape "${this.subjectName}" into an object instance.`,
		});

		new Setting(contentEl).setName('Kind').addDropdown((dropdown) => {
			this.kinds.forEach((kind, i) => {
				dropdown.addOption(String(i), kind.name);
			});
			dropdown.setValue('0').onChange((value) => {
				const kind = this.kinds[Number(value)];
				if (kind) {
					this.kind = kind;
				}
			});
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText('Promote').setCta().onClick(() => this.submit()),
		);
	}

	private submit(): void {
		this.close();
		this.onSubmit(this.kind);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
