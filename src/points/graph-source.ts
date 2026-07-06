import type { App, CachedMetadata, TFile } from 'obsidian';
import { parseEdgeTargets } from '../edge';
import {
	buildGraph,
	tallyFor,
	type OnEdge,
	type PointGraph,
	type UnderEdge,
} from './tally';
import { normalizeAreaName, UNDER_EDGE } from './constants';
import { isAreaFrontmatter, isPointFrontmatter } from './note';

/**
 * The seam that turns the vault into the plain edge arrays {@link buildGraph}
 * expects — the piece the pure tally foundation deliberately left out.
 *
 * The two note kinds are read asymmetrically, because their edges differ in kind
 * and in count. An **area** carries `UNDER` edges in its *body* (`TYPE: [[Target]]`)
 * and may carry links of other types too, so the link cache can't give them back
 * with their type — its body is read and parsed. There are few areas, so that's
 * cheap. A **point** carries exactly one link, its `ON` edge, so its single
 * cached link *is* that edge with no ambiguity; points are read straight from the
 * metadata cache with no body I/O — the difference that keeps a render over
 * hundreds of point notes off the disk.
 *
 * The edge assembly ({@link toEdges}) is pure and testable with plain values; the
 * vault reads that gather the sources live in the `App` shell below.
 */

/** An area note reduced to what edge-building needs: its title and its body. */
export interface AreaSource {
	basename: string;
	body: string;
}

/**
 * A point note reduced to a stable id (its path) and the raw target of its `ON`
 * edge (the area link, as read from the metadata cache — normalized in
 * {@link toEdges}, not here).
 */
export interface PointSource {
	id: string;
	area: string;
}

/**
 * Turn area and point note sources into the `UNDER`/`ON` edge arrays the tally
 * graph is built from. Area ids are the matching identity of the note title (so
 * "Dishes" and "dishes" are one area); an `UNDER`/`ON` target is normalized the
 * same way so an edge lands on the area it names regardless of casing. A point's
 * id is its own path — the dedupe key that makes a diamond count once. Area
 * `UNDER` edges are parsed from the note body; a point's `ON` target arrives
 * already extracted from the link cache.
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

	const on: OnEdge[] = points.map((point) => ({
		point: point.id,
		area: normalizeAreaName(point.area),
	}));

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
 * Assemble the live {@link PointGraph} from the vault. Area notes are read for
 * their `UNDER` edges (body-parsed with `cachedRead`, view-oriented, no write
 * intent); point notes contribute their `ON` edge straight from the metadata
 * cache link list — no body read per point, the difference that keeps this cheap
 * as points accumulate. The graph is derived on the spot and thrown away — a
 * tally is never stored — so a deleted point simply isn't read and every affected
 * total corrects itself.
 *
 * Points and areas are recognized by tag, so their folder layout can move without
 * touching this. A point whose `ON` link can't be read is skipped rather than
 * counted on a phantom area, matching {@link listPoints}.
 */
export async function loadPointGraph(app: App): Promise<PointGraph> {
	const areaSources: AreaSource[] = [];
	const pointSources: PointSource[] = [];

	for (const file of app.vault.getMarkdownFiles()) {
		const cache = app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;
		if (isAreaFrontmatter(frontmatter)) {
			areaSources.push({
				basename: file.basename,
				body: await app.vault.cachedRead(file),
			});
		} else if (isPointFrontmatter(frontmatter)) {
			const area = pointAreaLink(cache);
			if (area) {
				pointSources.push({ id: file.path, area });
			}
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
 * The Points panel's whole read in one graph load: every area note ranked by its
 * derived total (most-focused first, ties broken by name for a stable order)
 * *and* the graph those totals came from, so the panel can nest the areas into a
 * forest ({@link buildAreaForest}) without loading the vault a second time. A
 * diamond still counts a point once and a deleted point simply drops out.
 */
export async function loadPointsPanel(
	app: App,
): Promise<{ totals: AreaTotal[]; graph: PointGraph }> {
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
	return { totals, graph };
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
 * A point's area target read from the metadata cache: its single link is its `ON`
 * edge, so the first link *is* the area, minus any `|display` alias. Returns
 * `undefined` when the point has no link yet (e.g. the cache hasn't caught up to a
 * just-created note). Shared by {@link loadPointGraph} and {@link listPoints} so
 * both resolve a point's area the same way, with no body read.
 */
function pointAreaLink(cache: CachedMetadata | null): string | undefined {
	const link = cache?.links?.[0]?.link;
	return link ? link.replace(/\|.*$/, '').trim() : undefined;
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
		const area = pointAreaLink(cache);
		if (!area) {
			continue;
		}
		const date: unknown = cache?.frontmatter?.['date'];
		points.push({
			file,
			area,
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
