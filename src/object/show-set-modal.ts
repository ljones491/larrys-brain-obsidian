import { App, Modal, Setting } from 'obsidian';
import { ObjectKindOption } from './object';

/**
 * Pick a kind and open its set as a persistent Bases table (.dev/GOAL.md's
 * "see my sets"). A kind dropdown plus **Show set**; the actual file work lives
 * in {@link showSet}. Mirrors {@link ShuffleModal}'s shape.
 *
 * Assumes at least one kind exists; the caller checks and warns otherwise.
 */
export class ShowSetModal extends Modal {
	private kind: ObjectKindOption;

	constructor(
		app: App,
		private kinds: ObjectKindOption[],
		private onShow: (kind: ObjectKindOption) => void,
	) {
		super(app);
		const first = kinds[0];
		if (!first) {
			throw new Error('ShowSetModal requires at least one kind.');
		}
		this.kind = first;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: 'Show set' });

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
			btn
				.setButtonText('Show set')
				.setCta()
				.onClick(() => {
					this.onShow(this.kind);
					this.close();
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
