import { App, normalizePath, TFile } from 'obsidian';

/**
 * Strip characters that aren't safe in a filename and tidy the edges.
 * Returns an empty string if nothing usable remains.
 */
export function sanitizeFileName(name: string): string {
	return name
		// Characters illegal in filenames or meaningful in Obsidian links.
		.replace(/[\\/:*?"<>|#^[\]]/g, '')
		.replace(/\s+/g, ' ')
		.replace(/^[.\s]+|[.\s]+$/g, '');
}

/**
 * Ensure a folder exists at `path`, creating it (and any missing parents) if
 * not. A no-op when the folder is already there. Pass a folder path before
 * creating a note inside it, since `vault.create` won't make parent folders.
 */
export async function ensureFolder(app: App, path: string): Promise<void> {
	const normalized = normalizePath(path);
	if (app.vault.getAbstractFileByPath(normalized)) {
		return;
	}
	await app.vault.createFolder(normalized);
}

/** How many suffixed names to try before giving up on a unique path. */
const MAX_CREATE_ATTEMPTS = 1000;

/**
 * Create a note at `baseName`, appending a counter (e.g. "... 2") on collision.
 *
 * Collisions are matched case-insensitively: on a case-insensitive filesystem
 * `Dog - search.md` and `dog - search.md` are the same file, but Obsidian's
 * path lookup is case-sensitive and would miss it. We compare against the
 * lowercased set of existing paths, and still let a failed `vault.create` (a
 * lost race) bump to the next suffix.
 */
export async function createUniqueNote(
	app: App,
	baseName: string,
	contents: string,
): Promise<TFile> {
	const taken = new Set(app.vault.getFiles().map((f) => f.path.toLowerCase()));

	for (let n = 1; n <= MAX_CREATE_ATTEMPTS; n++) {
		const candidate = normalizePath(
			n === 1 ? `${baseName}.md` : `${baseName} ${n}.md`,
		);
		if (taken.has(candidate.toLowerCase())) {
			continue;
		}
		try {
			return await app.vault.create(candidate, contents);
		} catch {
			// Lost a race (or a case-only collision the index missed): mark this
			// name taken and try the next suffix.
			taken.add(candidate.toLowerCase());
		}
	}

	throw new Error(`Could not find a free name for "${baseName}".`);
}

/** The date a note was written, e.g. `2026-06-18`. */
export function makeDateStamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A filesystem-safe, sortable timestamp used as a fallback filename when no
 * title can be generated, e.g. `2026-06-18 1432`.
 */
export function makeFileStamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `${makeDateStamp()} ${time}`;
}
