import { describe, expect, it } from 'vitest';
import {
	buildGraph,
	descendants,
	tallyAll,
	tallyFor,
	type OnEdge,
	type UnderEdge,
} from './tally';

/** Convenience: build a graph from terse edge tuples. */
function graph(
	under: Array<[child: string, parent: string]>,
	on: Array<[point: string, area: string]>,
) {
	const underEdges: UnderEdge[] = under.map(([child, parent]) => ({
		child,
		parent,
	}));
	const onEdges: OnEdge[] = on.map(([point, area]) => ({ point, area }));
	return buildGraph(underEdges, onEdges);
}

describe('tallyFor', () => {
	it('counts points landing directly on an area', () => {
		const g = graph(
			[],
			[
				['p1', 'dishes'],
				['p2', 'dishes'],
			],
		);
		expect(tallyFor(g, 'dishes')).toBe(2);
	});

	it('is zero for an area with no points', () => {
		const g = graph([['dishes', 'chores']], []);
		expect(tallyFor(g, 'chores')).toBe(0);
	});

	it('rolls child points up to the parent, not down to children', () => {
		const g = graph(
			[['dishes', 'chores']],
			[
				['p1', 'dishes'],
				['p2', 'chores'],
			],
		);
		// chores = its own point + the child's point.
		expect(tallyFor(g, 'chores')).toBe(2);
		// dishes only sees its own; a parent's points don't flow down.
		expect(tallyFor(g, 'dishes')).toBe(1);
	});

	it('rolls up through multiple UNDER levels', () => {
		const g = graph(
			[
				['dishes', 'kitchen'],
				['kitchen', 'chores'],
			],
			[
				['p1', 'dishes'],
				['p2', 'kitchen'],
				['p3', 'chores'],
			],
		);
		expect(tallyFor(g, 'chores')).toBe(3);
		expect(tallyFor(g, 'kitchen')).toBe(2);
		expect(tallyFor(g, 'dishes')).toBe(1);
	});

	it('counts a point once when a diamond makes it reachable twice', () => {
		// life ← work, life ← home; a point on `shared` sits under both, and
		// `shared` rolls up to `top` through both paths.
		const g = graph(
			[
				['work', 'top'],
				['home', 'top'],
				['shared', 'work'],
				['shared', 'home'],
			],
			[['p1', 'shared']],
		);
		expect(tallyFor(g, 'top')).toBe(1);
	});

	it('terminates on a cycle instead of hanging', () => {
		const g = graph(
			[
				['a', 'b'],
				['b', 'a'],
			],
			[
				['p1', 'a'],
				['p2', 'b'],
			],
		);
		// Each area reaches the whole cycle, so both see both points, once each.
		expect(tallyFor(g, 'a')).toBe(2);
		expect(tallyFor(g, 'b')).toBe(2);
	});
});

describe('descendants', () => {
	it('includes the area itself even with no children', () => {
		const g = graph([], [['p1', 'dishes']]);
		expect([...descendants(g, 'dishes')]).toEqual(['dishes']);
	});

	it('collects the full downward reach', () => {
		const g = graph(
			[
				['dishes', 'kitchen'],
				['kitchen', 'chores'],
			],
			[],
		);
		expect(descendants(g, 'chores')).toEqual(
			new Set(['chores', 'kitchen', 'dishes']),
		);
	});
});

describe('tallyAll', () => {
	it('returns a total for every area referenced by any edge', () => {
		const g = graph(
			[['dishes', 'chores']],
			[['p1', 'dishes']],
		);
		expect(tallyAll(g)).toEqual(
			new Map([
				['dishes', 1],
				['chores', 1],
			]),
		);
	});
});
