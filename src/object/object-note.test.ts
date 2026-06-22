import { describe, expect, it } from 'vitest';
import {
	buildObjectKindContents,
	OBJECT_KIND_TAG,
	recognizeObjectKind,
} from './object-note';

describe('buildObjectKindContents', () => {
	it('tags the note as an object kind and records the instance tag', () => {
		const out = buildObjectKindContents({
			objectTag: 'book',
			properties: ['author', 'status'],
		});
		expect(out).toContain(`  - ${OBJECT_KIND_TAG}`);
		expect(out).toContain('object-tag: book');
		expect(out).toContain('  - author');
		expect(out).toContain('  - status');
	});

	it('writes an empty list when there are no properties', () => {
		const out = buildObjectKindContents({ objectTag: 'book', properties: [] });
		expect(out).toContain('properties: []');
	});

	it('strips a leading # from the instance tag', () => {
		const out = buildObjectKindContents({ objectTag: '#book', properties: [] });
		expect(out).toContain('object-tag: book');
	});
});

describe('recognizeObjectKind', () => {
	it('reads back the contract from a definition note', () => {
		expect(
			recognizeObjectKind({
				tags: [OBJECT_KIND_TAG],
				'object-tag': 'book',
				properties: ['author', 'status'],
			}),
		).toEqual({ objectTag: 'book', properties: ['author', 'status'] });
	});

	it('tolerates a single-string tags value', () => {
		expect(
			recognizeObjectKind({ tags: OBJECT_KIND_TAG, 'object-tag': 'book' }),
		).toEqual({ objectTag: 'book', properties: [] });
	});

	it('returns null for a note that is not an object kind', () => {
		expect(recognizeObjectKind({ tags: ['thought'] })).toBeNull();
		expect(recognizeObjectKind(undefined)).toBeNull();
	});

	it('reports a missing or malformed contract with safe defaults', () => {
		expect(
			recognizeObjectKind({ tags: [OBJECT_KIND_TAG], properties: 'nope' }),
		).toEqual({ objectTag: '', properties: [] });
	});
});
