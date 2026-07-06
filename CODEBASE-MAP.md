# Codebase map

A navigable map of how Larry's Brain actually works — traced from behavior, not from the file tree. For orientation before changing code.

## Archetype

An **Obsidian community plugin**: TypeScript bundled to `main.js` and loaded by Obsidian. Structurally it's a **command-and-modal application over a vault of Markdown notes** — no server, no React tree. The "UI" is Obsidian modals, the "database" is the vault itself, and the one piece of real engine machinery is an in-memory MiniSearch index. Features are traced two ways: a command inward (request-style) and a note through its lifecycle (pipeline-style).

## The model in one paragraph

Everything is a **note**. The user captures raw thoughts (**Larry Write** → dump notes), searches them (**Remember**, which records its own `#search` note and links each opened result back with a `FOUND` edge — that link web is the point), links notes with typed **edges** (**Relate**), and structures notes into typed **Objects** grouped into **Sets** (**Define kind / Create / Promote**, surfaced through Obsidian **Bases** `.base` files and a dockable panel). The plugin keeps its own bookkeeping notes out of the way under a `larrys-meta` tag/folder, and keeps a persisted search index warm so search is instant.

## Layers

`main.ts` is a thin **shell**: it registers commands and vault-event listeners, opens leaves and modals, and delegates everything else. All logic lives in feature modules under `src/`, split into a pure core (string/transform logic, unit-tested against a stubbed `obsidian`) and an `App`-dependent shell function that does the vault I/O. This separation is the codebase's defining trait and the pattern any new feature should follow.

```
src/
  main.ts                 # shell: commands, vault-event wiring, modal orchestration
  settings.ts             # settings interface + tab (tag, titleSuffix, recentEdgeTypes, preferredSetView)
  meta.ts                 # `larrys-meta` tag/folder convention; tag normalization
  edge.ts                 # typed-edge syntax `TYPE: [[Target]]`; appendEdge (idempotent)
  memory-note.ts          # #search / dump note contents + recognition
  capture/                # Larry Write: modal, note creation, title generation (compromise)
  remember/               # Remember: search-index, memory-web, search, modals
  object/                 # Objects/Sets: kinds, instances, promote, .base files, Cortex panel
  relate/                 # Relate: edge-type modal + relevance note picker
  points/                 # Points (in progress): system-owned area/point notes
  utils/notes.ts          # createUniqueNote, sanitize, stamps, suffix strip
```

## I/O boundary (where it touches the world)

| Sink | Where | Notes |
|---|---|---|
| Vault read/write (notes) | `utils/notes.ts`, `object.ts`, `edge.ts`, `capture/note.ts` | all creation/mutation funnels through `createUniqueNote` + `vault.modify` |
| Index snapshot file | `search-index.ts` (`adapter.read/write` at `<plugindir>/search-index.json`) | only non-note disk I/O |
| Metadata cache (reads) | `search-index.ts`, `object.ts` | frontmatter reads always via `metadataCache` |
| Non-determinism | `utils/notes.ts` (`new Date()`), `object.ts` (`Math.random`, injectable `rng`) | injectable for tests |
| Settings | `main.ts` `loadData/saveData` | |

The seam is clean: pure logic (`edge.ts`, `meta.ts`, `object-instance.ts`, `promote.ts`, `search.ts` snippeting) carries no `App`, which is why the `.test.ts` files run without booting Obsidian.

## Implicit contracts (the real schema)

These literals *are* the API between features. Each has one owning module — change it there, not at call sites.

- `larrys-meta` (tag + folder root) — `meta.ts`. Recognizes the plugin's own notes; keeps them out of search.
- `thought` / `hmm` (default tag / title suffix) — `settings.ts`. Promote strips these to un-thought a note.
- `FOUND`, `LINKS`, `#search` — edge and memory-note vocabulary; `isRepeat` matches on normalized `query` frontmatter.
- `object/<kind>` / `object/<domain>/<kind>` — instance tag shape. `object-note.ts` `buildObjectTag`/`parseObjectTag` are the single round-trip; the tag *is* the source of truth for a kind's domain (no separate field). Nothing downstream assumes a fixed segment count, so a domain is just a middle tag level — instances, `listObjects`, `.base` filters, and hierarchical graph color groups (`tag:#object/media`) all work unchanged.
- `sets/` + `<name>.base` — `object.ts` `setBasePath` is the single source of truth.
- `SNAPSHOT_VERSION` — bump to invalidate the on-disk index; moves together with `MINISEARCH_OPTIONS`.

