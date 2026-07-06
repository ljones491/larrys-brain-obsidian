import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { listPoints, listTodaysPoints, toEdges } from './graph-source';
import { buildGraph, tallyFor } from './tally';
import { buildAreaNoteContents, buildPointNoteContents } from './note';
import { buildEdgeLine } from '../edge';
import { POINT_TAG, UNDER_EDGE } from './constants';

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

/** A stub note: its frontmatter, first link target, and mtime, keyed together. */
interface StubNote {
	path: string;
	date?: string;
	tag?: string;
	link?: string;
	mtime: number;
}

/** Minimal App: getMarkdownFiles + a metadata cache built from stub notes. */
function fakeApp(notes: StubNote[]): App {
	const files = notes.map(
		(n) => ({ path: n.path, stat: { mtime: n.mtime } }) as unknown as TFile,
	);
	const byPath = new Map(notes.map((n) => [n.path, n]));
	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (f: TFile) => {
				const n = byPath.get(f.path);
				if (!n) return undefined;
				return {
					frontmatter: n.tag ? { date: n.date, tags: [n.tag] } : undefined,
					links: n.link ? [{ link: n.link }] : undefined,
				};
			},
		},
	} as unknown as App;
}

describe('listPoints', () => {
	it('returns every point, oldest first, with area and date; skips non-points', () => {
		const app = fakeApp([
			{ path: 'p/b.md', date: '2026-07-06', tag: POINT_TAG, link: 'Chores', mtime: 300 },
			{ path: 'p/a.md', date: '2026-07-05', tag: POINT_TAG, link: 'Dishes', mtime: 100 },
			{ path: 'Dishes.md', date: '2026-07-06', tag: 'points/area', mtime: 400 },
		]);
		expect(listPoints(app)).toEqual([
			{
				file: expect.objectContaining({ path: 'p/a.md' }),
				area: 'Dishes',
				date: '2026-07-05',
				when: 100,
			},
			{
				file: expect.objectContaining({ path: 'p/b.md' }),
				area: 'Chores',
				date: '2026-07-06',
				when: 300,
			},
		]);
	});

	it('strips a display alias from the area link', () => {
		const app = fakeApp([
			{
				path: 'p/a.md',
				date: '2026-07-06',
				tag: POINT_TAG,
				link: 'Dishes|the dishes',
				mtime: 1,
			},
		]);
		expect(listPoints(app)[0]?.area).toBe('Dishes');
	});

	it('skips a point with no resolvable area link', () => {
		const app = fakeApp([
			{ path: 'p/a.md', date: '2026-07-06', tag: POINT_TAG, mtime: 1 },
		]);
		expect(listPoints(app)).toEqual([]);
	});
});

describe('listTodaysPoints', () => {
	it('keeps only points stamped today, newest first', () => {
		const app = fakeApp([
			{ path: 'p/a.md', date: '2026-07-06', tag: POINT_TAG, link: 'Dishes', mtime: 100 },
			{ path: 'p/b.md', date: '2026-07-06', tag: POINT_TAG, link: 'Chores', mtime: 300 },
			{ path: 'p/old.md', date: '2026-07-05', tag: POINT_TAG, link: 'Dishes', mtime: 200 },
		]);
		expect(listTodaysPoints(app, '2026-07-06').map((p) => p.file.path)).toEqual([
			'p/b.md',
			'p/a.md',
		]);
	});
});
