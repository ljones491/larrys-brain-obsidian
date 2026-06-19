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
			.setDesc('Tag added to every Larry write note. The leading # is optional.')
			.addText((text) =>
				text
					.setPlaceholder('thought')
					.setValue(this.plugin.settings.tag)
					.onChange(async (value) => {
						this.plugin.settings.tag = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
