# Profile design study

Open `index.html` directly, or serve this directory:

```sh
python -m http.server 3344 --bind 127.0.0.1 --directory design/prototypes/profile
```

`index.html` is the richer second concept. `minimal.html` preserves the first concept for comparison.
Both use fictional account data and real Steam artwork. Interactions stay in browser memory and
reset on reload; they do not read or change a real Shelf account.

The second concept gives personal writing the main column, with gaming context alongside it:

- Explicit favorites and a five-game showcase.
- Reviews with a pinned review, rating, reading expansion, spoiler reveal, likes and comments.
- Reviews are written from game pages. The profile selects an existing review to pin, with no review-writing form.
- **View all reviews** opens the complete eight-review sample collection, with search and sorting.
- Journal entries about the experience of playing, separate from scored reviews.
- Curated collections with descriptions and shared discovery as their purpose.
- Current play, an annual completion goal, recent activity, a wishlist and personal milestones.
- Follow/following and shared favorites, visible through **View as visitor**.
- Profile editing with section visibility, featured-review selection, a goal and a taste statement.

## Design basis

The seven-product baseline is in GitHub issue #211. For this revision, Letterboxd's live profile
was inspected again: personal writing occupies its main column, with lists and activity beside
it. Backloggd's profile was blocked by its bot check on this revisit. The original inspection
remains useful, but that new page was not inspected past the check. No third-party review text
was copied; the example reviews and journal entry were written for this study.

The overview has no local tab row: its sections are close enough to scan naturally. Its **View all
reviews** action opens an independent browsing view. Collections and journal can earn similar
navigation when they need it; short jumps inside this overview did not justify tab styling.

## Product work implied by the concept

This is a visual proposal, not a statement that these features are implemented in Shelf.

| Candidate | Follow-up work if retained |
| --- | --- |
| Public reviews | Author, edit and delete from the game's page. The profile browses all public reviews and selects an existing one to pin. Define reviews separately from private notes, with ratings and spoilers; never publish a private note by inference. |
| Comments and likes | Account-scoped writes, abuse controls, reporting/moderation, notifications and deletion behavior. |
| Follow relationships | Following/unfollowing, account visibility, blocking behavior, counts and deletion. No activity feed is implied solely by following. |
| Gaming journal | Dated owner-authored entries, editing and privacy; no invented play events from sync timestamps. |
| Curated collections | Ordered/manual lists alongside query-based smart shelves; descriptions, public visibility, saves and lifecycle behavior. |
| Annual goals and milestones | Explicit goal settings and documented derivation from reliable library dates. |
| Shared favorites | Compare only games both accounts are allowed to see. |

All proposed outputs must inherit private-library and private-game filtering before aggregation.
Device themes and colorways still belong to the viewer. A real implementation must follow the
repository's translations, Storybook, accessibility, caching and validation rules.
