import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { isThoughtNote, listThoughtNotes } from './thought';

/** A vault file with the frontmatter its metadata cache will report. */
interface SeedNote {
	frontmatter?: Record<string, unknown>;
}

/**
 * In-memory stand-in for the slice of {@link App} the thought reader touches: a
 * vault of markdown files and a metadata cache returning each file's seeded
 * frontmatter. Mirrors the object tests' fake.
 */
function fakeApp(seed: Record<string, SeedNote>): App {
	const files = Object.keys(seed).map((path) => ({
		path,
		basename: path.replace(/\.md$/, '').split('/').pop() ?? path,
	}));
	return {
		vault: {
			getMarkdownFiles: () => files as unknown as TFile[],
		},
		metadataCache: {
			getFileCache: (file: TFile) => ({
				frontmatter: seed[file.path]?.frontmatter,
			}),
		},
	} as unknown as App;
}

describe('isThoughtNote', () => {
	it('accepts the configured tag as a list or a single string', () => {
		expect(isThoughtNote({ tags: ['thought'] }, 'thought')).toBe(true);
		expect(isThoughtNote({ tags: 'thought' }, 'thought')).toBe(true);
	});

	it('normalizes the tag and a leading # on either side', () => {
		expect(isThoughtNote({ tags: ['Thought'] }, '#thought')).toBe(true);
		expect(isThoughtNote({ tags: ['skill area'] }, 'skill area')).toBe(true);
	});

	it('rejects notes without the tag, with no frontmatter, or a blank tag', () => {
		expect(isThoughtNote({ tags: ['object/book'] }, 'thought')).toBe(false);
		expect(isThoughtNote(undefined, 'thought')).toBe(false);
		expect(isThoughtNote({ tags: ['thought'] }, '')).toBe(false);
	});

	it('never counts a meta note as a thought, even if it also carries the tag', () => {
		expect(
			isThoughtNote({ tags: ['larrys-meta/object-kind', 'thought'] }, 'thought'),
		).toBe(false);
	});
});

describe('listThoughtNotes', () => {
	it('returns only thought notes, sorted, skipping objects and meta', () => {
		const app = fakeApp({
			'Zeta thought.md': { frontmatter: { tags: ['thought'] } },
			'Alpha thought.md': { frontmatter: { tags: ['thought'] } },
			// A promoted object no longer carries the thought tag.
			'Dune.md': { frontmatter: { tags: ['object/book'] } },
			// Meta notes are excluded by folder even if their frontmatter is stale.
			'larrys-meta/book.md': { frontmatter: { tags: ['thought'] } },
		});

		const names = listThoughtNotes(app, 'thought').map((f) => f.basename);
		expect(names).toEqual(['Alpha thought', 'Zeta thought']);
	});
});
