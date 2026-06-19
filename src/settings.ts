import { App, PluginSettingTab, Setting } from 'obsidian';
import LarrysBrainPlugin from './main';

export interface LarrysBrainSettings {
	/** Tag applied to every Larry write note, stored without a leading '#'. */
	tag: string;
}

export const DEFAULT_SETTINGS: LarrysBrainSettings = {
	tag: 'thought',
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
			.setName('Tag')
			// "Larry" is a proper noun (the feature name), not a sentence-case slip.
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc('Tag added to every Larry write note. The leading # is optional.')
			.addText((text) =>
				text
					// Tag values are lowercase by convention; keep the example lowercase.
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('thought')
					.setValue(this.plugin.settings.tag)
					.onChange(async (value) => {
						this.plugin.settings.tag = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
