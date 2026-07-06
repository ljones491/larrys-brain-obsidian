import { describe, expect, it } from 'vitest';
import { AREAS_FOLDER, POINTS_FOLDER, normalizeAreaName } from './constants';

describe('normalizeAreaName', () => {
	it('folds casing so "Dishes" and "dishes" match', () => {
		expect(normalizeAreaName('Dishes')).toBe(normalizeAreaName('dishes'));
		expect(normalizeAreaName('DISHES')).toBe('dishes');
	});

	it('trims and collapses internal whitespace', () => {
		expect(normalizeAreaName('  the   dishes ')).toBe('the dishes');
	});

	it('leaves an already-normal name untouched', () => {
		expect(normalizeAreaName('side projects')).toBe('side projects');
	});
});

describe('folder layout', () => {
	it('files point events under the meta folder so search excludes them', () => {
		expect(POINTS_FOLDER.startsWith('larrys-meta/')).toBe(true);
	});

	it('files area hubs outside the meta folder so they stay searchable', () => {
		expect(AREAS_FOLDER.startsWith('larrys-meta')).toBe(false);
	});
});
