import { describe, expect, it } from 'vitest';
import { isMetaTag, normalizeTag } from './meta';

describe('isMetaTag', () => {
	it('matches the namespace root and nested tags', () => {
		expect(isMetaTag('larrys-meta')).toBe(true);
		expect(isMetaTag('larrys-meta/object-kind')).toBe(true);
	});

	it('tolerates a leading #', () => {
		expect(isMetaTag('#larrys-meta/object-kind')).toBe(true);
	});

	it('does not match unrelated tags', () => {
		expect(isMetaTag('thought')).toBe(false);
		expect(isMetaTag('larrys-meta-ish')).toBe(false);
	});
});

describe('normalizeTag', () => {
	it('lowercases and hyphenates whitespace', () => {
		expect(normalizeTag('Skill Area')).toBe('skill-area');
	});

	it('strips a leading # and surrounding space', () => {
		expect(normalizeTag('  #Book ')).toBe('book');
	});
});
