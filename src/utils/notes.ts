import { App, normalizePath } from 'obsidian';

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
 * A vault path for `baseName` that doesn't collide with an existing note,
 * appending a counter (e.g. "... 2") when needed.
 */
export function uniquePath(app: App, baseName: string): string {
	let candidate = normalizePath(`${baseName}.md`);
	for (let n = 2; app.vault.getAbstractFileByPath(candidate); n++) {
		candidate = normalizePath(`${baseName} ${n}.md`);
	}
	return candidate;
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
