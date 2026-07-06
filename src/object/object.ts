import { App, normalizePath, TFile } from 'obsidian';
import {
	buildObjectInstanceContents,
	ObjectInstance,
	recognizeObjectInstance,
} from './object-instance';
import {
	buildObjectTag,
	ObjectKindDef,
	parseObjectTag,
	recognizeObjectKind,
	replaceTagInList,
} from './object-note';
import { buildBaseFile, syncBaseColumns, syncBaseTag } from './object-base';
import { normalizeTag } from '../meta';
import { buildPromotedContents, PromotionOptions, splitFrontmatter } from './promote';
import {
	createUniqueNote,
	ensureFolder,
	makeFileStamp,
	sanitizeFileName,
	stripTitleSuffix,
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

/** Options for {@link promoteToObject}: the transform's options plus the rename. */
export interface PromoteToObjectOptions extends PromotionOptions {
	/**
	 * The Larry Write title suffix (e.g. `hmm`) to strip from the note's filename
	 * while promoting, so a promoted `Topic - hmm` becomes just `Topic`. Left as-is
	 * when blank or not present on the name.
	 */
	titleSuffix?: string;
}

/**
 * Promote an existing note into an OBJECT instance of `kind`, in place. Reads the
 * note, splits off its body, and rewrites it via {@link buildPromotedContents} —
 * keeping the body verbatim, swapping its memory tag (`options.dropTag`, e.g. the
 * configured `thought`) for the kind's instance tag, and seeding the kind's
 * properties from any matching existing frontmatter values. Then strips the Larry
 * Write title suffix from the filename (`options.titleSuffix`), since a promoted
 * note is no longer a loose thought.
 *
 * The thin `App`-dependent counterpart to the pure transform: the reshaping logic
 * stays testable without a vault. The note is already the one on screen, so it
 * stays open; only its contents and name change.
 */
export async function promoteToObject(
	app: App,
	file: TFile,
	kind: ObjectKindOption,
	options: PromoteToObjectOptions = {},
): Promise<void> {
	const raw = await app.vault.read(file);
	const { body } = splitFrontmatter(raw);
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	const contents = buildPromotedContents({ frontmatter, body }, kind.def, options);
	await app.vault.modify(file, contents);
	await renameStrippingSuffix(app, file, options.titleSuffix);
}

/**
 * Rename `file` to drop its Larry Write title suffix, leaving links intact
 * (`fileManager.renameFile` rewrites backlinks). A no-op when there's no suffix
 * to strip; on a name collision it bumps with a counter, like note creation.
 */
async function renameStrippingSuffix(
	app: App,
	file: TFile,
	suffix: string | undefined,
): Promise<void> {
	if (!suffix) {
		return;
	}
	const stripped = stripTitleSuffix(file.basename, suffix);
	if (stripped === file.basename || stripped.length === 0) {
		return;
	}
	const dir = file.parent && file.parent.path !== '/' ? `${file.parent.path}/` : '';
	const taken = new Set(app.vault.getFiles().map((f) => f.path.toLowerCase()));
	for (let n = 1; n <= 1000; n++) {
		const candidate = normalizePath(`${dir}${n === 1 ? stripped : `${stripped} ${n}`}.md`);
		if (!taken.has(candidate.toLowerCase())) {
			await app.fileManager.renameFile(file, candidate);
			return;
		}
	}
}

/**
 * Maintain a kind's Bases table at `<name>.base` in {@link SETS_FOLDER}: a view
 * filtered to the kind's instance tag with a column per property. Called both
 * when a kind is defined and whenever its definition note changes, so the set
 * view is a guaranteed byproduct of having a kind and tracks the kind's schema.
 *
 * If the file is missing it's created from scratch. If it already exists, only
 * the column list is brought back in line with the kind's properties (via
 * {@link syncBaseColumns}); the user's filters, sorting, and any other tweaks
 * are left untouched — the kind owns its columns, the user owns the rest. Needs
 * no runtime enumeration — Bases queries the set live.
 */
export async function writeSetBase(
	app: App,
	name: string,
	def: ObjectKindDef,
): Promise<void> {
	await ensureFolder(app, SETS_FOLDER);
	const path = setBasePath(name, def);
	const existing = app.vault.getAbstractFileByPath(path);
	if (!(existing instanceof TFile)) {
		await app.vault.create(path, buildBaseFile(name, def));
		return;
	}
	const contents = await app.vault.read(existing);
	// Keep both the filter tag and the column list aligned with the kind's
	// contract; the user's other filters, sorting, and views are left alone.
	const synced = syncBaseColumns(syncBaseTag(contents, def), def);
	// Skip a no-op write so unrelated edits to a kind note don't churn the base.
	if (synced !== contents) {
		await app.vault.modify(existing, synced);
	}
}

/**
 * Move a kind into a domain (or out of one, or to a different one), migrating the
 * whole set. A domain adds a middle tag level — moving `book` to `media` retags
 * `object/book` → `object/media/book` — so kinds can be grouped for a single
 * graph color group or Bases filter per domain. A blank `domain` flattens the
 * kind back to `object/<kind>`.
 *
 * Rewrites, in order: every existing instance's tag (via `processFrontMatter`, so
 * only the `tags` field is touched and the rest of each note is untouched), then
 * the kind definition note's `object-tag`, then the kind's `.base` filter through
 * {@link writeSetBase}. Instances are collected against the *old* tag first, since
 * that's how they're still recognized before the swap. Returns the number of
 * instances retagged. A no-op (returns 0) when the domain doesn't actually change.
 *
 * Only frontmatter tags are rewritten — the shape the plugin writes. Any inline
 * `#object/<kind>` a user typed into a note body is left as-is.
 */
export async function moveKindToDomain(
	app: App,
	kind: ObjectKindOption,
	domain: string,
): Promise<number> {
	const oldTag = kind.def.objectTag;
	const { kind: kindName } = parseObjectTag(oldTag);
	const newTag = buildObjectTag(normalizeTag(domain), kindName);
	if (newTag === oldTag) {
		return 0;
	}
	const newDef: ObjectKindDef = { objectTag: newTag, properties: kind.def.properties };

	// Retag the members first, while the old tag still identifies them.
	const instances = listObjects(app, kind);
	for (const { file } of instances) {
		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter.tags = replaceTagInList(frontmatter.tags, oldTag, newTag);
		});
	}

	// Point the kind definition at the new tag, then realign its set view. The
	// base is keyed by the kind's name (unchanged), so only its filter moves.
	await app.fileManager.processFrontMatter(kind.file, (frontmatter: Record<string, unknown>) => {
		frontmatter['object-tag'] = newTag;
	});
	await writeSetBase(app, kind.name, newDef);

	return instances.length;
}

