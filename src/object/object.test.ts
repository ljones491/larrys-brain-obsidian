import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { listObjects, ObjectKindOption, pickRandom, promoteToObject } from './object';
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

describe('promoteToObject', () => {
	/**
	 * A fake app over a single note, exposing the read/modify slice
	 * {@link promoteToObject} touches plus the metadata cache. Returns the app
	 * and a getter for the note's current contents.
	 */
	function fakeAppWithNote(
		path: string,
		raw: string,
		frontmatter?: Record<string, unknown>,
	): { app: App; file: TFile; current: () => string } {
		let contents = raw;
		const file = {
			path,
			basename: path.replace(/\.md$/, '').split('/').pop() ?? path,
		} as unknown as TFile;
		const app = {
			vault: {
				read: (f: TFile) => Promise.resolve(f === file ? contents : ''),
				modify: (f: TFile, data: string) => {
					if (f === file) {
						contents = data;
					}
					return Promise.resolve();
				},
			},
			metadataCache: {
				getFileCache: (f: TFile) => ({
					frontmatter: f === file ? frontmatter : undefined,
				}),
			},
		} as unknown as App;
		return { app, file, current: () => contents };
	}

	it('rewrites the note in place: body kept, tag swapped, properties seeded', async () => {
		const raw = [
			'---',
			'date: 2026-06-01 0900',
			'tags:',
			'  - thought',
			'source: user',
			'---',
			'',
			'Dune is a great book about sandworms.',
		].join('\n');
		const { app, file, current } = fakeAppWithNote('Dune.md', raw, {
			date: '2026-06-01 0900',
			tags: ['thought'],
			author: 'Frank Herbert',
			source: 'user',
		});

		await promoteToObject(app, file, bookKind, { dropTag: 'thought' });

		const result = current();
		// Body survives verbatim, the memory tag is swapped for the instance tag,
		// declared properties show (author seeded from frontmatter, status blank),
		// and the original date/source are preserved.
		expect(result.endsWith('Dune is a great book about sandworms.')).toBe(true);
		expect(result).toContain('  - object/book');
		expect(result).not.toContain('  - thought');
		expect(result).toContain('author: Frank Herbert');
		expect(result).toContain('status:\n');
		expect(result).toContain('date: 2026-06-01 0900');
		expect(result).toContain('source: user');
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
