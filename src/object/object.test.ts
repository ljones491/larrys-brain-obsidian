import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { listObjects, ObjectKindOption, pickRandom } from './object';
import { OBJECT_KIND_TAG } from './object-note';

/** A vault file with the frontmatter its metadata cache will report. */
interface SeedNote {
	frontmatter?: Record<string, unknown>;
}

/**
 * In-memory stand-in for the slice of {@link App} the object readers touch: a
 * vault of markdown files and a metadata cache returning each file's seeded
 * frontmatter.
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

const bookKind: ObjectKindOption = {
	name: 'book',
	def: { objectTag: 'object/book', properties: ['author', 'status'] },
	file: {} as TFile,
};

describe('listObjects', () => {
	it('returns only instances carrying the kind tag, read back and sorted', () => {
		const app = fakeApp({
			'Dune.md': {
				frontmatter: { tags: ['object/book'], author: 'Frank Herbert', status: 'read' },
			},
			'Annihilation.md': {
				frontmatter: { tags: ['object/book'], author: 'Jeff VanderMeer', status: '' },
			},
			// Wrong tag, and the kind's own definition note: neither is a member.
			'singing.md': { frontmatter: { tags: ['object/skill'] } },
			'book.md': { frontmatter: { tags: [OBJECT_KIND_TAG], 'object-tag': 'object/book' } },
		});

		const objects = listObjects(app, bookKind);

		expect(objects.map((o) => o.name)).toEqual(['Annihilation', 'Dune']);
		expect(objects[1]?.instance.properties).toEqual({
			author: 'Frank Herbert',
			status: 'read',
		});
	});

	it('returns an empty set when no instances exist', () => {
		const app = fakeApp({ 'singing.md': { frontmatter: { tags: ['object/skill'] } } });
		expect(listObjects(app, bookKind)).toEqual([]);
	});
});

describe('pickRandom', () => {
	it('returns null for an empty set', () => {
		expect(pickRandom([])).toBeNull();
	});

	it('indexes by the injected rng', () => {
		const items = ['a', 'b', 'c'];
		expect(pickRandom(items, () => 0)).toBe('a');
		expect(pickRandom(items, () => 0.5)).toBe('b');
		// Guard the upper edge: rng can return values approaching 1.
		expect(pickRandom(items, () => 0.999)).toBe('c');
	});
});
