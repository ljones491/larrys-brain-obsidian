import { ItemView, Menu, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import {
	listObjectKinds,
	listObjects,
	openSetBase,
	pickRandom,
	setBasePath,
	writeSetBase,
} from './object';
import { listBaseViews } from './object-base';
import type { ObjectKindOption } from './object';
import type LarrysBrainPlugin from '../main';

/**
 * View type id for the dockable Cortex panel. Stable; don't rename — the string
 * value is persisted in the workspace layout and would orphan an open panel.
 */
export const CORTEX_VIEW_TYPE = 'larrys-brain-set-view';

/**
 * Larry's Brain Cortex — the plugin's control center. A dockable panel (lives in
 * the right sidebar) that will grow into the hub for this plugin's functionality.
 * A "Current note" section relates the note open in the main view. Below it, the
 * panel lists every OBJECT kind, each with a button that opens its set view
 * (`<name>.base`) in the main view — the "a button I can click to open the base"
 * idea in .dev/GOAL.md. Saves having to remember the base's folder/filename and
 * reach for the quick switcher. Each kind also gets a create button that opens
 * the Create object modal preset to that kind, and a shuffle button that opens
 * a random member of its set in the main view, and a section-level button opens
 * the Define object kind modal (available even when no kinds exist yet).
 *
 * The panel is the UI shell; the open action itself is {@link openSetBase}, and
 * the kinds come from {@link listObjectKinds}. It re-renders when kinds change so
 * a newly defined (or deleted/renamed) kind shows up without a manual refresh.
 */
export class CortexView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LarrysBrainPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return CORTEX_VIEW_TYPE;
	}

	getDisplayText(): string {
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Larry's Brain Cortex" is a proper name
		return "Larry's Brain Cortex";
	}

	getIcon(): string {
		return 'box';
	}

	protected async onOpen(): Promise<void> {
		// Kinds are defined/removed by editing markdown notes, so refresh the list
		// whenever a note's frontmatter changes or a note is deleted/renamed.
		this.registerEvent(this.app.metadataCache.on('changed', () => this.render()));
		this.registerEvent(this.app.vault.on('delete', () => this.render()));
		this.registerEvent(this.app.vault.on('rename', () => this.render()));
		this.render();
	}

	/** Rebuild the panel from its feature sections. */
	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('larrys-brain-cortex');

		// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Larry's Brain Cortex" is a proper name
		container.createEl('h4', { text: "Larry's Brain Cortex" });

		this.renderNoteActions(container);
		this.renderObjectSets(container);
	}

	/** Actions on the note currently open in the main view. */
	private renderNoteActions(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'larrys-brain-cortex-section' });
		section.createEl('div', {
			text: 'Current note',
			cls: 'larrys-brain-cortex-section-heading',
		});
		section.createEl('div', {
			text: 'Link the note open in the main view to another with a typed edge.',
			cls: 'larrys-brain-cortex-section-hint',
		});

		const relate = section.createEl('button', { cls: 'larrys-brain-cortex-define' });
		setIcon(relate.createSpan({ cls: 'larrys-brain-cortex-define-icon' }), 'link');
		relate.createSpan({ text: 'Relate note' });
		relate.addEventListener('click', () => this.plugin.relateActiveNote());
	}

	/** A row with an open button (plus create/shuffle) for each defined kind. */
	private renderObjectSets(container: HTMLElement): void {
		// Each feature area is its own titled section so more can be added later.
		const section = container.createDiv({ cls: 'larrys-brain-cortex-section' });
		section.createEl('div', {
			text: 'Object sets',
			cls: 'larrys-brain-cortex-section-heading',
		});
		section.createEl('div', {
			text: 'Open a kind’s set view. Right-click to pick which view. Plus creates a member, shuffle opens a random one.',
			cls: 'larrys-brain-cortex-section-hint',
		});

		const kinds = listObjectKinds(this.app);
		if (kinds.length === 0) {
			section.createEl('p', {
				text: 'No object kinds yet. Define one to see its set here.',
				cls: 'larrys-brain-cortex-empty',
			});
		} else {
			const list = section.createDiv({ cls: 'larrys-brain-cortex-list' });
			for (const kind of kinds) {
				const row = list.createDiv({ cls: 'larrys-brain-cortex-row' });

				const button = row.createEl('button', {
					text: kind.name,
					cls: 'larrys-brain-cortex-item',
				});
				// Left-click opens the set to its preferred view (first by default).
				button.addEventListener('click', () => this.openKind(kind));
				// Right-click picks which view to open this kind's set to.
				button.addEventListener('contextmenu', (evt) => {
					evt.preventDefault();
					void this.showViewMenu(evt, kind);
				});

				// A create button opens the Create object modal preset to this kind.
				const create = row.createEl('button', {
					cls: 'larrys-brain-cortex-create',
					attr: { 'aria-label': `Create ${kind.name}` },
				});
				setIcon(create, 'plus');
				create.addEventListener('click', () =>
					this.plugin.openCreateObject(kind),
				);

				// A shuffle button opens a random member of this kind's set.
				const shuffle = row.createEl('button', {
					cls: 'larrys-brain-cortex-shuffle',
					attr: { 'aria-label': `Shuffle ${kind.name}` },
				});
				setIcon(shuffle, 'shuffle');
				shuffle.addEventListener('click', () => this.openRandom(kind));
			}
		}

		// Always offer a way to define a new kind, including from the empty state.
		const define = section.createEl('button', { cls: 'larrys-brain-cortex-define' });
		setIcon(define.createSpan({ cls: 'larrys-brain-cortex-define-icon' }), 'plus');
		define.createSpan({ text: 'Define object kind' });
		define.addEventListener('click', () => this.plugin.openDefineObjectKind());
	}

	/** Open a random member of the kind's set in the main view. */
	private openRandom(kind: ObjectKindOption): void {
		const pick = pickRandom(listObjects(this.app, kind));
		if (!pick) {
			new Notice(`No ${kind.name} objects yet.`);
			return;
		}
		this.app.workspace
			.getLeaf(false)
			.openFile(pick.file)
			.catch((err: unknown) => {
				console.error('Cortex: failed to open random object', err);
				new Notice('Cortex: failed to open random object.');
			});
	}

	/** Open a kind's set to its stored preferred view (or the first view). */
	private openKind(kind: ObjectKindOption): void {
		const view = this.plugin.settings.preferredSetView[setBasePath(kind.name, kind.def)];
		openSetBase(this.app, kind.name, kind.def, view).catch((err: unknown) => {
			console.error('Cortex: failed to open set view', err);
			new Notice('Cortex: failed to open set view.');
		});
	}

	/**
	 * Show a context menu of the kind's base views, the preferred one checked.
	 * Choosing a view stores it as this set's preference and opens to it. The
	 * base is written/refreshed first so its current view list is read back.
	 */
	private async showViewMenu(evt: MouseEvent, kind: ObjectKindOption): Promise<void> {
		const path = setBasePath(kind.name, kind.def);
		await writeSetBase(this.app, kind.name, kind.def);
		const file = this.app.vault.getAbstractFileByPath(path);
		const views =
			file instanceof TFile ? listBaseViews(await this.app.vault.read(file)) : [];

		const menu = new Menu();
		if (views.length === 0) {
			menu.addItem((item) => item.setTitle('No views found').setDisabled(true));
		} else {
			// No stored preference means the base opens to its first view.
			const effective = this.plugin.settings.preferredSetView[path] ?? views[0];
			for (const view of views) {
				menu.addItem((item) =>
					item
						.setTitle(view)
						.setChecked(view === effective)
						.onClick(() => {
							this.plugin.settings.preferredSetView[path] = view;
							this.plugin.saveSettings().catch((err: unknown) => {
								console.error('Cortex: failed to save preferred view', err);
							});
							openSetBase(this.app, kind.name, kind.def, view).catch(
								(err: unknown) => {
									console.error('Cortex: failed to open set view', err);
									new Notice('Cortex: failed to open set view.');
								},
							);
						}),
				);
			}
		}
		menu.showAtMouseEvent(evt);
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
