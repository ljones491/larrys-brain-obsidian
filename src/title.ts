import nlp from 'compromise/three';

const TITLE_SUFFIX = 'Thoughts';

/** Longest a subject phrase may be before it's trimmed to a word boundary. */
const MAX_SUBJECT_LENGTH = 60;

/** Leading determiners/articles to strip so titles read naturally. */
const LEADING_DETERMINER =
	/^(a|an|the|some|any|this|that|these|those|my|your|his|her|its|our|their)\s+/i;

/**
 * Generate a human-friendly title for a dump note from its content.
 *
 * Uses compromise to pull out noun phrases, picks the most frequent one
 * (ties broken by first appearance), and renders it as "X - Thoughts" so the
 * topic leads the filename. Returns an empty string when no usable noun phrase
 * is found, so callers can fall back to a timestamp.
 */
export function generateTitle(text: string): string {
	const subject = pickSubject(text);
	if (!subject) return '';
	return `${titleCase(subject)} - ${TITLE_SUFFIX}`;
}

/** The most representative noun phrase in the text, cleaned for display. */
function pickSubject(text: string): string {
	const phrases = nlp(text).nouns().out('array') as string[];

	interface Tally {
		display: string;
		count: number;
		order: number;
	}
	const tallies = new Map<string, Tally>();
	let order = 0;

	for (const raw of phrases) {
		const display = cleanPhrase(raw);
		if (!display) continue;
		const key = display.toLowerCase();
		const existing = tallies.get(key);
		if (existing) {
			existing.count += 1;
		} else {
			tallies.set(key, { display, count: 1, order: order++ });
		}
	}

	let best: Tally | undefined;
	for (const tally of tallies.values()) {
		if (
			!best ||
			tally.count > best.count ||
			(tally.count === best.count && tally.order < best.order)
		) {
			best = tally;
		}
	}

	return best?.display ?? '';
}

/** Trailing/leading punctuation to peel off a phrase (apostrophes kept). */
const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu;

/** Strip leading determiners and punctuation, collapse whitespace, cap length. */
function cleanPhrase(phrase: string): string {
	const cleaned = phrase
		.replace(/\s+/g, ' ')
		.trim()
		.replace(LEADING_DETERMINER, '')
		.replace(EDGE_PUNCTUATION, '')
		.trim();
	return truncateAtWord(cleaned, MAX_SUBJECT_LENGTH);
}

/** Trim to at most `max` characters, breaking on a word boundary. */
function truncateAtWord(text: string, max: number): string {
	if (text.length <= max) return text;
	const slice = text.slice(0, max);
	const lastSpace = slice.lastIndexOf(' ');
	return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

/** Capitalize the first letter of each word. */
function titleCase(phrase: string): string {
	return phrase.replace(/(^|\s)(\w)/g, (_, sep, c) => sep + c.toUpperCase());
}
