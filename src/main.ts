import { Notice, Plugin } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	LarrysBrainSettings,
	LarrysBrainSettingTab,
} from './settings';
import { LarryWriteModal } from './ui/larry-write-modal';
import { createDumpNote } from './note';

export default class LarrysBrainPlugin extends Plugin {
	settings!: LarrysBrainSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: 'larry-write',
			name: 'Larry write',
			callback: () => this.openLarryWrite(),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LarrysBrainSettingTab(this.app, this));
	}

	private openLarryWrite(): void {
		new LarryWriteModal(this.app, (text) => {
			createDumpNote(this.app, text).catch((err: unknown) => {
				console.error('Larry write: failed to create note', err);
				new Notice('Larry write: failed to create note.');
			});
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