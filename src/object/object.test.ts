import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import {
	listObjects,
	ObjectKindOption,
	openSetBase,
	pickRandom,
	promoteToObject,
	setBasePath,
} from './object';
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
	 * A fake app over a single note, exposing the read/modify/rename slice
	 * {@link promoteToObject} touches plus the metadata cache. `renameFile` mutates
	 * the file's path/basename like Obsidian does. Returns the app, the file, and a
	 * getter for its current contents.
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
			parent: { path: '/' },
		} as unknown as TFile;
		const app = {
			vault: {
				getFiles: () => [file],
				read: (f: TFile) => Promise.resolve(f === file ? contents : ''),
				modify: (f: TFile, data: string) => {
					if (f === file) {
						contents = data;
					}
					return Promise.resolve();
				},
			},
			fileManager: {
				renameFile: (f: TFile, newPath: string) => {
					if (f === file) {
						file.path = newPath;
						file.basename = newPath.replace(/\.md$/, '').split('/').pop() ?? newPath;
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

	it('strips the title suffix from the filename on promote', async () => {
		const raw = '---\ntags:\n  - thought\n---\nA loose thought.';
		const { app, file } = fakeAppWithNote('Dune - hmm.md', raw, { tags: ['thought'] });

		await promoteToObject(app, file, bookKind, { dropTag: 'thought', titleSuffix: 'hmm' });

		expect(file.path).toBe('Dune.md');
		expect(file.basename).toBe('Dune');
	});
});

describe('setBasePath', () => {
	it('derives the .base path under the sets folder from the kind name', () => {
		expect(setBasePath('book', bookKind.def)).toBe('sets/book.base');
	});

	it('falls back to the instance tag leaf when the name is unusable', () => {
		expect(setBasePath('  ', bookKind.def)).toBe('sets/book.base');
	});
});

describe('openSetBase', () => {
	/**
	 * A fake app over an in-memory vault exposing the slice {@link openSetBase}
	 * (and {@link writeSetBase} under it) touches: folder/file lookup, create,
	 * read/modify, and a single workspace leaf recording the file it opened.
	 */
	function fakeVaultApp(): {
		app: App;
		paths: () => string[];
		opened: () => string | null;
	} {
		const files = new Map<string, TFile>();
		const folders = new Set<string>();
		const contents = new Map<string, string>();
		let openedPath: string | null = null;
		const make = (path: string): TFile =>
			Object.assign(new TFile(), {
				path,
				basename: path.replace(/\.[^.]+$/, '').split('/').pop() ?? path,
			});
		const app = {
			vault: {
				getAbstractFileByPath: (path: string) =>
					files.get(path) ?? (folders.has(path) ? ({ path } as unknown) : null),
				createFolder: (path: string) => {
					folders.add(path);
					return Promise.resolve();
				},
				create: (path: string, data: string) => {
					const file = make(path);
					files.set(path, file);
					contents.set(path, data);
					return Promise.resolve(file);
				},
				read: (file: TFile) => Promise.resolve(contents.get(file.path) ?? ''),
				modify: (file: TFile, data: string) => {
					contents.set(file.path, data);
					return Promise.resolve();
				},
			},
			workspace: {
				getLeaf: () => ({
					openFile: (file: TFile) => {
						openedPath = file.path;
						return Promise.resolve();
					},
				}),
			},
		} as unknown as App;
		return { app, paths: () => [...files.keys()], opened: () => openedPath };
	}

	it('creates the base when missing and opens it in the main view', async () => {
		const { app, paths, opened } = fakeVaultApp();

		await openSetBase(app, 'book', bookKind.def);

		expect(paths()).toContain('sets/book.base');
		expect(opened()).toBe('sets/book.base');
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
