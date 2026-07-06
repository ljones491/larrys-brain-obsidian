import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { makeDateStamp } from '../utils/notes';
import { normalizeAreaName } from './constants';
import {
	loadAreaTotals,
	listPoints,
	listTodaysPoints,
	type AreaTotal,
} from './graph-source';

/**
 * View type id for the dockable Points panel. Stable; don't rename — the string
 * is persisted in the workspace layout and would orphan an open panel.
 */
export const POINTS_VIEW_TYPE = 'larrys-brain-points-view';

/**
 * Points — the "view focus" panel (GOAL.md Journey #2), a sibling of Cortex, not
 * a tenant of it. Modelled on the Points CLI's screen: **The big picture**, a
 * chronological mass of tall thin rectangles (one per point, colored by its area,
 * packed edge to edge into a single block of color); a ranked **Legend** mapping
 * each color to its area, total, and child-area count; and **Today**'s log.
 *
 * Everything shown is derived on the spot from the link graph — no tally is ever
 * stored. The panel is read-only: clicking an area opens its note, clicking a
 * logged point opens the point note. It re-renders on vault changes so a freshly
 * spent point shows up without a manual refresh.
 */
export class PointsView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
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

	protected async onOpen(): Promise<void> {
		// Points are spent by creating notes and areas by editing them, so refresh
		// whenever notes appear, disappear, or their frontmatter changes.
		this.registerEvent(this.app.metadataCache.on('changed', () => void this.render()));
		this.registerEvent(this.app.vault.on('create', () => void this.render()));
		this.registerEvent(this.app.vault.on('delete', () => void this.render()));
		this.registerEvent(this.app.vault.on('rename', () => void this.render()));
		await this.render();
	}

	/** Rebuild the panel from the live graph. */
	private async render(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass('larrys-brain-points');

		const areas = await loadAreaTotals(this.app);
		const spent = areas.filter((a) => a.total > 0);

		// One hue per area, keyed by its matching identity and fixed by the rank, so
		// every point rectangle and every legend swatch for an area share a color.
		const hueByArea = new Map<string, number>();
		spent.forEach((area, i) => {
			hueByArea.set(normalizeAreaName(area.name), hueFor(i, spent.length));
		});

		this.renderBigPicture(container, hueByArea, spent.length === 0);
		this.renderLegend(container, spent, hueByArea);
		this.renderToday(container);
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

	/** Ranked legend: swatch, name, total, and child-area count per area. */
	private renderLegend(
		container: HTMLElement,
		spent: AreaTotal[],
		hueByArea: Map<string, number>,
	): void {
		if (spent.length === 0) {
			return;
		}
		const section = container.createDiv({ cls: 'larrys-brain-points-section' });
		this.sectionHeading(section, 'Legend');

		const legend = section.createDiv({ cls: 'larrys-brain-points-legend' });
		for (const area of spent) {
			const row = legend.createDiv({ cls: 'larrys-brain-points-legend-row' });
			const swatch = row.createDiv({ cls: 'larrys-brain-points-swatch' });
			swatch.style.setProperty(
				'--points-hue',
				String(hueByArea.get(normalizeAreaName(area.name)) ?? 0),
			);
			row.createSpan({ text: area.name, cls: 'larrys-brain-points-legend-name' });
			row.createSpan({
				text: String(area.total),
				cls: 'larrys-brain-points-legend-total',
			});
			if (area.childCount > 0) {
				row.createSpan({
					text: `${area.childCount} child area${area.childCount === 1 ? '' : 's'}`,
					cls: 'larrys-brain-points-legend-children',
				});
			}
			row.addEventListener('click', () => this.openFile(area.file));
		}
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

/** A distinct hue per rank, spread around the wheel so neighbors read apart. */
function hueFor(index: number, count: number): number {
	return Math.round((360 * index) / Math.max(count, 1));
}

/** Format a timestamp as `HH:MM`, matching the file-stamp time convention. */
function formatTime(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
