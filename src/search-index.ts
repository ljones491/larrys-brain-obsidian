import { App, DataAdapter, TFile } from 'obsidian';
import MiniSearch, { AsPlainObject, Options } from 'minisearch';

/**
 * What we keep in the index per note. `body` is stored so result snippets can
 * be built without re-reading the file on every search.
 */
interface IndexedNote {
	/** `file.path` — the stable key MiniSearch identifies a document by. */
	id: string;
	title: string;
	body: string;
}

/** A single index hit, mapped back to its live {@link TFile}. */
export interface IndexHit {
	file: TFile;
	/** The note body (frontmatter stripped), for snippet building. */
	body: string;
	/** Matched terms, so the UI can highlight them. */
	terms: string[];
	/** BM25 relevance score from MiniSearch. */
	score: number;
}

/**
 * MiniSearch configuration. Defined once so the same options are used to build
 * a fresh index and to restore a persisted one (they must match exactly).
 */
const MINISEARCH_OPTIONS: Options<IndexedNote> = {
	fields: ['title', 'body'], // what gets tokenized + scored
	storeFields: ['title', 'body'], // what comes back on a hit
	idField: 'id',
	searchOptions: {
		boost: { title: 2 }, // title hits outrank body hits
		prefix: true, // "rememb" matches "remember"
		fuzzy: 0.2, // typo tolerance, ~free from MiniSearch
	},
};

/** Shape persisted to disk. `version` lets us reject incompatible snapshots. */
interface Snapshot {
	version: number;
	/** Serialized MiniSearch index (`mini.toJSON()`). */
	index: AsPlainObject;
	/** `[path, mtime]` pairs, so a restored index can be reconciled to disk. */
	mtimes: [string, number][];
}

/** Bump when the index shape or options change, to invalidate old snapshots. */
const SNAPSHOT_VERSION = 1;

/** Coalesce bursts of edits into a single write this many ms after the last. */
const PERSIST_DEBOUNCE_MS = 2000;

/**
 * An inverted index over the vault's notes, built once and queried many times.
 *
 * Replaces the previous read-and-scan-every-note search with read-and-index
 * once at startup, then read only the files that actually change. Queries
 * become synchronous index lookups with BM25 scoring, title boosting, and
 * prefix + fuzzy matching from MiniSearch.
 *
 * The index is persisted to disk so a restart restores it instead of rebuilding
 * from scratch. On restore it is reconciled against the vault — files changed,
 * added, or removed while the plugin was off are re-read or dropped — so a
 * stale snapshot can never serve wrong results.
 */
export class SearchIndex {
	private mini = new MiniSearch<IndexedNote>(MINISEARCH_OPTIONS);

	/** Per-path modification times, mirrored alongside the index for reconcile. */
	private mtimes = new Map<string, number>();

	/** Cached so the one full build runs once even if `build` is called again. */
	private buildPromise: Promise<void> | null = null;

	private persistTimer: number | null = null;

	/**
	 * @param app Obsidian app handle.
	 * @param snapshotPath Vault-relative path to persist the index to, or `null`
	 *   to disable persistence (rebuild every load).
	 */
	constructor(
		private app: App,
		private snapshotPath: string | null = null,
	) {}

	/**
	 * Make the index ready. On the first call it restores the persisted snapshot
	 * (reconciling it against the vault) or, failing that, builds from scratch.
	 * Memoized, so callers — including incremental updates — can await it freely
	 * to be sure the index is ready.
	 */
	build(): Promise<void> {
		if (!this.buildPromise) {
			this.buildPromise = this.load();
		}
		return this.buildPromise;
	}

	/** Resolves once the index is ready, building/restoring it if needed. */
	ready(): Promise<void> {
		return this.build();
	}

	private async load(): Promise<void> {
		if (await this.restore()) {
			await this.reconcile();
		} else {
			await this.rebuild();
		}
	}

	/** Index every note in the vault from scratch. */
	private async rebuild(): Promise<void> {
		const entries = await Promise.all(
			this.app.vault.getMarkdownFiles().map(async (f) => ({
				doc: await this.toDoc(f),
				mtime: f.stat.mtime,
			})),
		);
		this.mini.addAll(entries.map((e) => e.doc));
		for (const { doc, mtime } of entries) {
			this.mtimes.set(doc.id, mtime);
		}
		this.schedulePersist();
	}

