import { App, normalizePath, TFile } from 'obsidian';
import {
	buildObjectInstanceContents,
	ObjectInstance,
	recognizeObjectInstance,
} from './object-instance';
import { ObjectKindDef, recognizeObjectKind } from './object-note';
import { buildBaseFile } from './object-base';
import {
	createUniqueNote,
	ensureFolder,
	makeFileStamp,
	sanitizeFileName,
} from '../utils/notes';

export type { ObjectKindDef };

/** Vault folder that holds the generated Bases `.base` set views. */
export const SETS_FOLDER = 'sets';

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
 * One member of a kind's set: an instance note read back from the vault. The
 * dual of {@link ObjectKindOption} — where that names a kind, this names a
 * single object obeying it, with its property values and the note itself.
 */
export interface ObjectInstanceResult {
	/** The object's name, taken from its note's title, e.g. "Dune". */
	name: string;
	/** The instance's tag and property values, read back via the kind's contract. */
	instance: ObjectInstance;
	/** The instance note itself. */
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
 * List every OBJECT instance belonging to `kind` — the kind's *set*. Scans the
 * vault's markdown frontmatter (warm in `metadataCache` after layout-ready) and
 * keeps the notes carrying the kind's instance tag, reading each back through
 * {@link recognizeObjectInstance} so callers get the property values, not just
 * the file. Sorted by name for a stable list.
 *
 * The mirror of {@link listObjectKinds}, and the primitive every set-level
 * feature builds on (shuffle, surfacing a set, calculations over it). The
 * definition note isn't a member: it carries the meta tag, not the instance tag.
 */
export function listObjects(app: App, kind: ObjectKindOption): ObjectInstanceResult[] {
	const objects: ObjectInstanceResult[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const instance = recognizeObjectInstance(frontmatter, kind.def);
		if (!instance) {
			continue;
		}
		objects.push({ name: file.basename, instance, file });
	}
	objects.sort((a, b) => a.name.localeCompare(b.name));
	return objects;
}

/**
 * Pick one item from `items` at random, or `null` when there are none. `rng`
 * defaults to `Math.random` and is injectable so the choice is testable.
 */
export function pickRandom<T>(items: readonly T[], rng: () => number = Math.random): T | null {
	if (items.length === 0) {
		return null;
	}
	return items[Math.floor(rng() * items.length)] ?? null;
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

/**
 * Surface a kind's whole set as a persistent Bases table and open it — the
 * "see my sets" capability in .dev/GOAL.md. Ensures a `<name>.base` file exists
 * in {@link SETS_FOLDER}, filtered to the kind's instance tag with a column per
 * property, then opens it.
 *
 * Create-if-missing on purpose: once the view exists the user may have tweaked
 * its columns or sorting, and a Bases view is meant to stick around, so a
 * re-run just reopens it rather than clobbering those edits. Unlike the other
 * set features this needs no runtime enumeration — Bases queries the set live.
 */
export async function showSet(app: App, kind: ObjectKindOption): Promise<TFile> {
	await ensureFolder(app, SETS_FOLDER);
	const baseName = sanitizeFileName(kind.name) || (kind.def.objectTag.split('/').pop() ?? 'set');
	const path = normalizePath(`${SETS_FOLDER}/${baseName}.base`);
	const existing = app.vault.getAbstractFileByPath(path);
	const file =
		existing instanceof TFile
			? existing
			: await app.vault.create(path, buildBaseFile(kind.name, kind.def));
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}
