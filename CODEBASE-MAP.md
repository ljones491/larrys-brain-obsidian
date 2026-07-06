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
                             preset to that kind, or a shuffle button that opens
                             a random member; a section button opens Define kind).
                             A "Current note" section relates the active note.
```

CortexView is now the entry point for Create object and Relate (no longer command-palette commands); Larry write, Remember, and Promote remain commands.

### Index freshness (the search invariant)

`main.ts` wires `create/modify/delete/rename` → `index.onModify/onDelete`. On load, `restore()` (snapshot) → `reconcile()` (drop deleted, re-read mtime-changed) or `rebuild()` (scan all). Every mutation path awaits `build()` first so an early event can't race the initial load; the build is deferred to `onLayoutReady` and memoized; `onunload` flushes pending writes. The most carefully engineered part of the codebase.

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
