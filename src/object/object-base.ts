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
	// Title first, then a column per declared property in the kind's order.
	const columns = ['file.name', ...def.properties.map(propertyRef)];
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
		...columns.map((column) => `      - ${column}`),
		'',
	];
	return lines.join('\n');
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
