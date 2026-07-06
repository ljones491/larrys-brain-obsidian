import { App, Modal, Setting } from 'obsidian';
import { NewObject, ObjectKindOption } from './object';

/**
 * Gather a new OBJECT instance: pick a kind, name it, and fill in the kind's
 * properties. The kind dropdown drives which property fields appear — switching
 * kinds re-renders them. On submit, the trimmed name plus the chosen kind's tag
 * and property values are handed back via {@link onSubmit}. A blank name does
 * nothing.
 *
 * Assumes at least one kind exists; the caller checks and warns otherwise.
 *
 * Passing a `fixedKind` locks the modal to that one kind: the kind dropdown is
 * omitted entirely so focus lands straight in the name box. This is how the
 * Cortex panel's per-kind create button opens it. Without a `fixedKind`, the
 * dropdown is shown so the kind can be chosen (used by the Relate flow).
 */
export class CreateObjectModal extends Modal {
	private kind: ObjectKindOption;
	private name = '';
	private values: Record<string, string> = {};
	private fieldsEl!: HTMLElement;

	constructor(
		app: App,
		private kinds: ObjectKindOption[],
		private onSubmit: (object: NewObject) => void,
		private fixedKind?: ObjectKindOption,
	) {
		super(app);
		const first = fixedKind ?? kinds[0];
		if (!first) {
			throw new Error('CreateObjectModal requires at least one kind.');
		}
		this.kind = first;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', {
			text: this.fixedKind ? `Create ${this.fixedKind.name}` : 'Create object',
		});

		// With a fixed kind there's nothing to pick, so skip the dropdown and let
		// focus fall straight to the name field.
		if (!this.fixedKind) {
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
					this.values = {};
					this.renderFields();
				});
			});
		}

		// Name and per-property fields live in their own container so changing
		// the kind can re-render just them, leaving the dropdown in place.
		this.fieldsEl = contentEl.createDiv();
		this.renderFields();

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText('Create').setCta().onClick(() => this.submit()),
		);
	}

	private renderFields(): void {
		this.fieldsEl.empty();

		new Setting(this.fieldsEl).setName('Name').addText((text) =>
			text.setValue(this.name).onChange((value) => {
				this.name = value;
			}),
		);

		for (const property of this.kind.def.properties) {
			new Setting(this.fieldsEl).setName(property).addText((text) =>
				text.setValue(this.values[property] ?? '').onChange((value) => {
					this.values[property] = value;
				}),
			);
		}

		// Submit from any field so Enter works wherever the cursor sits.
		const inputs = Array.from(this.fieldsEl.querySelectorAll('input'));
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
		this.onSubmit({
			name,
			objectTag: this.kind.def.objectTag,
			propertyNames: this.kind.def.properties,
			values: this.values,
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
