import { App, TFile } from 'obsidian';
import { buildObjectKindContents, ObjectKindDef } from './object-note';
import { normalizeTag } from '../meta';
import { createUniqueNote, sanitizeFileName } from '../utils/notes';

export type { ObjectKindDef };

/** A new OBJECT kind as gathered from the user: a display name and raw properties. */
export interface NewObjectKind {
	/** Free-text name, e.g. "book" or "skill area". Becomes the note title. */
	name: string;
	/** Property names the user listed, already split and trimmed. */
	properties: string[];
}

/**
 * Create an OBJECT-kind definition note from a user's input and open it.
 *
 * The note is titled by the kind's name; its instance tag is that name
 * normalized to a valid tag (e.g. "skill area" → `skill-area`). The contents
 * (frontmatter + description) come from the object-note schema.
 */
export async function createObjectKind(
	app: App,
	input: NewObjectKind,
): Promise<TFile> {
	const objectTag = normalizeTag(input.name);
	const def: ObjectKindDef = { objectTag, properties: input.properties };
	const baseName = sanitizeFileName(input.name) || objectTag;
	const file = await createUniqueNote(
		app,
		baseName,
		buildObjectKindContents(def),
	);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}
