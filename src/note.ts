import { App, normalizePath, TFile } from 'obsidian';

/**
 * Create a new note containing the given raw text and open it.
 *
 * This is the foundational "type and dump" path. Formatting concerns
 * (date, tag, source metadata, auto-title) will be layered on later.
 */
export async function createDumpNote(app: App, text: string): Promise<TFile> {
	const fileName = `${makeFileStamp()}.md`;
	const path = normalizePath(fileName);

	const file = await app.vault.create(path, text);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}

/**
 * A filesystem-safe, sortable timestamp for a placeholder filename, e.g.
 * `2026-06-18 1432`. A proper auto-generated title comes later.
 */
function makeFileStamp(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `${date} ${time}`;
}
