import { App, TFile } from 'obsidian';
import {
	buildObjectKindContents,
	OBJECT_NAMESPACE,
	ObjectKindDef,
} from './object-note';
import { META_FOLDER, normalizeTag } from '../meta';
import {
	createUniqueNote,
	ensureFolder,
	sanitizeFileName,
} from '../utils/notes';
import { writeSetBase } from './object';

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
 * (frontmatter + description) come from the object-note schema. The kind's
 * Bases set view is written silently alongside it, so the set is discoverable
 * in the `sets/` folder from the moment the kind exists.
 */
export async function createObjectKind(
	app: App,
	input: NewObjectKind,
): Promise<TFile> {
	const normalized = normalizeTag(input.name);
	const objectTag = `${OBJECT_NAMESPACE}/${normalized}`;
	const def: ObjectKindDef = { objectTag, properties: input.properties };
	const baseName = sanitizeFileName(input.name) || normalized;
	// Keep kind definitions (meta notes) in their own folder, away from the
	// user's note tree.
	await ensureFolder(app, META_FOLDER);
	const file = await createUniqueNote(
		app,
		`${META_FOLDER}/${baseName}`,
		buildObjectKindContents(def),
	);
	// Maintain the kind's set view as a byproduct of defining it. Key it off the
	// created note's basename (not the raw input) so the set view and the
	// later modify-time resync always agree on the file name, even if a name
	// collision forced a numeric suffix on the note.
	await writeSetBase(app, file.basename, def);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}
