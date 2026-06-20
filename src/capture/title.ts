import nlp from 'compromise/three';

/** Longest a subject phrase may be before it's trimmed to a word boundary. */
const MAX_SUBJECT_LENGTH = 60;

/** Leading determiners/articles to strip so titles read naturally. */
const LEADING_DETERMINER =
	/^(a|an|the|some|any|this|that|these|those|my|your|his|her|its|our|their)\s+/i;

/** A noun phrase plus its tagged terms, as emitted by compromise's `.json()`. */
interface NounPhrase {
	text?: string;
	terms?: { tags?: string[] }[];
}

/** compromise tags that mark a phrase as a named entity (the strongest tier). */
const ENTITY_TAGS = new Set(['Person', 'Place', 'Organization']);

/** Ranking tiers for a noun phrase; higher wins regardless of frequency. */
const TIER_ENTITY = 2; // a named person, place, or organization
const TIER_PROPER = 1; // some other proper noun (capitalized name)
const TIER_COMMON = 0; // a plain common noun
const TIER_SKIP = -1; // pronouns and the like — never a useful title

/**
 * Generate a human-friendly title for a dump note from its content.
 *
 * Uses compromise to pull out noun phrases and ranks them by tier first —
 * named entities (people, places, organizations) beat other proper nouns,
 * which beat common nouns — with frequency then first appearance breaking
 * ties within a tier. When a dump has no usable noun (e.g. a verb-driven
 * "Sometimes I eat too much."), it falls back to the predicate of the first
 * sentence, then to its leading words, so nounless notes still get a topical
 * title. The winner is rendered as "X - <suffix>" so the topic leads the
 * filename. Returns an empty string only when nothing usable is found, so
 * callers can fall back to a timestamp.
 */
export function generateTitle(text: string, suffix: string): string {
	const subject = pickSubject(text) || pickPredicate(text) || leadingWords(text);
	if (!subject) return '';
	const trimmed = suffix.trim();
	return trimmed ? `${titleCase(subject)} - ${trimmed}` : titleCase(subject);
}

/** The most representative noun phrase in the text, cleaned for display. */
function pickSubject(text: string): string {
	const phrases = nlp(text).nouns().json() as NounPhrase[];

	interface Tally {
		display: string;
		tier: number;
		count: number;
		order: number;
	}
	const tallies = new Map<string, Tally>();
	let order = 0;

	for (const phrase of phrases) {
		const tier = tierOf(phrase);
		if (tier === TIER_SKIP) continue;
		const display = cleanPhrase(phrase.text ?? '');
		if (!display) continue;
		const key = display.toLowerCase();
		const existing = tallies.get(key);
		if (existing) {
			existing.count += 1;
			existing.tier = Math.max(existing.tier, tier);
		} else {
			tallies.set(key, { display, tier, count: 1, order: order++ });
		}
	}

	let best: Tally | undefined;
	for (const tally of tallies.values()) {
		if (!best || isBetterTally(tally, best)) best = tally;
	}

	return best?.display ?? '';
}

/**
 * The predicate of the first sentence — its first verb through the clause end
 * (e.g. "Sometimes I eat too much." → "eat too much"). Used when no noun
 * subject exists. Returns an empty string when the sentence has no verb.
 */
function pickPredicate(text: string): string {
	const predicate = nlp(text).sentences().first().match('#Verb+ .*').text();
	return cleanPhrase(predicate);
}

/** The leading words of the first sentence — a last resort before a timestamp. */
function leadingWords(text: string): string {
	const sentence = nlp(text).sentences().first().text() || text;
	return cleanPhrase(sentence);
}

/** Whether `a` should outrank `b`: tier, then frequency, then first seen. */
function isBetterTally(
	a: { tier: number; count: number; order: number },
	b: { tier: number; count: number; order: number },
): boolean {
	if (a.tier !== b.tier) return a.tier > b.tier;
	if (a.count !== b.count) return a.count > b.count;
	return a.order < b.order;
}

/**
 * Classify a noun phrase into a ranking tier from its tagged terms. Pronouns
 * (and phrases with no content word) are skipped; an entity tag anywhere wins.
 */
function tierOf(phrase: NounPhrase): number {
	let tier = TIER_SKIP;
	for (const term of phrase.terms ?? []) {
		const tags = term.tags ?? [];
		if (tags.includes('Conjunction')) continue;
		if (tags.some((tag) => ENTITY_TAGS.has(tag))) return TIER_ENTITY;
		if (tags.includes('Pronoun')) continue;
		tier = Math.max(tier, tags.includes('ProperNoun') ? TIER_PROPER : TIER_COMMON);
	}
	return tier;
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
	return phrase.replace(
		/(^|\s)(\w)/g,
		(_: string, sep: string, c: string) => sep + c.toUpperCase(),
	);
}
