import { describe, expect, it } from 'vitest';
import { buildBaseFile } from './object-base';

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
