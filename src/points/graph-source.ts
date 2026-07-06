import type { App, TFile } from 'obsidian';
import { parseEdgeTargets } from '../edge';
import {
	buildGraph,
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
