import type { App, TFile } from 'obsidian';

/**
 * Larry's Brain edges — typed links from one note to another, written in the
 * note body as `EDGE: [[Note Title]]` (see CONTEXT.md). This module owns the
 * edge syntax so every feature that writes an edge (Remember's `FOUND`, the
 * Relate command's user-named edges) shares one definition of what an edge
 * looks like and how it lands in a note.
 *
 * The pure pieces (`normalizeEdgeType`, `buildEdgeLine`) carry no `App`, so the
 * round-trip is unit-testable with plain strings; {@link appendEdge} is the one
 * App-dependent helper, kept here beside the syntax it writes.
 */

/**
 * Edge name for a link from a search note to a note the user opened from its
 * results (Remember). The plain `[[...]]` default edge reads as {@link LINKS_EDGE}.
 */
export const FOUND_EDGE = 'FOUND';

/** The edge a bare `[[...]]` link reads as — the default when none is named. */
export const LINKS_EDGE = 'LINKS';

/**
 * Default edge for a note related to a thought captured on its behalf (the
 * Cortex "Related thought" button). Matches the Relate modal's default so a
 * one-click related thought reads the same as one made through Relate → thought.
 */
export const RELATES_TO_EDGE = 'RELATES_TO';

/**
 * Normalize a free-text edge name to the convention edges are written in:
 * upper snake case (`FOUND`, `RELATES_TO`, `IDEA_FOR`). Spaces and hyphens
 * become underscores; anything that isn't a letter, digit, or underscore is
 * dropped; runs of underscores collapse and the edges are trimmed. Returns `''`
 * when nothing usable remains, which callers treat as "no edge type given".
 */
export function normalizeEdgeType(raw: string): string {
	return raw
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, '_')
		.replace(/[^A-Z0-9_]/g, '')
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');
}

/** Build a single edge line: `TYPE: [[Target Title]]`. */
export function buildEdgeLine(type: string, targetBasename: string): string {
	return `${type}: [[${targetBasename}]]`;
}

/**
 * Read back the targets of every `TYPE: [[Target]]` edge of one type in a note's
 * text — the inverse of {@link buildEdgeLine}. Returns each target's basename,
 * stripping a `[[Target|alias]]` display alias down to the linked note. Matches
 * only whole lines (leading whitespace tolerated) so a `[[link]]` sitting in
 * prose is never mistaken for an edge. `type` is matched case-sensitively, in the
 * upper-snake form edges are written in.
 *
 * Pure, so the metadata graph the Points tally walks can be assembled and tested
 * from plain note text without an `App`.
 */
export function parseEdgeTargets(text: string, type: string): string[] {
	const targets: string[] = [];
	for (const line of text.split('\n')) {
		const match = /^\s*([A-Z0-9_]+):\s*\[\[([^\]]+)\]\]\s*$/.exec(line);
		const inner = match?.[2];
		if (!match || match[1] !== type || inner === undefined) {
			continue;
		}
		// Drop a `|alias` display suffix; the link target is what identifies the note.
		targets.push(inner.replace(/\|.*$/, '').trim());
	}
	return targets;
}

/** Options controlling how an appended edge is spaced from the note body. */
export interface AppendEdgeOptions {
	/**
	 * Leave a blank line between the preceding content and the edge. Relate uses
	 * this so a user-named edge stands clear of the note's prose; Remember's
	 * `FOUND` edges don't, so a search note's links stay compact.
	 */
	blankLineBefore?: boolean;
}

/**
 * Append a typed edge from `note` to `target` (by basename). Idempotent: an
 * identical edge line already present is left untouched, so re-running a relate
 * or re-opening a found result won't duplicate it. Reads then modifies the whole
 * note; see the race-condition note in STATUS for the `Vault.process` fix this
 * shares with Remember.
 */
export async function appendEdge(
	app: App,
	note: TFile,
	type: string,
	targetBasename: string,
	options: AppendEdgeOptions = {},
): Promise<void> {
	if (type.length === 0) {
		throw new Error('Cannot write an edge with an empty type.');
	}
	const line = buildEdgeLine(type, targetBasename);
	const data = await app.vault.read(note);
	if (data.includes(line)) {
		return;
	}
	let separator = '';
	if (data.length > 0 && !data.endsWith('\n')) {
		separator += '\n';
	}
	// A blank line in front, unless the note already ends in one.
	if (options.blankLineBefore && data.length > 0 && !data.endsWith('\n\n')) {
		separator += '\n';
	}
	await app.vault.modify(note, `${data}${separator}${line}\n`);
}
