import { describe, it, expect } from 'vitest';
import type { App, TFile } from 'obsidian';
import {
	appendEdge,
	buildEdgeLine,
	normalizeEdgeType,
	parseEdgeTargets,
} from './edge';

describe('normalizeEdgeType', () => {
	it('upper-snake-cases free text', () => {
		expect(normalizeEdgeType('relates to')).toBe('RELATES_TO');
		expect(normalizeEdgeType('idea-for')).toBe('IDEA_FOR');
		expect(normalizeEdgeType('Performs')).toBe('PERFORMS');
	});

	it('collapses separators and trims edges', () => {
		expect(normalizeEdgeType('  relates   to  ')).toBe('RELATES_TO');
		expect(normalizeEdgeType('relates - to')).toBe('RELATES_TO');
		expect(normalizeEdgeType('__found__')).toBe('FOUND');
	});

	it('drops characters that have no place in an edge name', () => {
		expect(normalizeEdgeType('idea (for!)')).toBe('IDEA_FOR');
		expect(normalizeEdgeType('a/b:c')).toBe('ABC');
	});

	it('returns empty when nothing usable remains', () => {
		expect(normalizeEdgeType('   ')).toBe('');
		expect(normalizeEdgeType('!!!')).toBe('');
	});
});

describe('buildEdgeLine', () => {
	it('writes TYPE: [[Target]]', () => {
		expect(buildEdgeLine('RELATES_TO', 'My Note')).toBe(
			'RELATES_TO: [[My Note]]',
		);
	});
});

describe('parseEdgeTargets', () => {
	it('reads back the targets of a given edge type, ignoring others', () => {
		const text = [
			'---',
			'tags:',
			'  - points/point',
			'---',
			'ON: [[Dishes]]',
			'RELATES_TO: [[Some thought]]',
			'ON: [[Kitchen]]',
		].join('\n');
		expect(parseEdgeTargets(text, 'ON')).toEqual(['Dishes', 'Kitchen']);
	});

	it('is round-trip with buildEdgeLine', () => {
		const line = buildEdgeLine('UNDER', 'Chores');
		expect(parseEdgeTargets(line, 'UNDER')).toEqual(['Chores']);
	});

	it('strips a display alias down to the linked note', () => {
		expect(parseEdgeTargets('ON: [[Dishes|the dishes]]', 'ON')).toEqual([
			'Dishes',
		]);
	});

	it('tolerates leading whitespace but not a link buried in prose', () => {
		expect(parseEdgeTargets('  ON: [[Dishes]]', 'ON')).toEqual(['Dishes']);
		expect(parseEdgeTargets('a point about ON: [[Dishes]] today', 'ON')).toEqual(
			[],
		);
	});

	it('returns nothing when the type is absent', () => {
		expect(parseEdgeTargets('LINKS: [[Other]]', 'ON')).toEqual([]);
	});
});

/** Minimal vault: read/modify a single in-memory note keyed by path. */
function fakeApp(seed: Record<string, string>) {
	const contents = new Map(Object.entries(seed));
	const file = (path: string): TFile => ({ path } as unknown as TFile);
	const app = {
		vault: {
			read: async (f: TFile): Promise<string> => contents.get(f.path) ?? '',
			modify: async (f: TFile, data: string): Promise<void> => {
				contents.set(f.path, data);
			},
		},
	} as unknown as App;
	return { app, file, contents };
}

describe('appendEdge', () => {
	it('appends an edge line, adding a separating newline when needed', async () => {
		const { app, file, contents } = fakeApp({ 'a.md': 'body text' });
		await appendEdge(app, file('a.md'), 'RELATES_TO', 'Other');
		expect(contents.get('a.md')).toBe('body text\nRELATES_TO: [[Other]]\n');
	});

	it('does not double up the separator when the note already ends in a newline', async () => {
		const { app, file, contents } = fakeApp({ 'a.md': 'body\n' });
		await appendEdge(app, file('a.md'), 'LINKS', 'Other');
		expect(contents.get('a.md')).toBe('body\nLINKS: [[Other]]\n');
	});

	it('leaves a blank line before the edge when asked', async () => {
		const { app, file, contents } = fakeApp({ 'a.md': 'body text' });
		await appendEdge(app, file('a.md'), 'RELATES_TO', 'Other', {
			blankLineBefore: true,
		});
		expect(contents.get('a.md')).toBe('body text\n\nRELATES_TO: [[Other]]\n');
	});

	it('does not pile up blank lines when the note already ends in one', async () => {
		const { app, file, contents } = fakeApp({ 'a.md': 'body\n\n' });
		await appendEdge(app, file('a.md'), 'RELATES_TO', 'Other', {
			blankLineBefore: true,
		});
		expect(contents.get('a.md')).toBe('body\n\nRELATES_TO: [[Other]]\n');
	});

	it('is idempotent for an identical edge', async () => {
		const { app, file, contents } = fakeApp({ 'a.md': 'body\n' });
		await appendEdge(app, file('a.md'), 'FOUND', 'Other');
		await appendEdge(app, file('a.md'), 'FOUND', 'Other');
		const occurrences = contents.get('a.md')!.split('FOUND: [[Other]]').length - 1;
		expect(occurrences).toBe(1);
	});

	it('refuses an empty edge type', async () => {
		const { app, file } = fakeApp({ 'a.md': 'body' });
		await expect(appendEdge(app, file('a.md'), '', 'Other')).rejects.toThrow();
	});
});
