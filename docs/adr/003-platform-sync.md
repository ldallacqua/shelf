# ADR 003: Syncing owned games from Steam, PlayStation, Xbox and Nintendo

- **Status:** accepted, 14 Oct 2026, with the proposals in its last section
- **Date:** 14 Oct 2026
- **Decides:** how a game reported by a store or a console becomes the right copy of the right
  entry, for each of the four sources, and what a sync may and may not change

## Context

The owner wants the library to fill itself from Steam, PlayStation, Xbox and Nintendo, with
every game landing on the right IGDB record. ADR 001 already decided the shape of the answer:
one entry per game, a copy per platform and format, and sync data hanging off the copy. What it
left open is the hard part: **how to know which game a store means.**

**What the reference app did.** It synced Steam and PlayStation, and stopped there
(`myspot-gg/platform`, read on 14 Oct 2026). Its resolver had two rungs: a remembered link
from a store id to a catalog game, and IGDB's own table of store ids. A game neither rung knew
was dropped ("No matching games were found"). That works where IGDB holds the store's id. It
cannot work for Nintendo, and it was never tried for Xbox, because the app had no way to read
an Xbox or Nintendo library at all.

**What IGDB holds.** Each IGDB record lists ids from other stores (`external_games`). Checked
against the live API on 14 Oct 2026, IGDB knows 22 sources. The ones that matter here:

| IGDB source | What the id is | Example |
| --- | --- | --- |
| 1 Steam | The Steam app id | `750920` (Shadow of the Tomb Raider) |
| 36 PlayStation Store US | The store's concept id, the same id PlayStation's played-games list reports | `10019998`, from `store.playstation.com/en-us/concept/10019998` |
| 11 Microsoft | The Microsoft Store product id for current games; `xbox360` and a Marketplace id for older ones | `9NDQZV4SZZ2F` |
| 31 Xbox Marketplace | The Xbox 360 Marketplace id, which ends in the game's Xbox 360 title id | `66acd000-77fe-1000-9115-d8025454082b`: Red Dead Redemption, title id `5454082B` |
| 54 Xbox Game Pass Ultimate Cloud | A Microsoft Store product id | `9N431PX143P8` |
| 5 GOG, 26 Epic Games Store | Their own product ids | |

