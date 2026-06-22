import { describe, expect, it } from 'vitest';
import {
	buildObjectInstanceContents,
	recognizeObjectInstance,
} from './object-instance';
import { ObjectKindDef } from './object-note';

const bookKind: ObjectKindDef = {
	objectTag: 'book',
	properties: ['author', 'status'],
};

describe('buildObjectInstanceContents', () => {
	it('tags the note with the kind and records filled properties', () => {
		const out = buildObjectInstanceContents(
			{ objectTag: 'book', properties: { author: 'Frank Herbert', status: 'read' } },
			bookKind.properties,
		);
		expect(out).toContain('  - book');
		expect(out).toContain('author: Frank Herbert');
		expect(out).toContain('status: read');
		expect(out).toContain('source: user');
	});

	it('writes every declared property even when blank, in order', () => {
		const out = buildObjectInstanceContents(
			{ objectTag: 'book', properties: { status: 'reading' } },
			bookKind.properties,
		);
		expect(out).toContain('author:\n');
		expect(out.indexOf('author:')).toBeLessThan(out.indexOf('status:'));
	});

	it('strips a leading # from the instance tag', () => {
		const out = buildObjectInstanceContents(
			{ objectTag: '#book', properties: {} },
			[],
		);
		expect(out).toContain('  - book');
	});

	it('quotes values that would break YAML', () => {
		const out = buildObjectInstanceContents(
			{ objectTag: 'book', properties: { status: 'to read: someday' } },
			['status'],
		);
		expect(out).toContain('status: "to read: someday"');
	});
});

describe('recognizeObjectInstance', () => {
	it('reads back the property values for a note carrying the tag', () => {
		expect(
			recognizeObjectInstance(
				{ tags: ['book'], author: 'Frank Herbert', status: 'read' },
				bookKind,
			),
		).toEqual({
			objectTag: 'book',
			properties: { author: 'Frank Herbert', status: 'read' },
		});
	});

	it('tolerates a single-string tags value and coerces non-strings', () => {
		expect(
			recognizeObjectInstance({ tags: 'book', author: 42 }, bookKind),
		).toEqual({ objectTag: 'book', properties: { author: '42', status: '' } });
	});

	it('returns null when the note does not carry the kind tag', () => {
		expect(recognizeObjectInstance({ tags: ['thought'] }, bookKind)).toBeNull();
		expect(recognizeObjectInstance(undefined, bookKind)).toBeNull();
	});

	it('reports missing properties as blank', () => {
		expect(recognizeObjectInstance({ tags: ['book'] }, bookKind)).toEqual({
			objectTag: 'book',
			properties: { author: '', status: '' },
		});
	});
});
