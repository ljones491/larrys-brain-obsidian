import { App, Modal, Setting, TFile } from 'obsidian';
import { listObjects, ObjectInstanceResult, ObjectKindOption, pickRandom } from './object';

/**
 * Surface a random member of a kind's set — the "give me a random skill"
 * prompt from .dev/GOAL.md. Pick a kind; the modal draws one random instance
 * and shows it, with its filled-in properties for context. **Shuffle again**
 * redraws; selecting the object opens its note. The modal stays open so the
 * user can keep drawing (mirrors the results modal).
 *
 * Assumes at least one kind exists; the caller checks and warns otherwise.
 */
export class ShuffleModal extends Modal {
	private kind: ObjectKindOption;
	private resultEl!: HTMLElement;

	constructor(
		app: App,
		private kinds: ObjectKindOption[],
		private onOpenObject: (file: TFile) => void,
	) {
		super(app);
		const first = kinds[0];
		if (!first) {
			throw new Error('ShuffleModal requires at least one kind.');
		}
		this.kind = first;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: 'Shuffle' });

		new Setting(contentEl).setName('Kind').addDropdown((dropdown) => {
			this.kinds.forEach((kind, i) => {
				dropdown.addOption(String(i), kind.name);
			});
			dropdown.setValue('0').onChange((value) => {
				const kind = this.kinds[Number(value)];
				if (!kind) {
					return;
				}
				this.kind = kind;
				this.shuffle();
			});
		});

		this.resultEl = contentEl.createDiv();

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText('Shuffle again').setCta().onClick(() => this.shuffle()),
		);

		// Draw one for the starting kind so the modal opens with a suggestion.
		this.shuffle();
	}

	/** Draw a fresh random object of the current kind and render it. */
	private shuffle(): void {
		const pick = pickRandom(listObjects(this.app, this.kind));
		this.render(pick);
	}

	private render(pick: ObjectInstanceResult | null): void {
		this.resultEl.empty();

		if (!pick) {
			this.resultEl.createEl('p', { text: 'No objects of this kind yet.' });
			return;
		}

		const name = this.resultEl.createEl('a', { text: pick.name, href: '#' });
		name.addEventListener('click', (evt) => {
			evt.preventDefault();
			this.onOpenObject(pick.file);
		});

		// Show the filled-in properties as context for the suggestion.
		const filled = Object.entries(pick.instance.properties).filter(
			([, value]) => value.length > 0,
		);
		if (filled.length > 0) {
			const list = this.resultEl.createEl('ul');
			for (const [property, value] of filled) {
				list.createEl('li', { text: `${property}: ${value}` });
			}
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
