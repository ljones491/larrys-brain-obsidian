import type { App, TFile } from 'obsidian';
import { parseEdgeTargets } from '../edge';
import {
	buildGraph,
	tallyFor,
	type OnEdge,
	type PointGraph,
	type UnderEdge,
} from './tally';
import { normalizeAreaName, ON_EDGE, UNDER_EDGE } from './constants';
import { isAreaFrontmatter, isPointFrontmatter } from './note';

/**
 * The seam that turns the vault into the plain edge arrays {@link buildGraph}
 * expects — the piece the pure tally foundation deliberately left out. Edges are
 * written in note *bodies* (`TYPE: [[Target]]`), not frontmatter, so the link
 * cache can't give them back with their type; the bodies are parsed here.
 *
 * The parsing ({@link toEdges}) is pure and testable with plain note text; the
 * vault reads that gather the notes and their bodies live in the `App` shell
 * below.
 */

/** An area note reduced to what edge-building needs: its title and its body. */
export interface AreaSource {
	basename: string;
	body: string;
}

/** A point note reduced to a stable id (its path) and its body. */
export interface PointSource {
	id: string;
	body: string;
}

/**
 * Turn area and point note sources into the `UNDER`/`ON` edge arrays the tally
 * graph is built from. Area ids are the matching identity of the note title (so
 * "Dishes" and "dishes" are one area); an `UNDER`/`ON` target is normalized the
 * same way so an edge lands on the area it names regardless of casing. A point's
 * id is its own path — the dedupe key that makes a diamond count once.
 */
export function toEdges(
	areas: AreaSource[],
	points: PointSource[],
): { under: UnderEdge[]; on: OnEdge[] } {
	const under: UnderEdge[] = [];
	for (const area of areas) {
		const child = normalizeAreaName(area.basename);
		for (const parent of parseEdgeTargets(area.body, UNDER_EDGE)) {
			under.push({ child, parent: normalizeAreaName(parent) });
		}
	}

	const on: OnEdge[] = [];
	for (const point of points) {
		for (const area of parseEdgeTargets(point.body, ON_EDGE)) {
			on.push({ point: point.id, area: normalizeAreaName(area) });
		}
	}

	return { under, on };
}

/** An existing area note, for the spend modal to list and match against. */
export interface AreaEntry {
	file: TFile;
	/** The note's title as the user typed it — the display and link name. */
	name: string;
}

/**
 * Every existing **area** note in the vault, recognized by its `#points/area`
 * tag from the (warm) metadata cache. The spend modal lists these to filter and
 * to match a typed name against, so a point lands on the existing area instead
 * of forking a duplicate.
 */
export function listAreas(app: App): AreaEntry[] {
	const areas: AreaEntry[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isAreaFrontmatter(frontmatter)) {
			areas.push({ file, name: file.basename });
		}
	}
	return areas;
}

/**
 * Assemble the live {@link PointGraph} from the vault: read every area and point
 * note's body, parse their edges, and index them. The graph is derived on the
 * spot and thrown away — a tally is never stored — so a deleted point simply
 * isn't read and every affected total corrects itself.
 *
 * Reads bodies with `cachedRead` (view-oriented, no write intent). Points and
 * areas are recognized by tag, so their folder layout can move without touching
 * this.
 */
export async function loadPointGraph(app: App): Promise<PointGraph> {
	const areaSources: AreaSource[] = [];
	const pointSources: PointSource[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		if (isAreaFrontmatter(frontmatter)) {
			areaSources.push({
				basename: file.basename,
				body: await app.vault.cachedRead(file),
			});
		} else if (isPointFrontmatter(frontmatter)) {
			pointSources.push({
				id: file.path,
				body: await app.vault.cachedRead(file),
			});
		}
	}

	const { under, on } = toEdges(areaSources, pointSources);
	return buildGraph(under, on);
}

/** An area with its live, derived total — the row a ranked panel renders. */
export interface AreaTotal {
	file: TFile;
	/** The note's title, for display and to open the area on click. */
	name: string;
	/** Points `ON` this area or anything under it, derived on the spot. */
	total: number;
	/** How many areas sit directly `UNDER` this one, for the legend. */
	childCount: number;
}

/**
 * Every area note with its derived total, ranked most-focused first (ties broken
 * by name so the order is stable). The Points panel renders this as its colored
 * squares and legend. Totals come from one graph load, so a diamond still counts
 * a point once and a deleted point simply drops out.
 */
export async function loadAreaTotals(app: App): Promise<AreaTotal[]> {
	const graph = await loadPointGraph(app);
	const totals = listAreas(app).map(({ file, name }) => {
		const id = normalizeAreaName(name);
		return {
			file,
			name,
			total: tallyFor(graph, id),
			childCount: graph.children.get(id)?.size ?? 0,
		};
	});
	totals.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
	return totals;
}

/** A single point event: the note, the area it landed on, and when. */
export interface PointEntry {
	file: TFile;
	/** The area's link target (basename), from the point's single `ON` edge. */
	area: string;
	/** The `date` frontmatter stamp (`YYYY-MM-DD`), when present as a string. */
	date: string | undefined;
	/** Modification time, for chronological ordering and the time of day. */
	when: number;
}

/**
 * Every point note in the vault, oldest first — the chronological spine the
 * panel draws as a line of squares. Recognizes points by tag and reads the
 * `date` frontmatter and the `ON` link target straight from the (warm) metadata
 * cache, so no note bodies are read. A point with no resolvable area is skipped
 * rather than shown blank.
 */
export function listPoints(app: App): PointEntry[] {
	const points: PointEntry[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		if (!isPointFrontmatter(cache?.frontmatter)) {
			continue;
		}
		// A point's only link is its `ON` edge; take its target, minus any alias.
		const link = cache?.links?.[0]?.link;
		if (!link) {
			continue;
		}
		const date: unknown = cache?.frontmatter?.['date'];
		points.push({
			file,
			area: link.replace(/\|.*$/, '').trim(),
			date: typeof date === 'string' ? date : undefined,
			when: file.stat.mtime,
		});
	}
	points.sort((a, b) => a.when - b.when);
	return points;
}

/**
 * The point notes stamped `today` (a `YYYY-MM-DD` date stamp), newest first —
 * the panel's "today's log". A filtered, reversed view of {@link listPoints}.
 */
export function listTodaysPoints(app: App, today: string): PointEntry[] {
	return listPoints(app)
		.filter((p) => p.date === today)
		.reverse();
}
