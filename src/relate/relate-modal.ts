import { App, Modal, Setting } from 'obsidian';
import { normalizeEdgeType } from '../edge';

/** How the object of the edge is supplied. */
export type RelateMode = 'thought' | 'object' | 'existing';

/** The first step of a relate: which edge to write, and where its object comes from. */
export interface RelateChoice {
	/** The edge name as typed; normalized to `UPPER_SNAKE` when written. */
	edgeType: string;
	/** How to obtain the object the edge points to. */
	mode: RelateMode;
}

export interface RelateModalOptions {
	/** The subject note's title, shown so the user sees what they're linking from. */
	subjectName: string;
	/** Recently used edge names, offered as autocomplete suggestions. */
	recentEdgeTypes: string[];
	/** Whether any OBJECT kinds exist (else "New object" is hidden). */
	canCreateObject: boolean;
}

/**
 * First step of the Relate command: name the edge and choose where its object
 * comes from (a new thought, a new object, or an existing note). The actual
 * object is gathered by a follow-on modal the shell opens for the chosen mode,
 * so this stays a small "what kind of link" picker.
 *
 * A blank edge name (or one that normalizes to nothing) does nothing.
 */
export class RelateModal extends Modal {
	private mode: RelateMode = 'thought';
	/** The edge name, pre-filled with the top suggestion so the common case is
	 * one keystroke; the user can overtype it or pick another from the list. */
	private edgeType: string;
	/** Set when the user commits; fired in onClose so the follow-on modal opens
	 * only after this one has fully torn down (chaining modals mid-close races
	 * Obsidian's container teardown and the new modal never appears). */
	private choice: RelateChoice | null = null;

	constructor(
		app: App,
		private options: RelateModalOptions,
		private onSubmit: (choice: RelateChoice) => void,
	) {
		super(app);
		this.edgeType = options.recentEdgeTypes[0] ?? 'RELATES_TO';
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: 'Relate note' });
		contentEl.createEl('div', {
			cls: 'relate-subject',
			text: `From: ${this.options.subjectName}`,
		});

		new Setting(contentEl).setName('Edge').addText((text) => {
			text
				.setPlaceholder('RELATES_TO')
				.setValue(this.edgeType)
				.onChange((value) => {
					this.edgeType = value;
				});

			const input = text.inputEl;
			if (this.options.recentEdgeTypes.length > 0) {
				const datalist = contentEl.createEl('datalist');
				datalist.id = 'relate-edge-types';
				for (const type of this.options.recentEdgeTypes) {
					datalist.createEl('option', { value: type });
				}
				input.setAttr('list', datalist.id);
			}

			// Enter from the edge field submits, like the other capture modals.
			input.addEventListener('keydown', (evt) => {
				if (evt.key === 'Enter') {
					evt.preventDefault();
					this.submit();
				}
			});
			input.focus();
			// Select the pre-filled name so typing replaces it in one go.
			input.select();
		});

		new Setting(contentEl).setName('Link to').addDropdown((dropdown) => {
			dropdown.addOption('thought', 'New thought');
			if (this.options.canCreateObject) {
				dropdown.addOption('object', 'New object');
			}
			dropdown.addOption('existing', 'Existing note');
			dropdown.setValue(this.mode).onChange((value) => {
				this.mode = value as RelateMode;
			});
		});

		new Setting(contentEl).addButton((btn) =>
			btn.setButtonText('Relate').setCta().onClick(() => this.submit()),
		);
	}

	private submit(): void {
		const edgeType = this.edgeType.trim();
		// Reject names that carry no edge once normalized (e.g. only punctuation).
		if (normalizeEdgeType(edgeType).length === 0) {
			return;
		}
		this.choice = { edgeType, mode: this.mode };
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		// Hand off after teardown so the follow-on modal isn't torn down with us.
		if (this.choice) {
			this.onSubmit(this.choice);
		}
	}
}