	/**
	 * Bring a freshly restored index back in line with the current vault: drop
	 * notes that disappeared and re-read ones whose mtime changed or are new.
	 * Reads only the files that actually differ.
	 */
	private async reconcile(): Promise<void> {
		const files = this.app.vault.getMarkdownFiles();
		const present = new Set(files.map((f) => f.path));

		let changed = false;

		// Drop notes deleted while we were off.
		for (const path of [...this.mtimes.keys()]) {
			if (!present.has(path)) {
				this.remove(path);
				changed = true;
			}
		}

		// Re-read new or modified notes.
		const stale = files.filter(
			(f) => this.mtimes.get(f.path) !== f.stat.mtime,
		);
		const docs = await Promise.all(
			stale.map(async (f) => ({
				doc: await this.toDoc(f),
				mtime: f.stat.mtime,
			})),
		);
		for (const { doc, mtime } of docs) {
			this.put(doc, mtime);
			changed = true;
		}

		if (changed) {
			this.schedulePersist();
		}
	}

	/**
	 * Re-index a single file because it was created or changed. Waits for the
	 * initial build first so an early event can't collide with the full load.
	 */
	async onModify(file: TFile): Promise<void> {
		await this.build();
		this.put(await this.toDoc(file), file.stat.mtime);
		this.schedulePersist();
	}

	/** Drop a file from the index because it was deleted. */
	async onDelete(path: string): Promise<void> {
		await this.build();
		this.remove(path);
		this.schedulePersist();
	}

	/** A query is now a lookup over the inverted index, not a vault scan. */
	search(query: string): IndexHit[] {
		return this.mini
			.search(query)
			.map((hit): IndexHit | null => {
				const file = this.app.vault.getAbstractFileByPath(
					hit.id as string,
				);
				return file instanceof TFile
					? {
							file,
							body: hit.body as string,
							terms: hit.terms,
							score: hit.score,
						}
					: null;
			})
			.filter((r): r is IndexHit => r !== null);
	}

	/** Flush any pending write and stop the timer. Call from `onunload`. */
	async dispose(): Promise<void> {
		if (this.persistTimer !== null) {
			window.clearTimeout(this.persistTimer);
			this.persistTimer = null;
			await this.persist();
		}
	}

	/** Add or replace a document and track its mtime. */
	private put(doc: IndexedNote, mtime: number): void {
		this.remove(doc.id);
		this.mini.add(doc);
		this.mtimes.set(doc.id, mtime);
	}

	/** Remove a document by id, keeping the mtime map in sync. */
	private remove(id: string): void {
		if (this.mini.has(id)) {
			this.mini.discard(id);
		}
		this.mtimes.delete(id);
	}

	private async toDoc(file: TFile): Promise<IndexedNote> {
		const content = await this.app.vault.cachedRead(file);
		// Skip YAML frontmatter so previews and matches are over body text.
		const bodyStart =
			this.app.metadataCache.getFileCache(file)?.frontmatterPosition?.end
				?.offset ?? 0;
		return {
			id: file.path,
			title: file.basename,
			body: content.slice(bodyStart),
		};
	}

	/** Restore the index from disk. Returns false (and leaves it empty) on any
	 * problem, so the caller falls back to a full rebuild. */
	private async restore(): Promise<boolean> {
		if (!this.snapshotPath) {
			return false;
		}
		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(this.snapshotPath))) {
				return false;
			}
			const snapshot = JSON.parse(
				await adapter.read(this.snapshotPath),
			) as Snapshot;
			if (snapshot.version !== SNAPSHOT_VERSION) {
				return false;
			}
			this.mini = MiniSearch.loadJS(snapshot.index, MINISEARCH_OPTIONS);
			this.mtimes = new Map(snapshot.mtimes);
			return true;
		} catch (err) {
			console.warn('Larry\'s Brain: could not restore search index', err);
			return false;
		}
	}

	/** Schedule a debounced write so bursts of edits cost one disk write. */
	private schedulePersist(): void {
		if (!this.snapshotPath) {
			return;
		}
		if (this.persistTimer !== null) {
			window.clearTimeout(this.persistTimer);
		}
		this.persistTimer = window.setTimeout(() => {
			this.persistTimer = null;
			void this.persist();
		}, PERSIST_DEBOUNCE_MS);
	}

	private async persist(): Promise<void> {
		if (!this.snapshotPath) {
			return;
		}
		const snapshot: Snapshot = {
			version: SNAPSHOT_VERSION,
			index: this.mini.toJSON(),
			mtimes: [...this.mtimes],
		};
		try {
			const adapter: DataAdapter = this.app.vault.adapter;
			await adapter.write(this.snapshotPath, JSON.stringify(snapshot));
		} catch (err) {
			console.warn('Larry\'s Brain: could not persist search index', err);
		}
	}
}
