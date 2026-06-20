import { Notice, Plugin, TFile } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	LarrysBrainSettings,
	LarrysBrainSettingTab,
} from './settings';
import { LarryWriteModal } from './capture/larry-write-modal';
import { RememberModal } from './remember/remember-modal';
import { ResultsModal } from './remember/results-modal';
import { createDumpNote } from './capture/note';
import { MemoryWeb } from './remember/memory-web';
import { SearchIndex } from './remember/search-index';
import { DefineObjectKindModal } from './object/define-object-kind-modal';
import { createObjectKind } from './object/object-kind';
import { CreateObjectModal } from './object/create-object-modal';
import { ShuffleModal } from './object/shuffle-modal';
import { ShowSetModal } from './object/show-set-modal';
import { createObject, listObjectKinds, showSet } from './object/object';

export default class LarrysBrainPlugin extends Plugin {
	settings!: LarrysBrainSettings;
	private index!: SearchIndex;
	private memoryWeb!: MemoryWeb;

	async onload() {
		await this.loadSettings();

		// Persist the index inside the plugin's own folder so restarts restore
		// it instead of rebuilding the whole vault.
		const snapshotPath = this.manifest.dir
			? `${this.manifest.dir}/search-index.json`
			: null;
		this.index = new SearchIndex(this.app, snapshotPath);
		this.memoryWeb = new MemoryWeb(this.app, this.index);
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

		this.addCommand({
			id: 'define-object-kind',
			name: 'Define object kind',
			callback: () => this.openDefineObjectKind(),
		});

		this.addCommand({
			id: 'create-object',
			name: 'Create object',
			callback: () => this.openCreateObject(),
		});

		this.addCommand({
			id: 'shuffle',
			name: 'Shuffle',
			callback: () => this.openShuffle(),
		});

		this.addCommand({
			id: 'show-set',
			name: 'Show set',
			callback: () => this.openShowSet(),
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

	private openDefineObjectKind(): void {
		new DefineObjectKindModal(this.app, (kind) => {
			createObjectKind(this.app, kind).catch((err: unknown) => {
				console.error('Define object kind: failed to create note', err);
				new Notice('Define object kind: failed to create note.');
			});
		}).open();
	}

	private openCreateObject(): void {
		const kinds = listObjectKinds(this.app);
		if (kinds.length === 0) {
			new Notice('Define an object kind first.');
			return;
		}
		new CreateObjectModal(this.app, kinds, (object) => {
			createObject(this.app, object).catch((err: unknown) => {
				console.error('Create object: failed to create note', err);
				new Notice('Create object: failed to create note.');
			});
		}).open();
	}

	private openShuffle(): void {
		const kinds = listObjectKinds(this.app);
		if (kinds.length === 0) {
			new Notice('Define an object kind first.');
			return;
		}
		new ShuffleModal(this.app, kinds, (file) => {
			// Open the picked object in a new tab so the shuffle modal stays put.
			void this.app.workspace.getLeaf('tab').openFile(file);
		}).open();
	}

	private openShowSet(): void {
		const kinds = listObjectKinds(this.app);
		if (kinds.length === 0) {
			new Notice('Define an object kind first.');
			return;
		}
		new ShowSetModal(this.app, kinds, (kind) => {
			showSet(this.app, kind).catch((err: unknown) => {
				console.error('Show set: failed to open set', err);
				new Notice('Show set: failed to open set.');
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
	 * Run a Remember and surface it: open the recorded `#search` note, then let
	 * the user preview the matches. Each result the user opens is linked back
	 * into the search note as a `FOUND: [[...]]` edge. The results modal stays
	 * open so a single search can spawn several such memory links.
	 *
	 * The orchestration lives in {@link MemoryWeb}; this shell only opens leaves
	 * and modals.
	 */
	private async remember(query: string): Promise<void> {
		const session = await this.memoryWeb.remember(query);
		// Open the search note in the active leaf so it's the note on screen
		// while the results modal sits on top.
		void this.app.workspace.getLeaf(false).openFile(session.searchNote);
		new ResultsModal(this.app, query, session.results, (file) => {
			this.memoryWeb.recordFound(session, file).catch((err: unknown) => {
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