import { describe, it, expect } from 'vitest';
import type { App, TFile } from 'obsidian';
import { appendEdge, buildEdgeLine, normalizeEdgeType } from './edge';

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
