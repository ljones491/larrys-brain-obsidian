import { describe, expect, it } from 'vitest';
import { toEdges } from './graph-source';
import { buildGraph, tallyFor } from './tally';
import { buildAreaNoteContents, buildPointNoteContents } from './note';
import { buildEdgeLine } from '../edge';
import { UNDER_EDGE } from './constants';

describe('toEdges', () => {
	it('reads ON edges from point bodies, keyed by point path', () => {
		const { on, under } = toEdges(
			[{ basename: 'Dishes', body: buildAreaNoteContents('Dishes') }],
			[{ id: 'p/1.md', body: buildPointNoteContents('Dishes') }],
		);
		expect(under).toEqual([]);
		expect(on).toEqual([{ point: 'p/1.md', area: 'dishes' }]);
	});

	it('reads UNDER edges from area bodies as child→parent', () => {
		const dishes =
			buildAreaNoteContents('Dishes') + buildEdgeLine(UNDER_EDGE, 'Chores');
		const { under } = toEdges(
			[
				{ basename: 'Dishes', body: dishes },
				{ basename: 'Chores', body: buildAreaNoteContents('Chores') },
			],
			[],
		);
		expect(under).toEqual([{ child: 'dishes', parent: 'chores' }]);
	});

	it('normalizes casing/whitespace so an edge lands on the named area', () => {
		const { on } = toEdges(
			[{ basename: 'The Dishes', body: buildAreaNoteContents('The Dishes') }],
			[{ id: 'p/1.md', body: buildPointNoteContents('  the   dishes ') }],
		);
		expect(on).toEqual([{ point: 'p/1.md', area: 'the dishes' }]);
	});

	it('feeds a graph that tallies a rolled-up hierarchy end to end', () => {
		const dishes =
			buildAreaNoteContents('Dishes') + buildEdgeLine(UNDER_EDGE, 'Chores');
		const { under, on } = toEdges(
			[
				{ basename: 'Dishes', body: dishes },
				{ basename: 'Chores', body: buildAreaNoteContents('Chores') },
			],
			[
				{ id: 'p/1.md', body: buildPointNoteContents('Dishes') },
				{ id: 'p/2.md', body: buildPointNoteContents('Chores') },
			],
		);
		const graph = buildGraph(under, on);
		expect(tallyFor(graph, 'chores')).toBe(2);
		expect(tallyFor(graph, 'dishes')).toBe(1);
	});
});
