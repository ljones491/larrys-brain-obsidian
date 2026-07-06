import { App, FuzzySuggestModal, type FuzzyMatch } from 'obsidian';
import type { AreaEntry } from './graph-source';
import { normalizeAreaName } from './constants';

/**
 * One row in the picker: an existing area to land on, or the "+ new area…"
 * affordance carrying whatever the user has typed so far.
 */
type AreaItem =
	| { kind: 'existing'; name: string }
	| { kind: 'new'; name: string };

/**
 * The muscle-memory front door for spending a point — the analog of the CLI's
 * searchable picker. Type to fuzzy-filter existing areas and pick one; or, when
 * the typed name matches none, a "+ new area…" row lets you create it inline.
 * Either way the chosen name is handed back and the shell resolves it (matching
 * or creating the area), so a casing slip can't silently fork a duplicate.
 */
export class SpendAreaModal extends FuzzySuggestModal<AreaItem> {
	constructor(
		app: App,
		private areas: AreaEntry[],
		private onChoose: (name: string) => void,
	) {
		super(app);
		this.setPlaceholder('Spend a point on…');
	}

	getItems(): AreaItem[] {
		return this.areas.map((a) => ({ kind: 'existing', name: a.name }));
	}

	getItemText(item: AreaItem): string {
		return item.name;
	}

	/**
	 * The fuzzy matches over existing areas, plus a synthetic "+ new area…" row
	 * when the typed name matches no existing area (by folded identity). The new
	 * row sorts last so an existing match is always the default.
	 */
	getSuggestions(query: string): FuzzyMatch<AreaItem>[] {
		const matches = super.getSuggestions(query);
		const typed = query.trim();
		if (typed.length > 0) {
			const wanted = normalizeAreaName(typed);
			const exists = this.areas.some((a) => normalizeAreaName(a.name) === wanted);
			if (!exists) {
				matches.push({ item: { kind: 'new', name: typed }, match: { score: 0, matches: [] } });
			}
		}
		return matches;
	}

	renderSuggestion(match: FuzzyMatch<AreaItem>, el: HTMLElement): void {
		if (match.item.kind === 'new') {
			el.setText(`+ New area: ${match.item.name}`);
			return;
		}
		super.renderSuggestion(match, el);
	}

	onChooseItem(item: AreaItem): void {
		this.onChoose(item.name);
	}
}
