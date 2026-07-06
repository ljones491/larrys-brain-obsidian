import { describe, expect, it } from 'vitest';
import { buildBaseFile, listBaseViews, syncBaseColumns, syncBaseTag } from './object-base';

describe('syncBaseTag', () => {
	it('rewrites the filter tag when a kind moves into a domain', () => {
		const contents = buildBaseFile('book', { objectTag: 'object/book', properties: ['author'] });
		const synced = syncBaseTag(contents, { objectTag: 'object/media/book', properties: ['author'] });
		expect(synced).toContain(`file.hasTag("object/media/book")`);
		expect(synced).not.toContain(`file.hasTag("object/book")`);
	});

	it('leaves the outer single quotes and the rest of the file intact', () => {
		const contents = buildBaseFile('book', { objectTag: 'object/book', properties: [] });
		const synced = syncBaseTag(contents, { objectTag: 'object/media/book', properties: [] });
		expect(synced).toContain(`- 'file.hasTag("object/media/book")'`);
		expect(synced).toContain('type: table');
	});

	it('is a no-op when the tag is unchanged', () => {
		const contents = buildBaseFile('book', { objectTag: 'object/book', properties: [] });
		expect(syncBaseTag(contents, { objectTag: 'object/book', properties: [] })).toBe(contents);
	});
});

describe('buildBaseFile', () => {
	it('filters on the kind tag and lists the title plus a column per property', () => {
		const out = buildBaseFile('book', {
			objectTag: 'object/book',
			properties: ['author', 'status'],
		});
		expect(out).toContain(`- 'file.hasTag("object/book")'`);
		expect(out).toContain('type: table');
		expect(out).toContain('name: "book"');
		expect(out).toContain('- file.name');
		expect(out).toContain('- note.author');
		expect(out).toContain('- note.status');
	});

	it('always shows the title even when the kind has no properties', () => {
		const out = buildBaseFile('thing', { objectTag: 'object/thing', properties: [] });
		expect(out).toContain('- file.name');
		expect(out).not.toContain('- note.');
	});

	it('uses bracket form for a property name with a space', () => {
		const out = buildBaseFile('book', {
			objectTag: 'object/book',
			properties: ['page count'],
		});
		expect(out).toContain('- note["page count"]');
	});

	it('quotes a view name with YAML-special characters', () => {
		const out = buildBaseFile('a: b', { objectTag: 'object/a-b', properties: [] });
		expect(out).toContain('name: "a: b"');
	});
});

describe('syncBaseColumns', () => {
	// A base whose columns are out of date but which carries user tweaks
	// (a custom view name and a sort block) the sync must preserve.
	const base = [
		'filters:',
		'  and:',
		`    - 'file.hasTag("object/book")'`,
		'views:',
		'  - type: table',
		'    name: "My books"',
		'    sort:',
		'      - property: note.author',
		'        direction: ASC',
		'    order:',
		'      - file.name',
		'      - note.title',
		'',
	].join('\n');

	it('rewrites the column list to match the kind, in order', () => {
		const out = syncBaseColumns(base, {
			objectTag: 'object/book',
			properties: ['author', 'status'],
		});
		expect(out).toContain('    order:\n      - file.name\n      - note.author\n      - note.status');
		// The stale column is gone.
		expect(out).not.toContain('- note.title');
	});

	it('leaves filters, the view name, and sorting untouched', () => {
		const out = syncBaseColumns(base, {
			objectTag: 'object/book',
			properties: ['author'],
		});
		expect(out).toContain(`- 'file.hasTag("object/book")'`);
		expect(out).toContain('name: "My books"');
		expect(out).toContain('    sort:\n      - property: note.author\n        direction: ASC');
	});

	it('fills an empty order list', () => {
		const empty = ['views:', '  - type: table', '    order: []', ''].join('\n');
		const out = syncBaseColumns(empty, {
			objectTag: 'object/book',
			properties: ['author'],
		});
		expect(out).toContain('    order:\n      - file.name\n      - note.author');
	});

	it('uses bracket form for a property name with a space', () => {
		const out = syncBaseColumns(base, {
			objectTag: 'object/book',
			properties: ['page count'],
		});
		expect(out).toContain('- note["page count"]');
	});

	it('returns the contents unchanged when there is no order block', () => {
		const noOrder = ['views:', '  - type: table', '    name: "x"', ''].join('\n');
		expect(syncBaseColumns(noOrder, { objectTag: 'object/book', properties: ['a'] })).toBe(
			noOrder,
		);
	});
});

describe('listBaseViews', () => {
	it('lists each view name in file order, unwrapping quotes', () => {
		const base = [
			'views:',
			'  - type: table',
			'    name: "My books"',
			'    order:',
			'      - file.name',
			'  - type: cards',
			'    name: Cards',
			'',
		].join('\n');
		expect(listBaseViews(base)).toEqual(['My books', 'Cards']);
	});

	it('reads a name inline with the dash', () => {
		const base = ['views:', '  - name: Gallery', '    type: cards', ''].join('\n');
		expect(listBaseViews(base)).toEqual(['Gallery']);
	});

	it('ignores order items and other nested dashes', () => {
		const base = [
			'views:',
			'  - type: table',
			'    name: Table',
			'    sort:',
			'      - property: note.author',
			'        direction: ASC',
			'    order:',
			'      - file.name',
			'',
		].join('\n');
		expect(listBaseViews(base)).toEqual(['Table']);
	});

	it('returns an empty list when there is no views block', () => {
		expect(listBaseViews('filters:\n  and: []\n')).toEqual([]);
	});

	it('unwraps single-quoted names', () => {
		const base = ["views:", "  - type: table", "    name: 'a: b'", ''].join('\n');
		expect(listBaseViews(base)).toEqual(['a: b']);
	});
});
