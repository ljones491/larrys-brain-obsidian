# Goal: Subsume Points into Larry's Brain

## Why

[Points](https://github.com/ljones491/points) is a CLI for logging where your focus goes: you "spend a point" whenever you pick a main focus, and roll-up tallies show where effort landed. Its full behavior is described in the Points repo's `FEATURES.md`. We want that feature set inside the Larry's Brain Obsidian plugin instead of as a standalone CLI/website, so it works on every device that can load the vault, and so areas and points become linkable notes in the graph rather than rows in a hidden text file.

Bringing Points into the vault is a net gain over the CLI: areas and points become first-class notes that link to the rest of the vault (the core power of Obsidian), and they form their own island in the graph view. The tally stops being a stored counter and becomes an emergent property of the link graph — always correct, never drifting.

## Guardrails (what NOT to do)

These are hard boundaries. They exist because the natural gravity of this feature pulls toward violating them.

- **Do not model areas or points as Objects/Sets.** The object system (`src/object/`, `object.ts`) is for *user-authored* schemas. Points is a *system-owned* note kind with fixed structure and fixed edge semantics. Reuse `edge.ts`; do not touch `object.ts` or the `.base` machinery.
- **Do not add Points controls to the Cortex view.** Cortex stays a light button-to-command mapper for the Objects world. Points gets its own front door (its own ribbon icon and its own dockable view). It is a *sibling* of Cortex, not a tenant.
- **Do not index point notes into Remember.** They are numerous and tiny; they would be BM25 noise. They must still live in the graph and in backlinks — linkable is not the same as searchable.
- **Do not store the tally as a number.** Totals are always derived from the link graph. There is no counter to keep in sync.

## The model

Everything is a note, riding the existing typed-edge convention (`TYPE: [[Target]]` from `edge.ts`), inside a dedicated meta namespace so it can never collide with or clutter the rest of the plugin.

- **Area = a note (a hub).** Tagged `#points/area`, stored under the Points meta folder. Parentage is a typed edge on the area note: `UNDER: [[Parent area]]`. Multiple parents = multiple `UNDER` edges, so the hierarchy is a DAG that falls out of `appendEdge` for free. Areas are searchable and freely linkable to any other vault note.
- **Point = a note (an event).** Tiny and timestamped, with one edge `ON: [[Area]]`. This is the satellite in the graph. Because it is a real note it can *also* link out to whatever prompted it (a thought, a project note, a daily note). Tagged so the `larrys-meta` convention excludes it from the search index, but it remains in the graph and backlinks.
- **Tally = derived, never stored.** An area's total is the count of `ON`-backlinks to itself plus everything reachable *downward* through `UNDER` edges. Counted once per point even when a shared ancestor is reachable by multiple paths (dedupe by point-note identity). Points roll upward only; never down to children.

The resulting graph island: area-hubs joined by `UNDER`, swarmed by `ON`-linked point satellites, threaded out to the rest of the vault wherever the user chooses to link.

## User journeys

### 1. Spend a point (the muscle-memory path)

The high-frequency action; must be one gesture and identical on desktop and mobile.

1. Trigger **"Spend a point"** — command palette, hotkey, or a ribbon icon (the ribbon matters on mobile, where there is no palette).
2. A fuzzy-suggest modal opens (the analog of the CLI's searchable picker). Type to filter existing areas; select one; or choose "+ new area…" to create inline. On a new name, confirm ("Created new area *X*") so a typo cannot silently fork a duplicate.
3. Optional "under…" step files a new area beneath a parent, creating the parent inline if needed.
4. Create the **point note** (timestamped, `ON: [[Area]]`), creating the **area note** first if it did not exist.
5. Show a `Notice`: **"+1 on Dishes · 14 total"** — the total computed live from backlinks.

The fast path opens nothing. Every point is nonetheless a durable, linkable note.

### 2. View your focus (the review path)

A dedicated **Points panel**, opened from its own ribbon icon / an "Open Points" command — never a Cortex section.

- Opens at the top level: each area as a block of colored squares plus a ranked legend with exact totals (mirrors `points view`). Each area at a level gets a distinct color shared between its squares and its legend row.
- Legend rows and square-blocks **link to the real area note**. Clicking opens the hub.
- **Each area note is its own dashboard.** Render a live block inside the area note showing its total, its child areas, and its recent points — all clickable links. Opening an area note *is* drilling down, so the panel and note navigation are one motion.
- **Today's log** sits at the bottom, newest first, in local time; entries are point notes you can open. This is the "did I already log this?" safety.
- The **graph view** is a legitimate third way to browse: pan the Points island, follow `UNDER` up to categories, follow a stray link out to the project an area feeds.
- Empty states speak ("nothing logged today") instead of showing blank space. Layout is terminal/width-aware — square blocks wrap to fit.

### 3. Organize and cross-link

- **Move under a parent**: append or rewrite an `UNDER` edge, reusing the same edge machinery Relate uses. Refuse any edge that would make an area its own ancestor and report it, rather than corrupting data.
- **Cross-link out to the vault** (the payoff): from an area or point note, link to the rest of the vault — an area feeding a project, a point citing the thought that sparked it. Expose this as a light "relate" affordance on area/point notes so it is a first-class move, not hand-typed markdown.
- Forgiving name matching: area names ignore casing and surrounding whitespace, so "Dishes" and "dishes" are the same area.

## Implementation notes (to limit wandering)

Follow the codebase's defining pattern (see `CODEBASE-MAP.md`): a new feature is a folder under `src/` with a **pure core** (string/transform/graph logic, unit-tested against the stubbed `obsidian`) plus an **`App`-dependent shell** that does vault I/O; `main.ts` only wires the command, ribbon, and view.

- **New feature folder**: `src/points/`. Reference examples for the split are `MemoryWeb` (`remember/memory-web.ts`) and `object.ts`.
- **Reuse, do not reinvent**: `edge.ts` `appendEdge` for `UNDER`/`ON` edges; `meta.ts` for the namespace tag/folder and search exclusion; `utils/notes.ts` `createUniqueNote` for all note creation (atomic write, timestamps, sanitize). Inject `new Date()` / any rng the way `object.ts` does so the core is testable.
- **Namespace**: put Points notes under the `larrys-meta` tree (e.g. `larrys-meta/points/`) and give point notes a meta tag so `search-index.ts` excludes them. Keep area notes searchable. Define the tag literals (`#points/area`, `#points/point`, edge types `UNDER` / `ON`) as owned constants in one module in `src/points/`, mirroring how `meta.ts`/`edge.ts` own their magic strings — change them there, not at call sites.
- **Tally walk**: a pure function over the edge graph — resolve `ON`-backlinks per area, then sum descendants via `UNDER`, deduping point notes so a diamond ancestor counts each point once. Guard the walk against cycles. This is the most logic-heavy piece and the first thing to unit-test.
- **Edge-append race**: `appendEdge` has a known read-modify-write race (see `CODEBASE-MAP.md` Risks). Spending points appends edges frequently; migrate `appendEdge` to `Vault.process` as part of this work, which also fixes Remember and Relate.
- **Mobile**: this must run on mobile (`isDesktopOnly: false`). Avoid Node/Electron APIs and heavy in-memory structures in the Points path.
- **Panel rendering**: the colored-squares view is a dockable leaf like `CortexView`; style it with Obsidian CSS variables (look them up, do not hard-code colors) so it respects the user's theme.

## Done means

- "Spend a point" works from palette and ribbon on desktop and mobile, creating linkable area/point notes and reporting a live total.
- A dockable Points panel shows colored-square tallies with a ranked legend, drill-down into area notes, and today's log — with Cortex untouched.
- Areas and points appear as their own island in the graph and can be linked to any other note.
- Point notes never appear in Remember results.
- Tallies are always derived from the graph; deleting a point note corrects the total with no other action.
- Core logic (tally walk, name matching, cycle protection) is covered by `*.test.ts` that run without booting Obsidian.
