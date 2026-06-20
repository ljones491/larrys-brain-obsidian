import { describe, it, expect } from 'vitest';
import type { App, TFile } from 'obsidian';
import { MemoryWeb } from './memory-web';
import type { IndexHit, SearchIndexHandle } from './search-index';

/** A vault file, just enough of {@link TFile} for the code under test. */
interface FakeFile {
	path: string;
	basename: string;
	stat: { mtime: number; ctime: number; size: number };
}

function fakeFile(path: string): FakeFile {
	const basename = (path.replace(/\.md$/, '').split('/').pop() ?? path);
	return { path, basename, stat: { mtime: 0, ctime: 0, size: 0 } };
}

/**
 * An in-memory stand-in for the slice of {@link App} MemoryWeb touches: a vault
 * that can create/read/modify notes and a (empty) metadata cache. `modifyError`
 * lets a test simulate a write that fails.
 */
class FakeApp {
	files = new Map<string, FakeFile>();
	contents = new Map<string, string>();
	modifyError: Error | null = null;

	constructor(seed: Record<string, string> = {}) {
		for (const [path, body] of Object.entries(seed)) {
			this.files.set(path, fakeFile(path));
			this.contents.set(path, body);
		}
	}

	vault = {
		getFiles: (): FakeFile[] => [...this.files.values()],
		create: async (path: string, data: string): Promise<FakeFile> => {
			if (this.files.has(path)) throw new Error(`exists: ${path}`);
			const file = fakeFile(path);
			this.files.set(path, file);
			this.contents.set(path, data);
			return file;
		},
		read: async (file: FakeFile): Promise<string> =>
			this.contents.get(file.path) ?? '',
		modify: async (file: FakeFile, data: string): Promise<void> => {
			if (this.modifyError) throw this.modifyError;
			this.contents.set(file.path, data);
		},
	};

	metadataCache = {
		// No frontmatter, so no result reads back as a prior search note.
		getFileCache: (_file: FakeFile) => undefined,
	};
}

/** A stub index that surfaces every file currently in the fake vault. */
function stubIndex(app: FakeApp): SearchIndexHandle {
	return {
		ready: async () => {},
		search: (query: string): IndexHit[] =>
			app.vault.getFiles().map((file) => ({
				file: file as unknown as TFile,
				body: app.contents.get(file.path) ?? '',
				terms: [query],
				score: 1,
			})),
	};
}

function makeWeb(app: FakeApp): MemoryWeb {
	return new MemoryWeb(app as unknown as App, stubIndex(app));
}

describe('MemoryWeb', () => {
	it('excludes its own fresh search note from the results', async () => {
		const app = new FakeApp({ 'dog.md': 'a note about a dog' });
		const session = await makeWeb(app).remember('dog');

		const paths = session.results.map((r) => r.file.path);
		// The pre-existing note is surfaced...
		expect(paths).toContain('dog.md');
		// ...but the search note Remember just created is not.
		expect(session.searchNote.basename).toBe('dog - search');
		expect(paths).not.toContain(session.searchNote.path);
	});

	it('appends exactly one FOUND edge when a result is opened twice', async () => {
		const app = new FakeApp({ 'cat.md': 'a note about a cat' });
		const web = makeWeb(app);
		const session = await web.remember('cat');
		const found = app.vault.getFiles().find((f) => f.path === 'cat.md')!;

		await web.recordFound(session, found as unknown as TFile);
		await web.recordFound(session, found as unknown as TFile);

		const text = await app.vault.read(session.searchNote);
		const edges = text.split('FOUND: [[cat]]').length - 1;
		expect(edges).toBe(1);
	});

	it('surfaces a failed link without losing the session', async () => {
		const app = new FakeApp({ 'fish.md': 'a note about a fish' });
		const web = makeWeb(app);
		const session = await web.remember('fish');
		const results = session.results;
		const found = app.vault.getFiles().find((f) => f.path === 'fish.md')!;

		app.modifyError = new Error('disk full');
		await expect(
			web.recordFound(session, found as unknown as TFile),
		).rejects.toThrow('disk full');

		// The session is intact: same note, same results.
		expect(session.searchNote.basename).toBe('fish - search');
		expect(session.results).toBe(results);

		// And once the failure clears, the same session records the edge.
		app.modifyError = null;
		await web.recordFound(session, found as unknown as TFile);
		expect(await app.vault.read(session.searchNote)).toContain(
			'FOUND: [[fish]]',
		);
	});
});
