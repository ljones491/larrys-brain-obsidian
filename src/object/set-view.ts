import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { listObjectKinds, openSetBase } from './object';

/** View type id for the dockable set-view panel. Stable; don't rename. */
export const SET_VIEW_TYPE = 'larrys-brain-set-view';

/**
 * A dockable panel (lives in the right sidebar) listing every OBJECT kind, each
 * with a button that opens its set view (`<name>.base`) in the main view — the
 * "a button I can click to open the base" idea in .dev/GOAL.md. Saves having to
 * remember the base's folder/filename and reach for the quick switcher.
 *
 * The panel is the UI shell; the open action itself is {@link openSetBase}, and
 * the kinds come from {@link listObjectKinds}. It re-renders when kinds change so
 * a newly defined (or deleted/renamed) kind shows up without a manual refresh.
 */
export class SetView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return SET_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Object sets';
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

	/** Rebuild the panel: a row with an open button for each defined kind. */
	private render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('larrys-brain-set-view');

		container.createEl('h4', { text: 'Object sets' });

		const kinds = listObjectKinds(this.app);
		if (kinds.length === 0) {
			container.createEl('p', {
				text: 'No object kinds yet. Define one to see its set here.',
				cls: 'larrys-brain-set-view-empty',
			});
			return;
		}

		const list = container.createDiv({ cls: 'larrys-brain-set-view-list' });
		for (const kind of kinds) {
			const button = list.createEl('button', {
				text: kind.name,
				cls: 'larrys-brain-set-view-item',
			});
			button.addEventListener('click', () => {
				openSetBase(this.app, kind.name, kind.def).catch((err: unknown) => {
					console.error('Object sets: failed to open set view', err);
					new Notice('Object sets: failed to open set view.');
				});
			});
		}
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}