/**
 * The vault path of a kind's `.base` set view, e.g. `sets/book.base`. The single
 * place the set view's filename is derived, so the writer and any opener agree.
 */
export function setBasePath(name: string, def: ObjectKindDef): string {
	const baseName = sanitizeFileName(name) || (def.objectTag.split('/').pop() ?? 'set');
	return normalizePath(`${SETS_FOLDER}/${baseName}.base`);
}

/**
 * Open a kind's set view (`<name>.base`) in the main view. Ensures the file
 * exists first via {@link writeSetBase} — both to create it for kinds defined
 * before set views existed (which have none) and to keep its columns current —
 * then opens it in the active leaf. The action the Cortex panel fires for each
 * kind, factored out so the open path stays UI-free and testable.
 *
 * When `view` is given, opens to that named Bases view via the `#View` subpath
 * (a base opened plainly always shows its first view); omit it for the default
 * first view.
 */
export async function openSetBase(
	app: App,
	name: string,
	def: ObjectKindDef,
	view?: string,
): Promise<void> {
	await writeSetBase(app, name, def);
	const path = setBasePath(name, def);
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) {
		return;
	}
	if (view) {
		// `[[file.base#View]]` selects a view; openLinkText applies that subpath.
		await app.workspace.openLinkText(`${path}#${view}`, '', false);
	} else {
		await app.workspace.getLeaf(false).openFile(file);
	}
}
