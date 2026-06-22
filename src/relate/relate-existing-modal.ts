import { App, FuzzySuggestModal, TFile } from 'obsidian';
import { isInMetaFolder } from '../meta';

/**
 * Pick an existing note to be the object of a relate, by fuzzy-matching its
 * title. Excludes the subject itself (a note shouldn't link to itself) and the
 * plugin's own meta notes (object-kind definitions and the like), which aren't
 * meaningful link targets. The chosen note is handed back via {@link onChoose}.
 */
export class RelateExistingModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private subject: TFile,
		private onChoose: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder('Link to which note?');
	}

	getItems(): TFile[] {
		return this.app.vault
			.getMarkdownFiles()
			.filter((file) => file !== this.subject && !isInMetaFolder(file.path))
			.sort((a, b) => a.basename.localeCompare(b.basename));
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
