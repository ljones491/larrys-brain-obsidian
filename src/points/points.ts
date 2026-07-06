import type { App, TFile } from 'obsidian';
import {
	createUniqueNote,
	ensureFolder,
	makeFileStamp,
	sanitizeFileName,
} from '../utils/notes';
import { appendEdge } from '../edge';
import { tallyFor, wouldCreateCycle } from './tally';
import {
	AREAS_FOLDER,
	POINTS_FOLDER,
	UNDER_EDGE,
	normalizeAreaName,
} from './constants';
import { buildAreaNoteContents, buildPointNoteContents } from './note';
import { listAreas, loadPointGraph } from './graph-source';

/**
 * Thrown when filing one area under another would make an area its own ancestor.
 * The shell catches this to report the refusal instead of corrupting the graph
 * with a cycle (GOAL Journey #3). Carries the two area names for the message.
 */
export class PointsCycleError extends Error {
	constructor(
		readonly child: string,
		readonly parent: string,
	) {
		super(`Filing "${child}" under "${parent}" would create a cycle.`);
		this.name = 'PointsCycleError';
	}
}

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

	/**
	 * Create a **top-level** area (or return the existing one with that folded
	 * name). No parentage — filing under a parent is the {@link addSubArea} path.
	 */
	async createTopLevelArea(
		name: string,
	): Promise<{ area: TFile; createdArea: boolean }> {
		return this.resolveArea(name);
	}

	/**
	 * File a **new (or existing) child area `UNDER` an existing parent**. Resolves
	 * the child by folded name (creating it if new), then guards the graph: an edge
	 * that would make an area its own ancestor is refused with {@link PointsCycleError}
	 * rather than written. Otherwise appends the idempotent `UNDER` edge on the
	 * child, so the tally rolls the child's points up into the parent.
	 */
	async addSubArea(
		parentBasename: string,
		childName: string,
	): Promise<{ child: TFile; createdChild: boolean }> {
		const { area: child, createdArea: createdChild } =
			await this.resolveArea(childName);

		const graph = await loadPointGraph(this.app);
		if (
			wouldCreateCycle(
				graph,
				normalizeAreaName(child.basename),
				normalizeAreaName(parentBasename),
			)
		) {
			throw new PointsCycleError(child.basename, parentBasename);
		}

		await appendEdge(this.app, child, UNDER_EDGE, parentBasename, {
			blankLineBefore: true,
		});
		return { child, createdChild };
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
