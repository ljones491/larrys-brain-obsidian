import { App, PluginSettingTab, Setting } from 'obsidian';
import LarrysBrainPlugin from './main';

export interface LarrysBrainSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: LarrysBrainSettings = {
	mySetting: 'default',
};

export class LarrysBrainSettingTab extends PluginSettingTab {
	plugin: LarrysBrainPlugin;

	constructor(app: App, plugin: LarrysBrainPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