## Vertical slices

### Remember (command → note web)

```
Command "remember" (main.ts) → RememberModal (query)
  → MemoryWeb.remember(query)                        [remember/memory-web.ts]
      ├─ createSearchNote → createUniqueNote           writes a #search note w/ query frontmatter
      ├─ index.ready()                                 awaits the one-time build
      └─ runSearch(app, index, query, exclude)         [remember/search.ts]
          └─ SearchIndex.search → MiniSearch BM25       [remember/search-index.ts]
             → map hits to live TFiles, snippet, flag isRepeat
  → open search note in active leaf
  → ResultsModal(onOpen = file →)
      → recordFound → appendEdge(searchNote, "FOUND", file)   idempotent  [edge.ts]
      → open file in new tab
```

The `#search` note is itself indexed, so a later search finds prior searches and flags repeats — that recursion is the "memory web."

### A note's lifecycle (pipeline view)

```
raw text ──Larry Write──▶ dump note (#thought, title via compromise, date + source)
   │                          └─ indexed by SearchIndex on the 'create' event
   └──Promote──▶ OBJECT instance (swap #thought→kind tag, seed props from frontmatter,
                    strip " - hmm" suffix, rename keeping backlinks)
                          └─ belongs to a Set ◀── Define kind writes sets/<name>.base;
                             metadataCache 'changed' keeps its columns synced
                          └─ surfaced via CortexView panel (per-kind: openSetBase,
                             a create button that opens the Create object modal
                             preset to that kind, a promote button that one-click
                             promotes the active note to that kind, or a shuffle
                             button that opens a random member; a section button
                             opens Define kind).
                             A "Current note" section relates the active note.
```

Kinds can be grouped into **domains**: a kind's instance tag optionally nests a middle level (`object/media/book`), set at Define time (an optional Domain field) or later via the Cortex kind's right-click "Move to domain…". Moving is a full migration — `moveKindToDomain` (`object.ts`) retags every instance via `processFrontMatter`, rewrites the kind note's `object-tag`, and realigns the `.base` filter (`writeSetBase` now syncs the tag as well as the columns, via `syncBaseTag`). Cortex groups its Object-sets list under domain subheadings. Domains buy per-domain graph coloring for free: one hierarchical color group (`tag:#object/media`) covers every kind beneath it, so colors aren't set per kind.

CortexView is now the entry point for Create object, Relate, and Promote (no longer command-palette commands); Larry write and Remember remain commands. Promote is one-click per kind — the button picks the kind, so there is no longer a PromoteModal. A "Thoughts" section adds a one-click "Random thought" button — the unstructured counterpart to a set's shuffle, opening a random loose thought (`listThoughtNotes` in `capture/thought.ts`, filtered by the configured `thought` tag, meta excluded).

### Index freshness (the search invariant)

`main.ts` wires `create/modify/delete/rename` → `index.onModify/onDelete`. On load, `restore()` (snapshot) → `reconcile()` (drop deleted, re-read mtime-changed) or `rebuild()` (scan all). Every mutation path awaits `build()` first so an early event can't race the initial load; the build is deferred to `onLayoutReady` and memoized; `onunload` flushes pending writes. The most carefully engineered part of the codebase.

### Points (in progress — spend path shipped)

Subsumes the standalone Points CLI (see `GOAL.md`): "spend a point" to log where focus goes, tallied by rolling `ON`-points up an `UNDER` hierarchy of areas. A *system-owned* note kind — **not** an Object/Set — riding `edge.ts` directly.

Pure core:

