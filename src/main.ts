import { Notice, Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	LarrysBrainSettings,
	LarrysBrainSettingTab,
} from './settings';
import { LarryWriteModal } from './ui/larry-write-modal';
import { RememberModal } from './ui/remember-modal';
import { ResultsModal } from './ui/results-modal';
import { createDumpNote } from './note';
import { createSearchNote } from './search-note';
import { runSearch } from './search';

export default class LarrysBrainPlugin extends Plugin {
	settings!: LarrysBrainSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'larry-write',
			name: 'Larry write',
			callback: () => this.openLarryWrite(),
		});

		this.addCommand({
			id: 'remember',
			name: 'Remember',
			callback: () => this.openRemember(),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LarrysBrainSettingTab(this.app, this));
	}

	private openLarryWrite(): void {
		new LarryWriteModal(this.app, (text) => {
			createDumpNote(this.app, text, {
				tag: this.settings.tag,
				titleSuffix: this.settings.titleSuffix,
			}).catch((err: unknown) => {
				console.error('Larry write: failed to create note', err);
				new Notice('Larry write: failed to create note.');
			});
		}).open();
	}

	private openRemember(): void {
		new RememberModal(this.app, (query) => {
			this.remember(query).catch((err: unknown) => {
				console.error('Remember: search failed', err);
				new Notice('Remember: search failed.');
			});
		}).open();
	}

	/**
	 * Record the search as a `#search` note, then run it and let the user
	 * preview the matches and choose which note to open. Opening a result just
	 * opens it for now; linking chosen results back into the search note is
	 * future work.
	 */
	private async remember(query: string): Promise<void> {
		const searchNote = await createSearchNote(this.app, query);
		const results = await runSearch(this.app, query, searchNote);
		new ResultsModal(this.app, query, results, (file) => {
			void this.app.workspace.getLeaf(false).openFile(file);
		}).open();
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LarrysBrainSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}