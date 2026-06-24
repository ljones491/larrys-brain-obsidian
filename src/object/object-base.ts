import { ObjectKindDef } from './object-note';

/**
 * Build an Obsidian Bases `.base` file (YAML) that surfaces a kind's whole set
 * as a persistent, native table view — the "see my sets" idea in .dev/GOAL.md.
 *
 * Rather than the plugin rendering a table itself, it writes a `.base` file and
 * lets Obsidian render and maintain it (so the view sticks around and the user
 * can tweak it). The view filters to the kind's instance tag and shows one
 * column per declared property, in contract order, with the note title first.
 *
 * Kept pure (no `App`), mirroring the note schemas: a caller fetches the kind's
 * contract and hands the plain values here to produce the file contents.
 *
 * See: https://obsidian.md/help/bases/syntax
 */
export function buildBaseFile(name: string, def: ObjectKindDef): string {
	const lines = [
		'filters:',
		'  and:',
		// Single-quote the expression so YAML keeps the inner double quotes
		// verbatim. The tag is a normalized identifier, so it never contains one.
		`    - 'file.hasTag("${def.objectTag}")'`,
		'views:',
		'  - type: table',
		// Always double-quote the display name so any character is safe in YAML.
		`    name: ${JSON.stringify(name)}`,
		'    order:',
		...orderColumns(def).map((column) => `      - ${column}`),
		'',
	];
	return lines.join('\n');
}

/**
 * Bring an existing `.base` file's column list back in line with `def`,
 * rewriting only the first view's `order:` block and leaving everything else
 * (filters, sorting, the view name, any extra views) untouched. The kind note
 * owns its columns; the user owns the rest.
 *
 * Works on the file text rather than parsing/re-emitting YAML so a user's
 * formatting and any keys this module doesn't generate survive verbatim. The
 * `order:` block is the one this plugin generates (a key followed by `- column`
 * items, or `order: []`); if the file has no such block the contents are
 * returned unchanged.
 */
export function syncBaseColumns(contents: string, def: ObjectKindDef): string {
	const lines = contents.split('\n');
	const start = lines.findIndex((line) => /^\s*order:\s*(\[\s*\])?\s*$/.test(line));
	if (start === -1) {
		return contents;
	}
	const keyIndent = /^(\s*)order:/.exec(lines[start] ?? '')?.[1] ?? '';
	// The list items belonging to this `order:` are the run of more-indented
	// list-item lines that follow it (the `[]` form has none).
	let end = start + 1;
	for (let line = lines[end]; line !== undefined; line = lines[end]) {
		if (!/^\s+-\s/.test(line) || leadingSpaces(line) <= keyIndent.length) {
			break;
		}
		end++;
	}
	const itemIndent = `${keyIndent}  `;
	const rebuilt = [
		`${keyIndent}order:`,
		...orderColumns(def).map((column) => `${itemIndent}- ${column}`),
	];
	return [...lines.slice(0, start), ...rebuilt, ...lines.slice(end)].join('\n');
}

/**
 * List the view names declared in a `.base` file, in file order. Used to offer
 * the user a preferred view to open a kind's set to (a base opened directly
 * always shows its first view, so a user with a cards view as well needs a way
 * to pick it).
 *
 * Reads the text rather than parsing YAML, like {@link syncBaseColumns}, so it
 * tolerates whatever Obsidian writes when the user adds a view. It walks the
 * `views:` block (the lines indented under it) and takes the first `name:` of
 * each view list item, whether inline with the dash (`- name: Cards`) or on its
 * own line. Quoted names are unwrapped. Returns `[]` when there's no `views:`.
 */
export function listBaseViews(contents: string): string[] {
	const lines = contents.split('\n');
	const viewsIdx = lines.findIndex((line) => /^\s*views:\s*$/.test(line));
	if (viewsIdx === -1) {
		return [];
	}
	const viewsIndent = leadingSpaces(lines[viewsIdx] ?? '');

	const names: string[] = [];
	let dashIndent: number | null = null;
	let item: string[] | null = null;
	const flush = () => {
		if (item) {
			const name = findViewName(item);
			if (name !== null) {
				names.push(name);
			}
		}
		item = null;
	};

	for (let i = viewsIdx + 1; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (line.trim() === '') {
			item?.push(line);
			continue;
		}
		const indent = leadingSpaces(line);
		// A line at or left of `views:` ends the block.
		if (indent <= viewsIndent) {
			break;
		}
		const isDash = /^\s*-\s/.test(line) || /^\s*-\s*$/.test(line);
		// A dash at the view-item indent starts a new view; deeper dashes (e.g.
		// `order:` items) belong to the current view.
		if (isDash && (dashIndent === null || indent === dashIndent)) {
			flush();
			dashIndent = indent;
			item = [line];
		} else if (item) {
			item.push(line);
		}
	}
	flush();
	return names;
}

/** First `name:` value within a view's lines, dash-inline or own-line. */
function findViewName(itemLines: string[]): string | null {
	for (const raw of itemLines) {
		const stripped = raw.replace(/^\s*-\s*/, '').trim();
		const match = /^name:\s*(.+)$/.exec(stripped);
		if (match?.[1]) {
			return unquoteScalar(match[1].trim());
		}
	}
	return null;
}

/** Unwrap a YAML scalar's quotes (double or single); pass plain values through. */
function unquoteScalar(value: string): string {
	if (value.startsWith('"')) {
		try {
			return JSON.parse(value) as string;
		} catch {
			return value;
		}
	}
	if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1).replace(/''/g, "'");
	}
	return value;
}

/** Number of leading space characters on a line, for indentation comparisons. */
function leadingSpaces(line: string): number {
	return /^ */.exec(line)?.[0].length ?? 0;
}

/**
 * The column list for a kind's table view: the note title first, then a column
 * per declared property in the kind's order. Shared by the file builder and the
 * column sync so the two never drift.
 */
function orderColumns(def: ObjectKindDef): string[] {
	return ['file.name', ...def.properties.map(propertyRef)];
}

/**
 * Reference a note property in a Bases column list. A bare dotted accessor
 * (`note.author`) works for a simple identifier; a name with a space or other
 * non-identifier character needs the bracket-and-quote form (`note["page
 * count"]`), since a property name is free text the user chose for the kind.
 */
function propertyRef(property: string): string {
	return /^[A-Za-z_][A-Za-z0-9_]*$/.test(property)
		? `note.${property}`
		: `note[${JSON.stringify(property)}]`;
}
