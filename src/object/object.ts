import { App, TFile } from 'obsidian';
import {
	buildObjectInstanceContents,
	ObjectInstance,
} from './object-instance';
import { ObjectKindDef, recognizeObjectKind } from './object-note';
import { createUniqueNote, makeFileStamp, sanitizeFileName } from '../utils/notes';

export type { ObjectKindDef };

/**
 * An OBJECT kind available to instantiate: the contract plus the display name
 * (the definition note's basename) and a reference to that note.
 */
export interface ObjectKindOption {
	/** The kind's name, taken from its definition note's title, e.g. "book". */
	name: string;
	/** The kind's contract: instance tag and allowed properties. */
	def: ObjectKindDef;
	/** The definition note itself. */
	file: TFile;
}

/**
 * A new OBJECT as gathered from the user: a name (becomes the note title), the
 * kind's instance tag, and a value for each property the user filled in.
 */
export interface NewObject {
	/** Free-text name; becomes the note title, e.g. "Dune". */
	name: string;
	/** The chosen kind's instance tag, e.g. `book`. */
	objectTag: string;
	/** Declared property names (in the kind's order) the instance should write. */
	propertyNames: string[];
	/** Property values keyed by name; missing or blank entries write empty. */
	values: Record<string, string>;
}

/**
 * List every OBJECT kind defined in the vault, so the user can pick one to
 * instantiate. Reads each note's frontmatter from `metadataCache` (already warm
 * after layout-ready) and keeps the ones {@link recognizeObjectKind} accepts,
 * skipping kinds with no instance tag (an incomplete definition can't be
 * instantiated). Sorted by name for a stable picker.
 */
export function listObjectKinds(app: App): ObjectKindOption[] {
	const kinds: ObjectKindOption[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const def = recognizeObjectKind(frontmatter);
		if (!def || def.objectTag.length === 0) {
			continue;
		}
		kinds.push({ name: file.basename, def, file });
	}
	kinds.sort((a, b) => a.name.localeCompare(b.name));
	return kinds;
}

/**
 * Create an OBJECT instance note from the user's input and open it.
 *
 * The note is titled by the object's name and tagged with the chosen kind's
 * instance tag; its frontmatter carries one field per declared property. When
 * no usable name is given, a timestamp filename is used as a fallback.
 */
export async function createObject(app: App, input: NewObject): Promise<TFile> {
	const instance: ObjectInstance = {
		objectTag: input.objectTag,
		properties: input.values,
	};
	const contents = buildObjectInstanceContents(instance, input.propertyNames);
	const baseName = sanitizeFileName(input.name) || makeFileStamp();
	const file = await createUniqueNote(app, baseName, contents);
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}
