import { Notice, Plugin, TFile } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	LarrysBrainSettings,
	LarrysBrainSettingTab,
} from './settings';
import { LarryWriteModal } from './ui/larry-write-modal';
import { RememberModal } from './ui/remember-modal';
import { ResultsModal } from './ui/results-modal';
import { createDumpNote } from './note';
import { createSearchNote, linkFoundNote } from './search-note';
import { runSearch } from './search';
import { SearchIndex } from './search-index';

export default class LarrysBrainPlugin extends Plugin {
	settings!: LarrysBrainSettings;
	private index!: SearchIndex;

	async onload() {
		await this.loadSettings();

		// Persist the index inside the plugin's own folder so restarts restore
		// it instead of rebuilding the whole vault.
		const snapshotPath = this.manifest.dir
			? `${this.manifest.dir}/search-index.json`
			: null;
		this.index = new SearchIndex(this.app, snapshotPath);
		// Defer the one full scan until Obsidian's own cache is warm so startup
		// stays light; afterwards only changed files are re-read.
		this.app.workspace.onLayoutReady(() => void this.index.build());

		// Keep the index current by reading a file only when it actually changes.
		this.registerEvent(
			this.app.vault.on('create', (f) => {
				if (f instanceof TFile) void this.index.onModify(f);
			}),
		);
		this.registerEvent(
			this.app.vault.on('modify', (f) => {
				if (f instanceof TFile) void this.index.onModify(f);
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (f) => {
				if (f instanceof TFile) void this.index.onDelete(f.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (f, oldPath) => {
				void this.index.onDelete(oldPath);
				if (f instanceof TFile) void this.index.onModify(f);
			}),
		);

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
	 * preview the matches. Each result the user opens is linked back into the
	 * search note as a `FOUND[[...]]` edge. The results modal stays open so a
	 * single search can spawn several such memory links.
	 */
	private async remember(query: string): Promise<void> {
		const searchNote = await createSearchNote(this.app, query);
		// Make sure the index is built before the first search after load.
		await this.index.ready();
		const results = runSearch(this.app, this.index, query, searchNote);
		new ResultsModal(this.app, query, results, (file) => {
			linkFoundNote(this.app, searchNote, file).catch((err: unknown) => {
				console.error('Remember: failed to link found note', err);
				new Notice('Remember: failed to link found note.');
			});
			// Open the result in a new tab so the search note stays put.
			void this.app.workspace.getLeaf('tab').openFile(file);
		}).open();
	}

	onunload() {
		// Flush any pending index write before we go.
		void this.index.dispose();
	}

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