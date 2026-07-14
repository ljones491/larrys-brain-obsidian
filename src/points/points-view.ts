import { ItemView, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { makeDateStamp } from '../utils/notes';
import { normalizeAreaName } from './constants';
import { buildAreaForest, type ForestNode } from './tally';
import {
	loadPointsPanel,
	listPoints,
	listTodaysPoints,
	type AreaTotal,
} from './graph-source';
import type LarrysBrainPlugin from '../main';

/**
 * View type id for the dockable Points panel. Stable; don't rename — the string
 * is persisted in the workspace layout and would orphan an open panel.
 */
export const POINTS_VIEW_TYPE = 'larrys-brain-points-view';

/**
 * Points — the "view focus" panel (GOAL.md Journey #2), a sibling of Cortex, not
 * a tenant of it, and now the plugin's *only* front door for spending points.
 * Modelled on the Points CLI's screen: a **New area** button; **The big picture**,
 * a chronological mass of tall thin rectangles (one per point, colored by its
 * area, packed edge to edge into a single block of color); a **nested Legend**
 * mapping each color to its area and total, indented by `UNDER` parentage, where
 * each row spends a point or files a sub-area in one click; and **Today**'s log.
 *
 * A header toggle collapses the panel to a big-picture-only overview — nothing but
 * the mass of color, with the New area button, the legend, and today's log all
 * hidden — persisted in settings so the choice survives reloads.
 *
 * Totals are derived on the spot from the link graph — no tally is ever stored.
 * The reads are read-only (clicking a name opens its note); the writes (spend,
 * create, file-under) are delegated to the plugin shell. It re-renders on vault
 * changes so a freshly spent point or new area shows up without a manual refresh.
 */
export class PointsView extends ItemView {
	constructor(
		leaf: WorkspaceLeaf,
		private plugin: LarrysBrainPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return POINTS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Points';
	}

	getIcon(): string {
		return 'target';
	}

	/** Header toggle; kept so its icon/label can flip when the mode changes. */
	private modeToggle?: HTMLElement;

	protected async onOpen(): Promise<void> {
		// Points are spent by creating notes and areas by editing them, so refresh
		// whenever notes appear, disappear, or their frontmatter changes.
		this.registerEvent(this.app.metadataCache.on('changed', () => void this.render()));
		this.registerEvent(this.app.vault.on('create', () => void this.render()));
		this.registerEvent(this.app.vault.on('delete', () => void this.render()));
		this.registerEvent(this.app.vault.on('rename', () => void this.render()));

		// Header toggle between the full panel and a big-picture-only overview.
		this.modeToggle = this.addAction('image', 'Big picture only', async () => {
			this.plugin.settings.pointsBigPictureOnly =
				!this.plugin.settings.pointsBigPictureOnly;
			await this.plugin.saveSettings();
			this.syncModeToggle();
			await this.render();
		});
		this.syncModeToggle();

		await this.render();
	}

	/** Rebuild the panel from the live graph. */
	private async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass('larrys-brain-points');

		const { totals, graph } = await loadPointsPanel(this.app);
		const spent = totals.filter((a) => a.total > 0);

		// Arrange the areas into the same forest the legend nests, so we know which
		// areas are top-level (the forest roots) and which subtree each area sits in.
		const order = totals.map((a) => normalizeAreaName(a.name));
		const known = new Set(order);
		const forest = buildAreaForest(graph, order, known);

		// One hue per *top-level* area only, spread around the wheel by position, so the
		// palette stays small and readable however deep the tree grows. Every
		// sub-area inherits its root's hue, so a point rolls up into its top-level
		// area's color in the big picture and a whole subtree reads as one color;
		// the legend draws a swatch only on the root row (see renderLegendRow).
		const rootIds = new Set(forest.map((node) => node.id));
		const hueByArea = new Map<string, number>();
		const assignHue = (node: ForestNode, hue: number): void => {
			hueByArea.set(node.id, hue);
			for (const child of node.children) {
				assignHue(child, hue);
			}
		};
		forest.forEach((root, i) => assignHue(root, hueFor(i, forest.length)));

		// Big-picture-only mode is a pure overview: everything but the mass of color
		// drops away, including the write affordances (New area, and the legend's
		// spend / sub-area buttons). Toggle back to the full panel to spend or file.
		if (this.plugin.settings.pointsBigPictureOnly) {
			this.renderBigPicture(container, hueByArea, spent.length === 0);
			return;
		}

		this.renderNewArea(container);
		this.renderBigPicture(container, hueByArea, spent.length === 0);
		this.renderLegend(container, totals, forest, hueByArea, rootIds);
		this.renderToday(container);
	}

	/** Reflect the current mode in the header toggle's icon and label. */
	private syncModeToggle(): void {
		if (!this.modeToggle) {
			return;
		}
		const only = this.plugin.settings.pointsBigPictureOnly;
		setIcon(this.modeToggle, only ? 'image' : 'panel-top');
		const label = only ? 'Show all sections' : 'Big picture only';
		this.modeToggle.setAttribute('aria-label', label);
	}

	/** The top-level "New area" button — creates a root area (no parent). */
	private renderNewArea(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'larrys-brain-points-section' });
		const button = section.createEl('button', {
			cls: 'larrys-brain-points-new-area',
		});
		setIcon(button.createSpan({ cls: 'larrys-brain-points-new-area-icon' }), 'plus');
		button.createSpan({ text: 'New area' });
		button.addEventListener('click', () => this.plugin.createNewArea());
	}

	/**
	 * The big picture: one tall thin rectangle per point, oldest to newest, colored
	 * by its area and packed edge to edge so they read as a single mass of color.
	 */
	private renderBigPicture(
		container: HTMLElement,
		hueByArea: Map<string, number>,
		empty: boolean,
	): void {
		const section = container.createDiv({ cls: 'larrys-brain-points-section' });
		this.sectionHeading(section, 'The big picture');

		if (empty) {
			section.createEl('p', {
				text: 'No points spent yet. Spend one to see where your focus goes.',
				cls: 'larrys-brain-points-empty',
			});
			return;
		}

		const mass = section.createDiv({ cls: 'larrys-brain-points-mass' });
		for (const point of listPoints(this.app)) {
			const hue = hueByArea.get(normalizeAreaName(point.area));
			if (hue === undefined) {
				continue; // Area with no total shouldn't happen, but never draw blank.
			}
			const bar = mass.createDiv({ cls: 'larrys-brain-points-bar' });
			bar.style.setProperty('--points-hue', String(hue));
			bar.setAttribute('aria-label', `${point.area} · ${formatTime(point.when)}`);
			bar.addEventListener('click', () => this.openFile(point.file));
		}
	}

	/**
	 * Nested legend: every area indented under its `UNDER` parent, each row a
	 * swatch, name, and derived total, with a spend button and a file-a-sub-area
	 * button. Shows *all* areas (not just spent ones) so a freshly created area is
	 * immediately spendable. Clicking the name opens the area note.
	 */
	private renderLegend(
		container: HTMLElement,
		totals: AreaTotal[],
		forest: ForestNode[],
		hueByArea: Map<string, number>,
		rootIds: Set<string>,
	): void {
		const section = container.createDiv({ cls: 'larrys-brain-points-section' });
		this.sectionHeading(section, 'Legend');

		if (totals.length === 0) {
			section.createEl('p', {
				text: 'No areas yet. Add one to start spending points.',
				cls: 'larrys-brain-points-empty',
			});
			return;
		}

		// Index areas by matching identity so a forest node (keyed by id) finds its
		// display row. The forest (built once in render) nests areas under their
		// parents; siblings follow the alphabetical order of `totals`.
		const byId = new Map<string, AreaTotal>();
		for (const area of totals) {
			byId.set(normalizeAreaName(area.name), area);
		}

		const legend = section.createDiv({ cls: 'larrys-brain-points-legend' });
		const renderNode = (subtree: HTMLElement, node: ForestNode, depth: number): void => {
			const area = byId.get(node.id);
			if (area) {
				this.renderLegendRow(subtree, area, depth, hueByArea, rootIds.has(node.id));
			}
			for (const child of node.children) {
				renderNode(subtree, child, depth + 1);
			}
		};
		// Each root and its descendants render into their own subtree container, so
		// the grid flows whole subtrees as units and never splits one across columns.
		for (const root of forest) {
			const subtree = legend.createDiv({ cls: 'larrys-brain-points-legend-subtree' });
			renderNode(subtree, root, 0);
		}
	}

	/** One legend row: swatch, name, total, and the spend / sub-area actions. */
	private renderLegendRow(
		legend: HTMLElement,
		area: AreaTotal,
		depth: number,
		hueByArea: Map<string, number>,
		isRoot: boolean,
	): void {
		const row = legend.createDiv({ cls: 'larrys-brain-points-legend-row' });
		row.style.setProperty('--points-depth', String(depth));

		// Only top-level areas carry a colored swatch, keeping the palette small so
		// trends stay distinguishable. A sub-area renders an empty placeholder of the
		// same width so its name still lines up under its siblings' names.
		const swatch = row.createDiv({
			cls: isRoot
				? 'larrys-brain-points-swatch'
				: 'larrys-brain-points-swatch larrys-brain-points-swatch--empty',
		});
		if (isRoot) {
			swatch.style.setProperty(
				'--points-hue',
				String(hueByArea.get(normalizeAreaName(area.name)) ?? 0),
			);
		}

		const name = row.createSpan({
			text: area.name,
			cls: 'larrys-brain-points-legend-name',
		});
		name.addEventListener('click', () => this.openFile(area.file));

		row.createSpan({
			text: String(area.total),
			cls: 'larrys-brain-points-legend-total',
		});

		const actions = row.createDiv({ cls: 'larrys-brain-points-legend-actions' });
		const spend = actions.createEl('button', {
			cls: 'larrys-brain-points-spend',
			attr: { 'aria-label': `Spend a point on ${area.name}` },
		});
		setIcon(spend, 'plus');
		spend.addEventListener('click', () => this.plugin.spendPointOnArea(area.name));

		const sub = actions.createEl('button', {
			cls: 'larrys-brain-points-subarea',
			attr: { 'aria-label': `Add a sub-area under ${area.name}` },
		});
		setIcon(sub, 'git-branch-plus');
		sub.addEventListener('click', () => this.plugin.addSubArea(area.name));
	}

	/** Today's points, newest first — a compact log with the time of day. */
	private renderToday(container: HTMLElement): void {
		const section = container.createDiv({ cls: 'larrys-brain-points-section' });
		this.sectionHeading(section, 'Today');

		const today = listTodaysPoints(this.app, makeDateStamp());
		if (today.length === 0) {
			section.createEl('p', {
				text: 'No points today.',
				cls: 'larrys-brain-points-empty',
			});
			return;
		}

		const list = section.createDiv({ cls: 'larrys-brain-points-log' });
		for (const point of today) {
			const row = list.createDiv({ cls: 'larrys-brain-points-log-row' });
			row.createSpan({
				text: formatTime(point.when),
				cls: 'larrys-brain-points-log-time',
			});
			row.createSpan({ text: point.area, cls: 'larrys-brain-points-log-area' });
			row.addEventListener('click', () => this.openFile(point.file));
		}
	}

	/** A section heading with a rule trailing off to the right, CLI-style. */
	private sectionHeading(section: HTMLElement, text: string): void {
		const heading = section.createDiv({
			cls: 'larrys-brain-points-section-heading',
		});
		heading.createSpan({ text });
		heading.createDiv({ cls: 'larrys-brain-points-rule' });
	}

	/** Open a note (area or point) in the main view. */
	private openFile(file: TFile): void {
		this.app.workspace
			.getLeaf(false)
			.openFile(file)
			.catch((err: unknown) => {
				console.error('Points: failed to open note', err);
				new Notice('Points: failed to open note.');
			});
	}

	protected async onClose(): Promise<void> {
		this.contentEl.empty();
	}
}

/**
 * A distinct hue per top-level area, spread around the wheel so neighbors read
 * apart. Keyed by root rank (not per-area), so the palette stays small however
 * deep the `UNDER` tree grows.
 */
function hueFor(index: number, count: number): number {
	return Math.round((360 * index) / Math.max(count, 1));
}

/** Format a timestamp as `HH:MM`, matching the file-stamp time convention. */
function formatTime(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
