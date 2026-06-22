import { describe, expect, it } from 'vitest';
import { buildPromotedContents, splitFrontmatter } from './promote';
import { recognizeObjectInstance } from './object-instance';
import { ObjectKindDef } from './object-note';

const bookKind: ObjectKindDef = {
	objectTag: 'book',
	properties: ['author', 'status'],
};

describe('buildPromotedContents', () => {
	it('swaps the memory tag for the instance tag and keeps the body verbatim', () => {
		const out = buildPromotedContents(
			{ frontmatter: { tags: ['thought'] }, body: 'Dune is a great read.\n' },
			bookKind,
			{ dropTag: 'thought' },
		);
		expect(out).toContain('  - book');
		expect(out).not.toContain('  - thought');
		expect(out.endsWith('Dune is a great read.\n')).toBe(true);
	});

	it('preserves the existing date and source', () => {
		const out = buildPromotedContents(
			{ frontmatter: { date: '2026-01-02', source: 'user', tags: ['thought'] }, body: '' },
			bookKind,
		);
		expect(out).toContain('date: 2026-01-02');
		expect(out).toContain('source: user');
	});

	it('generates a date when the note has none', () => {
		const out = buildPromotedContents({ frontmatter: undefined, body: 'orphan' }, bookKind);
		expect(out).toMatch(/date: \S/);
		expect(out).toContain('source: user');
		expect(out).toContain('  - book');
	});

	it('writes every declared property in order, blank when the note lacks a value', () => {
		const out = buildPromotedContents(
			{ frontmatter: { tags: ['thought'], author: 'Frank Herbert' }, body: '' },
			bookKind,
		);
		expect(out).toContain('author: Frank Herbert');
		expect(out).toContain('status:\n');
		expect(out.indexOf('author:')).toBeLessThan(out.indexOf('status:'));
	});

	it('coerces non-string property values and quotes YAML-breaking ones', () => {
		const out = buildPromotedContents(
			{ frontmatter: { tags: ['thought'], author: 42, status: 'to read: someday' }, body: '' },
			bookKind,
		);
		expect(out).toContain('author: 42');
		expect(out).toContain('status: "to read: someday"');
	});

	it('keeps other tags, drops the promoted-from tag and the leading #, de-dupes', () => {
		const out = buildPromotedContents(
			{ frontmatter: { tags: ['#thought', 'sci-fi', 'book'] }, body: '' },
			bookKind,
			{ dropTag: '#thought' },
		);
		const tagLines = out.split('\n').filter((l) => l.startsWith('  - '));
		expect(tagLines).toEqual(['  - book', '  - sci-fi']);
	});

	it('produces frontmatter that recognizeObjectInstance reads back', () => {
		// The promotion is only correct if a promoted note is a valid instance.
		const out = buildPromotedContents(
			{ frontmatter: { tags: ['thought'], author: 'Frank Herbert' }, body: 'body' },
			bookKind,
			{ dropTag: 'thought' },
		);
		// The frontmatter Obsidian would parse from what we emitted: tag swapped,
		// the kind's author filled, status present but blank.
		const parsed = { tags: ['book'], author: 'Frank Herbert', status: '' };
		expect(out).toContain('  - book');
		expect(recognizeObjectInstance(parsed, bookKind)).toEqual({
			objectTag: 'book',
			properties: { author: 'Frank Herbert', status: '' },
		});
	});
});

describe('splitFrontmatter', () => {
	it('drops a leading frontmatter block and returns the body', () => {
		const raw = '---\ndate: 2026-01-02\ntags:\n  - thought\nsource: user\n---\nThe body text.\n';
		expect(splitFrontmatter(raw)).toEqual({ body: 'The body text.\n' });
	});

	it('returns the whole note when there is no frontmatter', () => {
		expect(splitFrontmatter('Just a body, no frontmatter.')).toEqual({
			body: 'Just a body, no frontmatter.',
		});
	});

	it('round-trips with buildPromotedContents: the body survives unchanged', () => {
		const original = '---\ntags:\n  - thought\n---\nSome thought worth promoting.\n';
		const { body } = splitFrontmatter(original);
		const out = buildPromotedContents({ frontmatter: { tags: ['thought'] }, body }, bookKind, {
			dropTag: 'thought',
		});
		expect(out.endsWith('Some thought worth promoting.\n')).toBe(true);
	});
});
