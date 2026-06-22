import { describe, expect, it } from 'vitest';
import { stripTitleSuffix } from './notes';

describe('stripTitleSuffix', () => {
	it('drops a trailing " - <suffix>"', () => {
		expect(stripTitleSuffix('Dune - hmm', 'hmm')).toBe('Dune');
	});

	it('trims the suffix before matching', () => {
		expect(stripTitleSuffix('Dune - hmm', '  hmm  ')).toBe('Dune');
	});

	it('leaves the name alone when the suffix is blank', () => {
		expect(stripTitleSuffix('Dune', '')).toBe('Dune');
		expect(stripTitleSuffix('Dune - hmm', '   ')).toBe('Dune - hmm');
	});

	it('leaves the name alone when the suffix is absent', () => {
		expect(stripTitleSuffix('Dune', 'hmm')).toBe('Dune');
		expect(stripTitleSuffix('Dune - note', 'hmm')).toBe('Dune - note');
	});

	it('only strips an exact trailing match (a counter-bumped name is left)', () => {
		expect(stripTitleSuffix('Dune - hmm 2', 'hmm')).toBe('Dune - hmm 2');
	});
});