**There is no Nintendo source.** None of the 22 is a Nintendo store, and a Nintendo game's
record carries no store id (The Legend of Zelda: Link's Awakening has none).

In the sample library of 232 games, IGDB has a Steam id for 121, a Microsoft Store id for 106
and a PlayStation Store id for 102 (`fixtures/igdb/games.json`, which keeps sources 1, 5, 11,
26 and 36).

**What each source can tell us.**

| Source | How it is read | What it reports | Owned or played |
| --- | --- | --- | --- |
| Steam | The official Steam Web API (`IPlayerService/GetOwnedGames`), with an API key and the owner's Steam id. The profile's game details must be public. | App id, name, minutes played | **Owned**, digital, PC |
| PlayStation | No official API. The owner's own sign-in token (NPSSO) and the endpoints the PlayStation app uses, as the reference app did. | Played games on PS4 and PS5: concept id, title id, name, PS4 or PS5, time played. Older systems appear only in the trophy list, by name. | **Played.** A disc, a download and a PlayStation Plus game look the same. |
| Xbox | Xbox Live's title history (TitleHub), through a Microsoft sign-in the owner grants, or a hosted service such as OpenXBL. | Title id, name, the devices it was played on, last played, whether it is on Game Pass; a `productId` decoration exists | **Played.** A disc, a download and Game Pass look the same. |
| Nintendo | Nothing. There is no API for a library, and play history is shown only in Nintendo's own apps. | | |

## Decision

### 1. One resolver, a ladder of four rungs

Everything that names a game from outside goes through the same resolver: a sync, an import,
and adding a game by hand at step 7. It tries each rung in order and stops at the first that
answers.

| Rung | Asks | Answers when |
| --- | --- | --- |
| 1. Remembered | Has this store id been decided before? | Always, once decided. Includes "not a game" and "not mine". |
| 2. Store id | Does an IGDB record carry this id for this source? | The id is in IGDB. Exact. |
| 3. Title | IGDB search for the title, on that platform, near that year | Exactly one candidate has the same title once both are normalized (marks, edition words and platform suffixes removed), is on that platform, and agrees on the year where the source gives one. Otherwise it does not answer. |
| 4. Me | The candidates, shown to the owner | Always. The answer is stored as rung 1. |

A record found on rung 2 or 3 is turned into an entry by ADR 001's rules: through
`entry_versions` if it is already linked; otherwise its lineage is walked, so a store id that
names "Spider-Man: Game of the Year Edition" lands on the Spider-Man entry; otherwise a new
entry is proposed. **A sync never creates a second entry for a game already on the shelf**,
because every path to an entry goes through the record's family.

Rung 3 is deliberately strict. A wrong match puts the wrong game on the shelf with my hours on
it, which is worse than asking. The bar can be lowered later, with numbers from real syncs to
justify it.

### 2. What an item becomes depends on what the source knows

- **Owned** (Steam): a copy is made at once: PC, digital, with the source's playtime on it.
- **Played** (PlayStation, Xbox): the game is matched, but the copy waits for one answer from
  the owner: disc, download, subscription, or not mine. The answer is remembered for that item.
  The platform comes from the source: PS4 or PS5 from PlayStation's own category; for Xbox, the
  devices it was played on.
- **Neither** (Nintendo): an import, below.

A subscription game is a copy marked as a subscription, the attribute ADR 001 reserved. It is
on the shelf for as long as I say, and it is never counted as owned.

### 3. The sync's memory is one table

```text
source_items   source, store_id            (together unique)
               title, platform_id, year     (as the source gave them)
               evidence: owned | played
               minutes, last_played_at, last_seen_at
               game_id (nullable)           the IGDB record it resolved to
               resolved_by: store_id | title | owner
               decision: copy | not_mine | not_a_game | pending
               copy_id (nullable)           the copy it feeds
```

This replaces ADR 001's sketch of `copy_links`: an item can be decided before it has a copy, or
decided as "not a game" and never have one. Playtime from a source is a `play_time` row with
that source and that copy, so it never overwrites what I typed.

### 4. Per source

| Source | Matching | First version |
| --- | --- | --- |
| **Steam** | Rung 2 for almost everything; rung 3 for what IGDB lacks | Owned games and playtime. The wishlist (`IWishlistService`) can follow. |
| **PlayStation** | Rung 2 by concept id for PS4 and PS5; rung 3 for PS3 and Vita, which arrive by name from the trophy list | Played games, playtime, the format question |
| **Xbox** | Rung 2 by Microsoft Store product id for Xbox One, Series and PC titles, if the title history's `productId` decoration carries it (to confirm first). Xbox 360 by title id: its Marketplace id is `66acd000-77fe-1000-9115-d802` followed by the title id in hex, which IGDB holds under source 31 (seen on every sample checked; to confirm on my own history). Original Xbox titles by rung 3. | Played games, the format question. Starts with a one-day spike against my account to settle access and the two confirmations. |
| **Nintendo** | Rung 3 at best, and every match confirmed: there are no store ids to trust | An import: paste a list of titles (from the eShop's purchase history, or typed), pick the platform, confirm each match. Physical cartridges come in the same way, or by hand. |

PC games from GOG and Epic have ids in IGDB too (38 and 53 of the sample), but neither offers
an official library API for a person's own use. They can come in through the same import as Nintendo, and
match on rung 2 if a file gives their ids.

### 5. What a sync may change, and what it never does

**May:** add `source_items`; add copies for owned games and for played games once I answer;
update a source's playtime and last-played date on the copy it feeds.

**Never:** change status, rating, notes, tags or dates I set; delete a copy or an entry (a game
no longer reported is marked "not seen in Steam since 2 May" for me to decide); match below the
bar of rung 3 without asking; write anywhere but through `src/server/library/store.ts`, in one
transaction that raises the library's version, like every other write.

### 6. Accounts, secrets and when it runs

- Steam's key and id, PlayStation's NPSSO and the Xbox sign-in are settings on the server, by
  the rules in `AGENTS.md`: never in the browser, never in a commit, pasted into Vercel by the
  owner. Short-lived tokens they produce are kept in the database, as the IGDB token is.
- A sync runs when I press "Sync now", and once a day with the daily refresh (step 9). Vercel's
  free plan runs a scheduled job once a day, which is enough.
- **Tests never talk to Steam, PlayStation or Xbox**, as they never talk to IGDB. Each adapter
  is tested against recorded answers in `fixtures/`, behind the same closed network.

## Worked examples

- **Shadow of the Tomb Raider, PS4 disc already on the shelf; bought on Steam.** Steam reports
  app 750920. Rung 2: IGDB record 37777. It is linked to the entry, so the entry gains a copy:
  PC, digital, with Steam's hours. One entry, two copies: a box on the PS4 shelf and one on the
  PC shelf, counted once.
- **Gran Turismo 7, played from a disc on PS5.** PlayStation reports concept id 10000956 and
  "PS5". Rung 2 finds record 101006 and its entry. The sync asks once: disc. A PS5 physical
  copy is made, with PlayStation's hours.
- **Spider-Man's Game of the Year Edition, bought on PlayStation; the base game is on the
  shelf.** The concept id resolves to the edition's record, whose lineage leads to the linked
  base game. Same entry, a new copy naming the edition.
- **Red Dead Redemption on Xbox 360.** The title history reports title id 1414793259, which is
  `5454082B` in hex. Rung 2 finds `66acd000-77fe-1000-9115-d8025454082b` under source 31.
- **The Legend of Zelda: Link's Awakening on Switch.** Imported by name on Switch. Rung 3 finds
  one Switch record with that title, the 2019 remake, and it is shown to me to confirm, as every
  Nintendo match is. The 1993 Game Boy original is not a candidate: wrong platform.
- **A media app the console counts as played.** No record matches. I mark it "not a game"
  once, and it is never asked about again.
- **A Game Pass game played on Series X.** Matched by product id. I answer "subscription": a
  Series copy marked as a subscription, never counted as owned.

## Consequences

**Good**

- Steam is exact and needs nothing from me after the first sync. PlayStation and modern Xbox
  are exact too, apart from one question per game about how I own it.
- Adding a game by hand (step 7) and syncing share one resolver, so they can never disagree
  about which entry a game belongs to.
- Every decision I make is kept, so a resync asks nothing it has asked before.
- ADR 001's tables stay as they are: one table is added, `play_time` gains sources, and
  `copies` gains the subscription mark ADR 001 reserved.

**Costs**

- PlayStation and Xbox are read through endpoints made for their own apps. They can change
  without warning, and using them may sit outside those services' terms. Read only, and for my
  own account, but a sync can break and need fixing.
- The first sync of a large PlayStation or Xbox history asks a question per game. The answer
  can be given to many at once ("all of these are downloads").
- Nintendo is an import, not a sync, until Nintendo offers something.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| Drop what IGDB's store ids do not match (the reference app) | Leaves out Nintendo entirely, PS3 and Vita, and anything IGDB has not linked |
| Match by title without asking | Wrong boxes with my hours on them. Titles repeat across remakes, ports and editions. |
| Treat every played game as owned | A disc, a download and a subscription look the same to PlayStation and Xbox. ADR 001 exists so that a copy means something. |
| A library aggregator as the source (Playnite and similar) | A desktop app on one computer, not a service a website can read on a schedule. An export from one could still feed the import. |
| Scraping Nintendo's account pages | Needs my Nintendo password on the server, and breaks whenever a page changes |

## Settled at approval

The owner approved this record as proposed on 14 Oct 2026, so its three open questions take
the proposed answers:

1. **Where it goes in the plan:** its own step right after step 7, which builds sign-in and
   the resolver's rungs 3 and 4 for adding games by hand. Sources in order of certainty:
   Steam, then PlayStation, then Xbox after its spike, then the Nintendo import.
2. **How Xbox is read:** the spike decides, between a Microsoft sign-in through an app
   registered for Shelf (no third party, more to set up) and OpenXBL (a key and done, but a
   third party sees the token and its free tier is limited). The leaning is the first.
3. **Subscriptions on the shelf:** shown, marked, not counted as owned.
