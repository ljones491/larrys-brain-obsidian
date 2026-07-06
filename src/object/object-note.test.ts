import { describe, expect, it } from 'vitest';
import {
	buildObjectKindContents,
	buildObjectTag,
	OBJECT_KIND_TAG,
	parseObjectTag,
	recognizeObjectKind,
	replaceTagInList,
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

describe('buildObjectTag', () => {
	it('nests a kind under a domain', () => {
		expect(buildObjectTag('media', 'book')).toBe('object/media/book');
	});

	it('leaves an ungrouped kind flat when the domain is blank', () => {
		expect(buildObjectTag('', 'book')).toBe('object/book');
	});

	it('strips a leading # and trims both parts', () => {
		expect(buildObjectTag(' #media ', ' book ')).toBe('object/media/book');
	});
});

describe('parseObjectTag', () => {
	it('splits a domained tag into domain and kind', () => {
		expect(parseObjectTag('object/media/book')).toEqual({ domain: 'media', kind: 'book' });
	});

	it('reports a blank domain for a flat tag', () => {
		expect(parseObjectTag('object/book')).toEqual({ domain: '', kind: 'book' });
	});

	it('round-trips with buildObjectTag', () => {
		const tag = buildObjectTag('media', 'song');
		expect(parseObjectTag(tag)).toEqual({ domain: 'media', kind: 'song' });
	});

	it('keeps a multi-level domain intact', () => {
		expect(parseObjectTag('object/a/b/song')).toEqual({ domain: 'a/b', kind: 'song' });
	});
});

describe('replaceTagInList', () => {
	it('swaps the old tag for the new one, leaving others alone', () => {
		expect(replaceTagInList(['object/book', 'favorite'], 'object/book', 'object/media/book')).toEqual([
			'object/media/book',
			'favorite',
		]);
	});

	it('accepts a single-string tags value', () => {
		expect(replaceTagInList('object/book', 'object/book', 'object/media/book')).toEqual([
			'object/media/book',
		]);
	});

	it('normalizes # and de-dupes', () => {
		expect(
			replaceTagInList(['#object/book', 'object/media/book'], 'object/book', 'object/media/book'),
		).toEqual(['object/media/book']);
	});

	it('returns an empty list when there are no tags', () => {
		expect(replaceTagInList(undefined, 'object/book', 'object/media/book')).toEqual([]);
	});
});
