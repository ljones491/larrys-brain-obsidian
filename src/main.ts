import {
	Modal,
	Plugin,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	LarrysBrainSettings,
	LarrysBrainSettingTab,
} from './settings';

// Remember to rename these classes and interfaces!

export default class LarrysBrainPlugin extends Plugin {
	settings!: LarrysBrainSettings;

	async onload() {
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LarrysBrainSettingTab(this.app, this));
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