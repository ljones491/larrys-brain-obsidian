import type { App, TFile } from 'obsidian';
import {
	createUniqueNote,
	ensureFolder,
	makeFileStamp,
	sanitizeFileName,
} from '../utils/notes';
import { tallyFor } from './tally';
import {
	AREAS_FOLDER,
	POINTS_FOLDER,
	normalizeAreaName,
} from './constants';
import { buildAreaNoteContents, buildPointNoteContents } from './note';
import { listAreas, loadPointGraph } from './graph-source';

/** The outcome of spending a point, for the shell to report to the user. */
export interface SpendResult {
	/** The area the point landed on (existing or just created). */
	area: TFile;
	/** The area's live total after this point, derived from the link graph. */
	total: number;
	/** Whether the area note was created for this point (a brand-new area). */
	createdArea: boolean;
}

/**
 * The "spend a point" logic, lifted out of the plugin shell in the same shape as
 * {@link MemoryWeb}: it creates notes and derives totals, but never opens a leaf
 * or a modal — that stays in `main.ts`. Depends only on {@link App}, so the
 * gesture is one call the command wiring can make.
 *
 * A point is a durable, linkable note, not a counter tick: spending creates a
 * tiny timestamped point note with one `ON` edge, creating its area hub first if
 * the name is new. The total it reports is derived from the graph on the spot,
 * never stored.
 */
export class PointsBook {
	constructor(private app: App) {}

	/**
	 * Spend a point on the area named `areaName`. Matches an existing area by its
	 * folded identity (case/whitespace-insensitive) so a slip can't fork a
	 * duplicate; creates the area note when the name is new. Then writes the point
	 * note and returns the area's freshly derived total.
	 */
	async spendPoint(areaName: string): Promise<SpendResult> {
		const { area, createdArea } = await this.resolveArea(areaName);
		await this.createPointNote(area.basename);

		// Derive the total after the point note exists, so it's included.
		const graph = await loadPointGraph(this.app);
		const total = tallyFor(graph, normalizeAreaName(area.basename));

		return { area, total, createdArea };
	}

	/** Find the area note whose title matches `name`, or create it. */
	private async resolveArea(
		name: string,
	): Promise<{ area: TFile; createdArea: boolean }> {
		const wanted = normalizeAreaName(name);
		const existing = listAreas(this.app).find(
			(a) => normalizeAreaName(a.name) === wanted,
		);
		if (existing) {
			return { area: existing.file, createdArea: false };
		}

		await ensureFolder(this.app, AREAS_FOLDER);
		const title = sanitizeFileName(name);
		if (title.length === 0) {
			throw new Error(`"${name}" has no usable area name.`);
		}
		const area = await createUniqueNote(
			this.app,
			`${AREAS_FOLDER}/${title}`,
			buildAreaNoteContents(title),
		);
		return { area, createdArea: true };
	}

	/** Create the timestamped point note landing on `areaBasename` via `ON`. */
	private async createPointNote(areaBasename: string): Promise<TFile> {
		await ensureFolder(this.app, POINTS_FOLDER);
		return createUniqueNote(
			this.app,
			`${POINTS_FOLDER}/Point ${makeFileStamp()}`,
			buildPointNoteContents(areaBasename),
		);
	}
}