- `points/constants.ts` — owns the literals: `#points/area` / `#points/point` tags, `UNDER` / `ON` edge types, folders, and `normalizeAreaName` (case/whitespace-folded matching key). **Layout call:** point events live under `larrys-meta/points/` (excluded from search by `isInMetaFolder`); area hubs live in a searchable `points/` folder. GOAL.md's prose files both under the meta tree, but that conflicts with its stronger "keep area notes searchable" rule, so areas sit outside it — no `search-index.ts` change needed.
- `points/tally.ts` — the tally walk, pure and unit-tested. `buildGraph(under, on)` indexes edges; `tallyFor`/`tallyAll` count distinct points `ON` an area or any descendant reachable *downward* through `UNDER`. Diamond-safe (dedupe by point id) and cycle-safe (visited set). Tallies are derived, never stored.
- `points/note.ts` — the area/point note schema (frontmatter + tags + the point's baked-in `ON` edge) and tag recognizers, pure like `memory-note.ts`.
- `edge.ts` `parseEdgeTargets(text, type)` — pure inverse of `buildEdgeLine`; reads edge targets back out of a note *body* (edges aren't in frontmatter, so the link cache can't type them). This is what lets the graph be assembled from text.

Vertical slice — **spend a point** (command → note web):

```
Ribbon "plus-circle" / command "Spend a point" (main.ts)
  → SpendAreaModal (FuzzySuggest over listAreas + "+ new area…")   [points/spend-area-modal.ts]
  → PointsBook.spendPoint(name)                                     [points/points.ts]
      ├─ resolveArea: match by normalizeAreaName over listAreas, else createUniqueNote in points/
      ├─ createPointNote: createUniqueNote in larrys-meta/points/, ON edge baked in
      └─ loadPointGraph(app) → tallyFor(graph, area)                [points/graph-source.ts]
  → Notice "+1 on Dishes · 14 total" (and "Created new area …" when new)
```

`points/graph-source.ts` is the vault→graph seam: `toEdges` (pure) parses `UNDER`/`ON` from note bodies into the tally arrays; `listAreas`/`loadPointGraph` (App) gather notes by tag and read bodies via `cachedRead`. Spend writes no `appendEdge` — the point's `ON` edge is part of the note's initial contents — so the `appendEdge` race doesn't touch this path.

Still to build: the dockable Points panel + colored-square tally, in-note area dashboards, `UNDER` parenting/relate affordances (Journey #3, where `appendEdge` *is* used), and the `appendEdge` → `Vault.process` migration GOAL.md folds into this work.

## Risks

| Item | Location | Severity | Note |
|---|---|---|---|
| Read-modify-write edge race | `edge.ts` `appendEdge` | Low–Med | Reads then modifies the whole note; concurrent appends could lose one. Already flagged in the doc comment with a `Vault.process` fix; shared by Remember and Relate, so fix it once there. |
| Bundle size ~2.6 MB | `main.js` (`compromise` + MiniSearch) | Low | Fine on desktop; heavy for the mobile support `manifest.json` claims (`isDesktopOnly: false`). |
| Full-vault scans | `object.ts` `listObjectKinds`/`listObjects` | Low | O(all notes) per call, but only on explicit command with a warm cache. |
| Placeholder manifest URLs | `manifest.json` `authorUrl`/`fundingUrl` | Cosmetic | Point at `obsidian.md`; fix before any catalog submission. |
| Dangling doc references | comments cite `STATUS`, `GOAL.md` | Cosmetic | Verify these files exist or update the references. |

No god objects (largest is `search-index.ts`, ~360 lines, cohesive), no empty catch blocks (all log via `console.warn/error` + a `Notice`), no time bombs.

## If you change this code

- **New feature**: pure logic + `.test.ts` in a feature folder, an `App`-dependent shell function, `main.ts` only wires the command/modal. `MemoryWeb` and `object.ts` are the reference examples.
- **Search behavior**: bump `SNAPSHOT_VERSION` on any `MINISEARCH_OPTIONS` change or restored snapshots silently mismatch.
- **Note-writing concurrency**: migrate `appendEdge` to `Vault.process`; that fixes both Remember and Relate.
- **Renaming a magic string**: change it in its owning module only (`meta.ts`, `edge.ts`, `memory-note.ts`, `object.ts`).

## Not yet traced

Modal UI internals (`*-modal.ts` DOM/styling — data flow through them is confirmed), `object/cortex-view.ts` panel rendering details, and the `object-base` / Bases `.base` file format.
