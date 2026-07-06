import { Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import {
	DEFAULT_SETTINGS,
	LarrysBrainSettings,
	LarrysBrainSettingTab,
} from './settings';
import { LarryWriteModal } from './capture/larry-write-modal';
import { RememberModal } from './remember/remember-modal';
import { ResultsModal } from './remember/results-modal';
import { createDumpNote } from './capture/note';
import { MemoryWeb } from './remember/memory-web';
import { SearchIndex } from './remember/search-index';
import { DefineObjectKindModal } from './object/define-object-kind-modal';
import { createObjectKind } from './object/object-kind';
import { CreateObjectModal } from './object/create-object-modal';
import {
	createObject,
	listObjectKinds,
	moveKindToDomain,
	promoteToObject,
	writeSetBase,
} from './object/object';
import type { ObjectKindOption } from './object/object';
import { parseObjectTag, recognizeObjectKind } from './object/object-note';
import { MoveToDomainModal } from './object/move-to-domain-modal';
import { RelateModal, RelateChoice } from './relate/relate-modal';
import { RelateSearchModal } from './relate/relate-search-modal';
import {
	relateFromNewThought,
	relateToExisting,
	relateToNewObject,
	relateToNewThought,
} from './relate/relate';
import { normalizeEdgeType, RELATES_TO_EDGE } from './edge';
import { CortexView, CORTEX_VIEW_TYPE } from './object/cortex-view';
import { PointsBook } from './points/points';
import { SpendAreaModal } from './points/spend-area-modal';
import { listAreas } from './points/graph-source';

export default class LarrysBrainPlugin extends Plugin {
	settings!: LarrysBrainSettings;
	private index!: SearchIndex;
	private memoryWeb!: MemoryWeb;
	private points!: PointsBook;

	async onload() {
		await this.loadSettings();

		// Persist the index inside the plugin's own folder so restarts restore
		// it instead of rebuilding the whole vault.
		const snapshotPath = this.manifest.dir
			? `${this.manifest.dir}/search-index.json`
			: null;
		this.index = new SearchIndex(this.app, snapshotPath);
		this.memoryWeb = new MemoryWeb(this.app, this.index);
		this.points = new PointsBook(this.app);
		// Defer the one full scan until Obsidian's own cache is warm so startup
		// stays light; afterwards only changed files are re-read.
		this.app.workspace.onLayoutReady(() => void this.index.build());

		// Keep the index current by reading a file only when it actually changes.
		this.registerEvent(
			this.app.vault.on('create', (f) => {
				if (f instanceof TFile) void this.index.onModify(f);
			}),
		);
		this.registerEvent(
			this.app.vault.on('modify', (f) => {
				if (f instanceof TFile) void this.index.onModify(f);
			}),
		);
		this.registerEvent(
			this.app.vault.on('delete', (f) => {
				if (f instanceof TFile) void this.index.onDelete(f.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on('rename', (f, oldPath) => {
				void this.index.onDelete(oldPath);
				if (f instanceof TFile) void this.index.onModify(f);
			}),
		);

		// Keep each kind's set view in sync with its definition: when a kind note's
		// frontmatter changes (a property added, removed, or reordered), rewrite
		// the column list of its `.base`, leaving the user's filters and sorting
		// alone. `changed` fires after the frontmatter is parsed, so the cache is
		// current; non-kind notes are rejected cheaply by the tag check.
		this.registerEvent(
			this.app.metadataCache.on('changed', (file, _data, cache) => {
				const def = recognizeObjectKind(cache.frontmatter);
				if (!def || def.objectTag.length === 0) {
					return;
				}
				writeSetBase(this.app, file.basename, def).catch((err: unknown) => {
					console.error('Object kind: failed to sync set view', err);
				});
			}),
		);

		// Larry's Brain Cortex: the plugin's control center, a dockable panel that
		// currently lists each kind's set with a button to open its base in the main
		// view. Registered as a view, surfaced via a ribbon icon and a command that
		// reveals it in the right sidebar.
		this.registerView(CORTEX_VIEW_TYPE, (leaf) => new CortexView(leaf, this));
		// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Larry's Brain Cortex" is a proper name
		this.addRibbonIcon('box', "Open Larry's Brain Cortex", () => {
			void this.activateCortex();
		});
		this.addCommand({
			id: 'open-object-sets',
			name: 'Open cortex',
			callback: () => void this.activateCortex(),
		});

		this.addCommand({
			id: 'larry-write',
			name: 'Larry write',
			callback: () => this.openLarryWrite(),
		});

		this.addCommand({
			id: 'remember',
			name: 'Remember',
			callback: () => this.openRemember(),
		});

		// Points gets its own front door, a sibling of Cortex — not a Cortex tenant.
		// The ribbon icon matters on mobile, where there is no command palette.
		this.addRibbonIcon('plus-circle', 'Spend a point', () => {
			this.openSpendPoint();
		});
		this.addCommand({
			id: 'spend-a-point',
			name: 'Spend a point',
			callback: () => this.openSpendPoint(),
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new LarrysBrainSettingTab(this.app, this));
	}

	/**
	 * Reveal the Cortex panel in the right sidebar, reusing an existing leaf if one
	 * is already open so repeated activations don't stack panels.
	 */
	private async activateCortex(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(CORTEX_VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			await leaf?.setViewState({ type: CORTEX_VIEW_TYPE, active: true });
		}
		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	private openLarryWrite(): void {
		new LarryWriteModal(this.app, (text) => {
			createDumpNote(this.app, text, {
				tag: this.settings.tag,
				titleSuffix: this.settings.titleSuffix,
			}).catch((err: unknown) => {
				console.error('Larry write: failed to create note', err);
				new Notice('Larry write: failed to create note.');
			});
		}).open();
	}

	/**
	 * Larry write, but linked: capture a new thought and relate it back to the
	 * note open in the main view. Same zen writing surface as {@link openLarryWrite};
	 * the only difference is the new thought carries a `RELATES_TO` edge to the note
	 * that was on screen when the button was clicked, leaving that note untouched.
	 * Invoked from the Cortex panel's "Current note" section. The subject is
	 * captured up front so opening the modal (or the new note) can't change which
	 * note the edge points at.
	 */
	writeRelatedThought(): void {
		const subject = this.app.workspace.getActiveFile();
		if (!subject) {
			new Notice('Open a note to relate a thought to it.');
			return;
		}
		new LarryWriteModal(this.app, (text) => {
			relateFromNewThought(this.app, subject, RELATES_TO_EDGE, text, {
				tag: this.settings.tag,
				titleSuffix: this.settings.titleSuffix,
			}).catch((err: unknown) => {
				console.error('Larry write: failed to create related thought', err);
				new Notice('Larry write: failed to create related thought.');
			});
		}).open();
	}

	/** Open the Define object kind modal. Invoked from the Cortex panel button. */
	openDefineObjectKind(): void {
		new DefineObjectKindModal(this.app, (kind) => {
			createObjectKind(this.app, kind).catch((err: unknown) => {
				console.error('Define object kind: failed to create note', err);
				new Notice('Define object kind: failed to create note.');
			});
		}).open();
	}

	/**
	 * Open the Create object modal for a specific kind. Invoked from the Cortex
	 * panel's per-kind create button; the kind is fixed so the modal drops its
	 * kind dropdown and focus lands straight in the name box.
	 */
	openCreateObject(kind: ObjectKindOption): void {
		new CreateObjectModal(
			this.app,
			[kind],
			(object) => {
				createObject(this.app, object).catch((err: unknown) => {
					console.error('Create object: failed to create note', err);
					new Notice('Create object: failed to create note.');
				});
			},
			kind,
		).open();
	}

	/**
	 * Promote the note on screen into an OBJECT instance of `kind`. Invoked from
	 * the Cortex panel's per-kind promote button — the kind is chosen by which
	 * button, so this is one-click: the note is rewritten in place, its body kept
	 * verbatim, its configured memory tag (`thought`) swapped for the kind's
	 * instance tag, and the kind's properties seeded from its existing frontmatter.
	 */
	promoteActiveNote(kind: ObjectKindOption): void {
		const subject = this.app.workspace.getActiveFile();
		if (!subject) {
			new Notice('Open a note to promote it.');
			return;
		}
		promoteToObject(this.app, subject, kind, {
			dropTag: this.settings.tag,
			titleSuffix: this.settings.titleSuffix,
		}).catch((err: unknown) => {
			console.error('Promote: failed to promote note', err);
			new Notice('Promote: failed to promote note.');
		});
	}

	/**
	 * Move a kind into a domain (or out of one). Invoked from the Cortex panel's
	 * per-kind right-click menu. Prompts for a domain, prefilled with the kind's
	 * current one, then retags the kind and its whole set via {@link moveKindToDomain}.
	 * The Cortex panel re-renders itself off the metadata changes the move makes.
	 */
	moveKindToDomain(kind: ObjectKindOption): void {
		const { domain } = parseObjectTag(kind.def.objectTag);
		new MoveToDomainModal(this.app, kind.name, domain, (next) => {
			moveKindToDomain(this.app, kind, next)
				.then((count) => {
					const where = next ? `to ${next}` : 'out of its domain';
					new Notice(
						`Moved ${kind.name} ${where} (${count} note${count === 1 ? '' : 's'} retagged).`,
					);
				})
				.catch((err: unknown) => {
					console.error('Move to domain: failed to migrate kind', err);
					new Notice('Move to domain: failed to migrate kind.');
				});
		}).open();
	}

	/**
	 * The muscle-memory path: open the area picker, then spend a point on the
	 * chosen (or freshly created) area. Confirms a brand-new area so a typo can't
	 * silently fork a duplicate, and reports the area's live total — derived from
	 * the link graph, never a stored counter.
	 */
	private openSpendPoint(): void {
		new SpendAreaModal(this.app, listAreas(this.app), (name) => {
			this.points
				.spendPoint(name)
				.then(({ area, total, createdArea }) => {
					if (createdArea) {
						new Notice(`Created new area "${area.basename}".`);
					}
					new Notice(`+1 on ${area.basename} · ${total} total`);
				})
				.catch((err: unknown) => {
					console.error('Spend a point: failed to spend point', err);
					new Notice('Spend a point: failed to spend point.');
				});
		}).open();
	}

	private openRemember(): void {
		new RememberModal(this.app, (query) => {
			this.remember(query).catch((err: unknown) => {
				console.error('Remember: search failed', err);
				new Notice('Remember: search failed.');
			});
		}).open();
	}

	/**
	 * Run a Remember and surface it: open the recorded `#search` note, then let
	 * the user preview the matches. Each result the user opens is linked back
	 * into the search note as a `FOUND: [[...]]` edge. The results modal stays
	 * open so a single search can spawn several such memory links.
	 *
	 * The orchestration lives in {@link MemoryWeb}; this shell only opens leaves
	 * and modals.
	 */
	private async remember(query: string): Promise<void> {
		const session = await this.memoryWeb.remember(query);
		// Open the search note in the active leaf so it's the note on screen
		// while the results modal sits on top.
		void this.app.workspace.getLeaf(false).openFile(session.searchNote);
		new ResultsModal(this.app, query, session.results, (file) => {
			this.memoryWeb.recordFound(session, file).catch((err: unknown) => {
				console.error('Remember: failed to link found note', err);
				new Notice('Remember: failed to link found note.');
			});
			// Open the result in a new tab so the search note stays put.
			void this.app.workspace.getLeaf('tab').openFile(file);
		}).open();
	}

	/**
	 * Relate the currently active note. Invoked from the Cortex panel's Relate
	 * button; warns if no note is open since Relate needs a subject to act on.
	 */
	relateActiveNote(): void {
		const subject = this.app.workspace.getActiveFile();
		if (!subject) {
			new Notice('Open a note to relate it.');
			return;
		}
		this.openRelate(subject);
	}

	/**
	 * Relate the note on screen (`subject`) to another note with a typed edge.
	 * First gathers the edge name and how to supply its object; then opens the
	 * matching follow-on modal (capture, create-object, or a note picker) and
	 * writes the edge once the object is known. The edge always lands in the
	 * subject — edges read as actions from subject to object.
	 */
	private openRelate(subject: TFile): void {
		const kinds = listObjectKinds(this.app);
		new RelateModal(
			this.app,
			{
				subjectName: subject.basename,
				recentEdgeTypes: this.settings.recentEdgeTypes,
				canCreateObject: kinds.length > 0,
			},
			(choice) => {
				void this.rememberEdgeType(choice.edgeType);
				this.dispatchRelate(subject, choice, kinds);
			},
		).open();
	}

	/** Open the follow-on modal for the chosen object source and write the edge. */
	private dispatchRelate(
		subject: TFile,
		choice: RelateChoice,
		kinds: ObjectKindOption[],
	): void {
		const fail = (err: unknown) => {
			console.error('Relate: failed to link note', err);
			new Notice('Relate: failed to link note.');
		};

		switch (choice.mode) {
			case 'thought':
				new LarryWriteModal(this.app, (text) => {
					relateToNewThought(this.app, subject, choice.edgeType, text, {
						tag: this.settings.tag,
						titleSuffix: this.settings.titleSuffix,
					}).catch(fail);
				}).open();
				break;
			case 'object':
				new CreateObjectModal(this.app, kinds, (object) => {
					relateToNewObject(this.app, subject, choice.edgeType, object).catch(
						fail,
					);
				}).open();
				break;
			case 'existing':
				// Search by relevance (body + title) instead of title-only fuzzy.
				// The link comes from an existing note, so nothing is logged — this
				// is a read-only search. The subject is excluded so it can't link
				// to itself; meta notes are excluded by the index.
				new RelateSearchModal(
					this.app,
					(query) => this.memoryWeb.search(query, subject),
					(file) => {
						relateToExisting(this.app, subject, choice.edgeType, file)
							// Open the linked note in a new tab so the subject stays put.
							.then(() => this.app.workspace.getLeaf('tab').openFile(file))
							.catch(fail);
					},
				).open();
				break;
		}
	}

	/**
	 * Record an edge name as recently used, normalized and most-recent first, so
	 * the Relate modal can suggest it next time. Capped so the list stays short.
	 */
	private async rememberEdgeType(raw: string): Promise<void> {
		const type = normalizeEdgeType(raw);
		if (type.length === 0) {
			return;
		}
		const recent = [
			type,
			...this.settings.recentEdgeTypes.filter((t) => t !== type),
		].slice(0, 10);
		this.settings.recentEdgeTypes = recent;
		await this.saveSettings();
	}

	onunload() {
		// Flush any pending index write before we go.
		void this.index.dispose();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LarrysBrainSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}