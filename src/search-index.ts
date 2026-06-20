import { App, TFile } from 'obsidian';
import MiniSearch from 'minisearch';

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
 * An inverted index over the vault's notes, built once and queried many times.
 *
 * Replaces the previous read-and-scan-every-note search with read-and-index
 * once at startup, then read only the files that actually change. Queries
 * become synchronous index lookups with BM25 scoring, title boosting, and
 * prefix + fuzzy matching from MiniSearch.
 */
export class SearchIndex {
	private mini = new MiniSearch<IndexedNote>({
		fields: ['title', 'body'], // what gets tokenized + scored
		storeFields: ['title', 'body'], // what comes back on a hit
		idField: 'id',
		searchOptions: {
			boost: { title: 2 }, // title hits outrank body hits
			prefix: true, // "rememb" matches "remember"
			fuzzy: 0.2, // typo tolerance, ~free from MiniSearch
		},
	});

	/** Cached so the one full build runs once even if `build` is called again. */
	private buildPromise: Promise<void> | null = null;

	constructor(private app: App) {}

	/**
	 * Build the index from the whole vault. This is the only full read; it runs
	 * once and is memoized, so callers (including incremental updates) can await
	 * it freely to be sure the index is ready.
	 */
	build(): Promise<void> {
		if (!this.buildPromise) {
			this.buildPromise = this.doBuild();
		}
		return this.buildPromise;
	}

	private async doBuild(): Promise<void> {
		const docs = await Promise.all(
			this.app.vault.getMarkdownFiles().map((f) => this.toDoc(f)),
		);
		this.mini.addAll(docs);
	}

	/** Resolves once the initial build has completed, building it if needed. */
	ready(): Promise<void> {
		return this.build();
	}

	/**
	 * Re-index a single file because it was created or changed. Waits for the
	 * initial build first so an early event can't collide with `addAll`.
	 */
	async onModify(file: TFile): Promise<void> {
		await this.build();
		if (this.mini.has(file.path)) {
			this.mini.discard(file.path);
		}
		this.mini.add(await this.toDoc(file));
	}

	/** Drop a file from the index because it was deleted. */
	async onDelete(path: string): Promise<void> {
		await this.build();
		if (this.mini.has(path)) {
			this.mini.discard(path);
		}
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
}
