/**
 * The Points tally walk — the logic-heavy heart of the feature, kept pure so it
 * runs under vitest with no Obsidian. A tally is never stored; it is always
 * derived from the link graph, so deleting a point note corrects every affected
 * total with no other action.
 *
 * The graph is plain data the Points shell assembles from the metadata cache:
 * `UNDER` edges between areas (a DAG, but we never trust that — see the cycle
 * guard) and `ON` edges from points to areas. Areas are keyed by their matching
 * identity (see {@link normalizeAreaName}); points by any stable unique id (the
 * shell uses the note path).
 *
 * The rule: an area's total is every point `ON` it *or on any area reachable
 * downward through `UNDER`*, counted once per point. Points roll upward only.
 */

/** An area's matching identity (from `normalizeAreaName`). */
export type AreaId = string;

/** A stable unique id for a point note (the shell uses its vault path). */
export type PointId = string;

/** A child area filed beneath a parent: `child UNDER: [[parent]]`. */
export interface UnderEdge {
	child: AreaId;
	parent: AreaId;
}

/** A point landing on an area: `point ON: [[area]]`. */
export interface OnEdge {
	point: PointId;
	area: AreaId;
}

/**
 * The Points link graph, pre-indexed for the walk. Build it with
 * {@link buildGraph}; don't assemble one by hand.
 */
export interface PointGraph {
	/** Every area seen in any edge. */
	areas: Set<AreaId>;
	/** Parent → its direct children (the reverse of `UNDER`, for walking down). */
	children: Map<AreaId, Set<AreaId>>;
	/** Area → the ids of points `ON` it directly. */
	pointsOn: Map<AreaId, Set<PointId>>;
}

/** Add `value` to the set stored at `key`, creating the set on first use. */
function pushInto<K, V>(map: Map<K, Set<V>>, key: K, value: V): void {
	let set = map.get(key);
	if (!set) {
		set = new Set<V>();
		map.set(key, set);
	}
	set.add(value);
}

/**
 * Index a flat list of `UNDER` and `ON` edges into a {@link PointGraph}. Every
 * area referenced by either edge kind is registered in `areas`, so an area with
 * points but no parent/child still tallies. A point mapped to more than one area
 * (which shouldn't happen — a point has one `ON`) is simply recorded on each.
 */
export function buildGraph(under: UnderEdge[], on: OnEdge[]): PointGraph {
	const areas = new Set<AreaId>();
	const children = new Map<AreaId, Set<AreaId>>();
	const pointsOn = new Map<AreaId, Set<PointId>>();

	for (const { child, parent } of under) {
		areas.add(child);
		areas.add(parent);
		pushInto(children, parent, child);
	}
	for (const { point, area } of on) {
		areas.add(area);
		pushInto(pointsOn, area, point);
	}

	return { areas, children, pointsOn };
}

/**
 * Every area reachable downward from `area` through `UNDER`, including `area`
 * itself. Cycle-safe: a `visited` set means a stray `A UNDER B, B UNDER A` loop
 * terminates instead of hanging, and a diamond is walked once.
 */
export function descendants(graph: PointGraph, area: AreaId): Set<AreaId> {
	const seen = new Set<AreaId>();
	const stack: AreaId[] = [area];
	while (stack.length > 0) {
		const current = stack.pop() as AreaId;
		if (seen.has(current)) {
			continue;
		}
		seen.add(current);
		for (const child of graph.children.get(current) ?? []) {
			if (!seen.has(child)) {
				stack.push(child);
			}
		}
	}
	return seen;
}

/**
 * The total for one area: the number of distinct points `ON` it or on any of
 * its descendants. A point reachable through several `UNDER` paths (a diamond)
 * counts once, because we collect the point ids into a set before counting.
 */
export function tallyFor(graph: PointGraph, area: AreaId): number {
	const reachable = descendants(graph, area);
	const points = new Set<PointId>();
	for (const areaId of reachable) {
		for (const point of graph.pointsOn.get(areaId) ?? []) {
			points.add(point);
		}
	}
	return points.size;
}

/** The total for every area in the graph, keyed by area id. */
export function tallyAll(graph: PointGraph): Map<AreaId, number> {
	const totals = new Map<AreaId, number>();
	for (const area of graph.areas) {
		totals.set(area, tallyFor(graph, area));
	}
	return totals;
}
