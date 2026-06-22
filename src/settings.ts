import { App, PluginSettingTab, Setting } from 'obsidian';
import LarrysBrainPlugin from './main';

export interface LarrysBrainSettings {
	/** Tag applied to every Larry write note, stored without a leading '#'. */
	tag: string;
	/** Suffix appended to generated titles, e.g. `X - hmm`. Blank omits it. */
	titleSuffix: string;
	/**
	 * Edge names recently written by the Relate command, most-recent first.
	 * Offered as autocomplete suggestions so common edges (RELATES_TO, IDEA_FOR)
	 * don't have to be retyped. Not user-editable in the settings tab; it fills
	 * itself in as edges are used.
	 */
	recentEdgeTypes: string[];
}

export const DEFAULT_SETTINGS: LarrysBrainSettings = {
	tag: 'thought',
	titleSuffix: 'hmm',
	// Seeded with the edges GOAL.md names so the first relate has suggestions.
	recentEdgeTypes: ['RELATES_TO', 'IDEA_FOR'],
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

		new Setting(containerEl)
			.setName('Title suffix')
			.setDesc(
				'Appended to generated titles as "topic - suffix". Leave blank for just the topic.',
			)
			.addText((text) =>
				text
					// The suffix is lowercase by convention; keep the example lowercase.
					// eslint-disable-next-line obsidianmd/ui/sentence-case
					.setPlaceholder('hmm')
					.setValue(this.plugin.settings.titleSuffix)
					.onChange(async (value) => {
						this.plugin.settings.titleSuffix = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
