import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import {
	listPoints,
	listTodaysPoints,
	loadPointGraph,
	toEdges,
} from './graph-source';
import { buildGraph, tallyFor } from './tally';
import { buildAreaNoteContents } from './note';
import { buildEdgeLine } from '../edge';
import { AREA_TAG, POINT_TAG, UNDER_EDGE } from './constants';

describe('toEdges', () => {
	it('keys a point ON edge (from its cached link) by point path', () => {
		const { on, under } = toEdges(
			[{ basename: 'Dishes', body: buildAreaNoteContents('Dishes') }],
			[{ id: 'p/1.md', area: 'Dishes' }],
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
			[{ id: 'p/1.md', area: '  the   dishes ' }],
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
				{ id: 'p/1.md', area: 'Dishes' },
				{ id: 'p/2.md', area: 'Chores' },
			],
		);
		const graph = buildGraph(under, on);
		expect(tallyFor(graph, 'chores')).toBe(2);
		expect(tallyFor(graph, 'dishes')).toBe(1);
	});
});

/** A stub note: its frontmatter, first link target, body, and mtime, keyed together. */
interface StubNote {
	path: string;
	date?: string;
	tag?: string;
	link?: string;
	body?: string;
	mtime: number;
}

/**
 * Minimal App: getMarkdownFiles + a metadata cache built from stub notes, plus a
 * `cachedRead` that returns the stub `body`. `cachedRead` throws if a note has no
 * body, so a test fails loudly if `loadPointGraph` ever reads a note it shouldn't
 * (the point notes, which must resolve from the link cache alone).
 */
function fakeApp(notes: StubNote[]): App {
	const files = notes.map(
		(n) =>
			({
				path: n.path,
				basename: n.path.replace(/^.*\//, '').replace(/\.md$/, ''),
				stat: { mtime: n.mtime },
			}) as unknown as TFile,
	);
	const byPath = new Map(notes.map((n) => [n.path, n]));
	return {
		vault: {
			getMarkdownFiles: () => files,
			cachedRead: (f: TFile) => {
				const body = byPath.get(f.path)?.body;
				if (body === undefined) {
					throw new Error(`unexpected cachedRead of ${f.path}`);
				}
				return Promise.resolve(body);
			},
		},
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

	it('orders by the stamped date, not mtime, so an edited point keeps its place', () => {
		// `edited` was spent first but touched later (an edit, or an import rewriting
		// it), so its mtime is the newest of the three. It still belongs on 07-03.
		const app = fakeApp([
			{ path: 'p/later.md', date: '2026-07-06', tag: POINT_TAG, link: 'Chores', mtime: 200 },
			{ path: 'p/edited.md', date: '2026-07-03', tag: POINT_TAG, link: 'Dishes', mtime: 900 },
			{ path: 'p/mid.md', date: '2026-07-06', tag: POINT_TAG, link: 'Dishes', mtime: 100 },
		]);
		// Within 07-06, mtime still breaks the tie: mid (100) before later (200).
		expect(listPoints(app).map((p) => p.file.path)).toEqual([
			'p/edited.md',
			'p/mid.md',
			'p/later.md',
		]);
	});

	it("falls back to the mtime's day for a point with no date stamp", () => {
		const day = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
		const app = fakeApp([
			{ path: 'p/stamped.md', date: '2026-07-06', tag: POINT_TAG, link: 'Dishes', mtime: day('2026-07-09') },
			{ path: 'p/unstamped.md', tag: POINT_TAG, link: 'Chores', mtime: day('2026-07-04') },
		]);
		expect(listPoints(app).map((p) => p.file.path)).toEqual([
			'p/unstamped.md',
			'p/stamped.md',
		]);
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

describe('loadPointGraph', () => {
	it('tallies a rolled-up hierarchy, reading point ON edges from the link cache (no body read)', async () => {
		// Points carry no `body`; fakeApp.cachedRead throws if one is read, so this
		// asserts points resolve from their cached link alone.
		const app = fakeApp([
			{
				path: 'Dishes.md',
				tag: AREA_TAG,
				body: buildAreaNoteContents('Dishes') + buildEdgeLine(UNDER_EDGE, 'Chores'),
				mtime: 1,
			},
			{ path: 'Chores.md', tag: AREA_TAG, body: buildAreaNoteContents('Chores'), mtime: 2 },
			{ path: 'p/1.md', tag: POINT_TAG, link: 'Dishes', mtime: 3 },
			{ path: 'p/2.md', tag: POINT_TAG, link: 'Chores', mtime: 4 },
		]);
		const graph = await loadPointGraph(app);
		expect(tallyFor(graph, 'chores')).toBe(2);
		expect(tallyFor(graph, 'dishes')).toBe(1);
	});

	it('skips a point whose ON link the cache has not caught up to', async () => {
		const app = fakeApp([
			{ path: 'Dishes.md', tag: AREA_TAG, body: buildAreaNoteContents('Dishes'), mtime: 1 },
			{ path: 'p/1.md', tag: POINT_TAG, link: 'Dishes', mtime: 2 },
			{ path: 'p/2.md', tag: POINT_TAG, mtime: 3 },
		]);
		const graph = await loadPointGraph(app);
		expect(tallyFor(graph, 'dishes')).toBe(1);
	});
});
