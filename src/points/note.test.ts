import { describe, expect, it } from 'vitest';
import {
	buildAreaNoteContents,
	buildPointNoteContents,
	isAreaFrontmatter,
	isPointFrontmatter,
} from './note';
import { parseEdgeTargets } from '../edge';
import { AREA_TAG, ON_EDGE, POINT_TAG } from './constants';

describe('buildAreaNoteContents', () => {
	it('tags the note as an area and titles it with the name', () => {
		const contents = buildAreaNoteContents('Dishes');
		expect(contents).toContain(`- ${AREA_TAG}`);
		expect(contents).toContain('# Dishes');
	});

	it('carries no edges — an area links in, not out', () => {
		expect(parseEdgeTargets(buildAreaNoteContents('Dishes'), ON_EDGE)).toEqual(
			[],
		);
	});
});

describe('buildPointNoteContents', () => {
	it('tags the note as a point and lands it on its area via ON', () => {
		const contents = buildPointNoteContents('Dishes');
		expect(contents).toContain(`- ${POINT_TAG}`);
		expect(parseEdgeTargets(contents, ON_EDGE)).toEqual(['Dishes']);
	});
});

describe('recognizers', () => {
	it('tells areas and points apart by their tag', () => {
		const area = { tags: [AREA_TAG] };
		const point = { tags: [POINT_TAG] };
		expect(isAreaFrontmatter(area)).toBe(true);
		expect(isPointFrontmatter(area)).toBe(false);
		expect(isPointFrontmatter(point)).toBe(true);
		expect(isAreaFrontmatter(point)).toBe(false);
	});

	it('tolerates a single-string tags value', () => {
		expect(isAreaFrontmatter({ tags: AREA_TAG })).toBe(true);
	});

	it('is false for a note with no frontmatter or no matching tag', () => {
		expect(isAreaFrontmatter(undefined)).toBe(false);
		expect(isPointFrontmatter({ tags: ['thought'] })).toBe(false);
	});
});
