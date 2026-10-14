# ADR 001: One entry per game, with a copy per platform

- **Status:** proposed, awaiting approval
- **Date:** 12 Oct 2026
- **Decides:** what a library entry is, where platforms live, and where a future sync attaches

## Context

The rule from the brief: a game is **one** library entry however many platforms I own it on.
Platforms owned, and physical or digital for each, are attributes of that entry.

Two things make that harder than it sounds.

**1. The reference app keys an entry to one IGDB record.** Its `library_entries` table is
`UNIQUE (user_id, game_id)`, and platforms are a list of nine coarse families in
`played_on text[]`. The research ([section 5](../research.md#5-the-reference-app-myspot-games))
lists what follows from that: possible duplicate entries, no way to say PS4 or PS5, no physical
or digital, ownership recorded in three places, and playtime keyed by store account, not by
platform.

**2. IGDB does not have one record per game.** Checked against the live API on 12 Oct 2026:

| What I would call one game | What IGDB holds |
| --- | --- |
| Shadow of the Tomb Raider | The game (37777) plus **seven** edition records pointing at it through `version_parent`: Croft Edition, Digital Deluxe, Ultimate, Definitive (typed "Bundle"), two Steelbook editions, Digital Croft |
| Skyrim on PC and on Switch | **Two records.** The original (472: PS3, PC, Xbox 360) and a separate "Port" record for Switch (37034) whose `parent_game` is 472. Special Edition is a third ("Remaster"), Anniversary Edition a fourth ("Expanded Game"). |
| Resident Evil 4 (2005) | GameCube original (974), a PS2/PC "Expanded Game" (145191), "Wii Edition" (a Port), an HD "Remaster" whose parent is the Wii port, and the 2023 "Remake" |
| Persona 5 Royal | An "Expanded Game" whose parent is Persona 5 |

Two more facts from the same check:

- Store identifiers sit on the base record. The base game carries its Steam id, its Microsoft
  Store id and Amazon listings marked per platform and as "Physical". The Ultimate Edition
  record carries none.
- The relations are edited by the community and are not tidy. A model that trusts them blindly
  will sometimes group wrongly.

So an entry cannot be "one IGDB record", and it cannot be "whatever IGDB groups together"
either.

## Decision

### 1. An entry is the game as I think of it

One row in `entries` holds everything that is true of the game regardless of platform: status,
my rating, notes, tags, date added, date completed.

### 2. An entry links to one or more IGDB records

Each linked record is a **version**. Exactly one is the **primary**: it supplies the title,
cover, year and the metadata used by filters. The rest are editions, ports, remasters and so on
that I have folded into the same entry.

An IGDB record can belong to only one entry. That single rule is what lets search say "already
in your library" for any version, and what lets a future sync find the right entry from any
store id.

### 3. Each thing I own is a copy

One row in `copies` per platform and format: PS4 physical, PC digital. A copy belongs to an
entry and may name the exact version it is (the Switch port, the Definitive Edition).

The entry's "platforms owned" is the set of platforms across its copies. Nothing else records
ownership.

### 4. Grouping is my decision, with a default

When I add a game that is related to one already on the shelf, the app proposes what to do and
I confirm:

| IGDB relation | Default | Why |
| --- | --- | --- |
| Edition (`version_parent`) | Same entry, silently | Same game in a different box |
| Port | Same entry, silently | Same game on another platform, which is the brief's own example |
| Remaster | Same entry, asks first | Usually the same game to its owner, but not always |
| Expanded game (Royal, Anniversary) | Same entry, asks first | Same reasoning |
| Remake | Separate entry, asks first | Usually a different game |

The primary is the version I picked when I first added the game, not IGDB's oldest ancestor. If
I only own Persona 5 Royal, the entry is titled Persona 5 Royal and dated 2019. I can change
the primary later.

### 5. Where each fact lives

| Fact | Lives on |
| --- | --- |
| Status, my rating, notes, tags, added and completed dates | `entries` |
| Title, cover, genres, themes, studios, ratings, time to beat | The primary version (cached from IGDB in `games`) |
| Platforms the game exists on | Union across the entry's versions |
| Platform owned, physical or digital | `copies` |
| Playtime | `play_time`, one row per source; the entry's total is the sum |

### 6. Tables

```text
entries         id, status, rating, notes, notes_public, featured,
                display_copy_id, added_at, completed_at, created_at, updated_at

games           id, igdb_id (unique, nullable), title, slug, game_type,
                first_release_date, cover, colors, metadata, store ids,
                fetched_at
                (the local cache of IGDB records)

entry_versions  entry_id, game_id (unique), relation
                relation: primary | edition | port | remaster | expanded
                          | remake | other
                (one primary per entry)

copies          id, entry_id, platform_id, format, game_id (nullable),
                acquired_at (nullable)
                format: physical | digital
                unique (entry_id, platform_id, format)

play_time       id, entry_id, copy_id (nullable), source, minutes
                source: manual (the only one for now)

tags            id, name, slug
entry_tags      entry_id, tag_id
platforms       igdb_id, name, abbreviation, family, generation, case_shape
```

Ids are text, generated by the app, so rows keep their identity through a future export and
import. Exact column types are an architecture detail for Phase 3.

## Worked examples

- **Shadow of the Tomb Raider, PS4 disc and Steam.** One entry. Primary: record 37777. Two
  copies: PS4 physical, PC digital. If the Steam copy is the Definitive Edition, that copy
  names record 123051, which is linked to the entry as an edition.
- **Skyrim on PC and Switch.** One entry. Versions: the original (primary) and the Switch port.
  Two copies. Grouped by platform, the game stands on the PC shelf and on the Switch shelf, and
  is counted once.
- **Resident Evil 4, the GameCube disc and the 2023 remake.** Two entries, because I said so
  when asked.
- **A wishlist game.** An entry with status wishlist and no copies.
- **A game I finished on a subscription and never owned.** An entry with status completed and
  no copies.

## Room for sync (designed, not built)

Nothing below exists yet. It shows that it fits without changing the tables above.
[ADR 003](003-platform-sync.md) (proposed) takes it further: how each source is matched, and
one `source_items` table in place of `copy_links`.

| Future need | Where it attaches |
| --- | --- |
| Find my entry from a Steam, Xbox or PlayStation id | Store id to IGDB record (IGDB publishes the mapping, cached in `games`), then record to entry through `entry_versions` |
| A store id that resolves to a record I have not linked | Walk its parents. If one is linked, attach it by the rules in decision 4. Otherwise create an entry. |
| Per-platform playtime | A `play_time` row with the copy and the source set. Manual time stays a separate row, so the two never overwrite each other. |
| Achievements per platform | A new table keyed by copy and source |
| Which account a copy came from | A new `copy_links` table: copy, source, the store's own id, last synced |
| Subscription or borrowed games | A new attribute on `copies`. Today a copy means "I own this". |

Sync data hangs off the **copy**, never off the entry and never off a store name alone. That is
the specific fix for the reference app, where PlayStation hours could not say which
PlayStation.

## Consequences

**Good**

- Status, rating and notes exist once per game. There is nothing to merge after a sync.
- A platform shelf shows a box for each copy, in that platform's case shape, with that
  version's own cover.
- Filters can ask precise questions: owned on Switch, physical only, owned on two or more
  platforms.
- Search recognizes a game I already have under any of its editions.

**Costs**

- Adding a game needs one or two extra IGDB requests to look up its family.
- Remasters and expanded editions need a decision from me. It is asked once, when adding.
- Grouped by platform, a game owned twice appears twice. That is deliberate, and the total
  still counts it once.
- Editing is slightly richer than a single platform picker: each platform has its own format.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| One entry per IGDB record (the reference app) | Produces the duplicates this decision exists to prevent |
| Entries per record, plus a "group" above them | Two levels to manage, and status would exist at both |
| Platforms as a list on the entry | No place for format, version, purchase date or sync data. The reference app's `played_on` shows where this ends. |
| Always collapse to IGDB's oldest ancestor | Wrong for remakes, wrong when I only own the remaster, and IGDB's relations are not reliable enough to apply unattended |
| One copy per platform with a "both" format | A disc and a download bought years apart need separate dates and separate sync links |

## Not decided here

- **Compilations.** A box holding several games (a trilogy collection) is added as one entry
  for now. Splitting it into its games, with one copy shared between entries, is left open.
- **Merging two existing entries, and splitting one.** Both are only row moves in this model.
  The first build offers the choice at the moment of adding; the merge and split screens come
  later.
- **DLC and expansions** are not tracked. Standalone expansions count as games.
- **Replays.** One completion date per entry for now. A playthrough table can be added later
  without touching `entries`.
