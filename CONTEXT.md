# Domain context

Vocabulary for Larry's Brain. Use these terms in code, comments, and module names
so the domain language stays consistent.

## Memory note

A note Larry's Brain captures and later **resurfaces** through search. The umbrella
concept over the kinds below. Every memory note carries frontmatter: a `date`, a
`tags` list, and a `source` (always `user` for now). Memory notes are meant to be
both written and, eventually, read back — when resurfaced they feed downstream
features (e.g. forming structured notes).

### Dump note

A memory note created by **Larry Write**: raw captured text with an auto-generated
title. Tagged with the user's configured tag (default `#thought`). Today it is
write-only; reading dump notes back is planned, not yet built.

### Search note

A memory note created by **Remember**: a record of a search, tagged `#search`, whose
frontmatter records the `query`. It is written *and* read back — a later Remember
recognizes a prior search note and flags a **repeat** when the query matches.

## Edge

A typed link from one note to another, written in the note body as
`EDGE: [[Note Title]]`. The default edge (a plain `[[...]]`) reads as `LINKS`. The
first named edge is `FOUND`, added to a search note for each result the user opens.
Edges are also user-named via **Relate**: from the note on screen (the *subject*),
the user names an edge (e.g. `RELATES_TO`, `IDEA_FOR`) to another note (the
*object*), and it's written into the subject. Edges read as actions from subject
to object, so they always land in the subject's body.

## Memory web

The graph that forms as searches link to the notes they surface, via `FOUND` edges.
The point of Remember: searching doesn't just find notes, it records that you found
them.
