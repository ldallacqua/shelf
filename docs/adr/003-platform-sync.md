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

## Built: Steam (23 Oct 2026)

The owner asked for sync after step 9, Steam first and Nintendo next ("the most important ones
are Steam and Nintendo since they are the platforms I use"), with the architecture ready for
all four. Accounts had come since this record ([ADR 004](004-one-library-per-account.md)), so
a link and its memory are an account's, like everything else that is someone's. What
building settled:

- **One account links its own Steam account, through Steam's own sign-in** (OpenID 2.0, the
  "Sign in through Steam" Valve offers). Steam vouches for the SteamID64; Shelf never sees a
  Steam password, and nobody can link someone else's Steam to their shelf by typing a profile
  address. The round trip is tied to the browser that started it by a random value in a
  cookie, and to the account by its session; Steam answers each sign-in's check once.
- **Shelf has one Steam Web API key** (`STEAM_API_KEY`, the owner's to paste), which reads the
  owned games of whichever account signed in. No per-account secret exists for Steam.
- **The memory is two tables:** `platform_links` (an account's link per source: its id and
  name there, daily or not, when it was read and synced, and what went wrong) and
  `source_items` (decision 3, with the account's id, and the IGDB id it matched rather than a
  `games` row, which exists only once the game is on the shelf).
- **A fifth decision, `removed`.** Taking a synced copy off the shelf marks its items removed,
  so the next sync does not put the game back. Undo of the removal puts them back to feeding
  the copy. Disconnecting forgets the link and the items; the games stay, with their hours.
- **Rung 2 picks among several records** carrying one store id: the game over an edition of
  it, a game over a bundle; anything still undecided goes to rung 3, then to me. When IGDB
  files a store id under one add-on alone (FreshWomen's second season is a DLC there, an app
  on Steam), the add-on is the game: a store lists what I launch, with its own hours.
- **Before the ladder, the store says what each item is** (`kind` on the item, asked once;
  Steam's `IStoreBrowseService/GetItems`, a hundred apps to a request). A demo, a playtest,
  software or a video or soundtrack is left out by itself as "not a game", before anything
  can match it: playing a demo is not owning the game. A mode the store lists apart from its
  game (Modern Warfare 2's multiplayer) names that game, and rung 2 matches it by the game's
  id, so its hours join the game's copy. A mode's page that names no game (Black Ops II's
  zombies) joins the item I own whose whole title starts its own, before a dash or a colon;
  with none, it is a game like any other. A playtest has no store page; its name says what it
  is. The store is asked on the step that reads the list, the only one that brings new items:
  when it does not answer, the ladder goes on without it and the next read asks again, so an
  outage costs one wait a sync, not one a step. "Ask again" on what it left out is kept: the
  store is not asked twice. Found on the owner's first sync (23 Oct 2026), where most of what
  needed an answer was software, demos, playtests and modes, and games IGDB does not have;
  migration 0009 asked once more about the games nothing had matched, for the modes.
- **Rung 3 asks the title as written, then stripped** of marks, edition words ("Game of the
  Year Edition", "Director's Cut", "Deluxe Edition" but not "Deluxe" alone) and platform
  suffixes, and answers only for exactly one candidate on the source's platforms. A title it
  could not match is asked about again after a week, as IGDB grows.
- **A game new to the shelf starts unsorted**, or as playing if the source saw it played in
  the last 14 days, Steam's own window. Nothing a sync does changes a status afterwards.
  (Built first as the backlog; the owner, after the first real sync: "they are actually in a
  waiting state, or unassigned state". `unsorted` is a sixth status, last in the list, and
  migration 0008 moved the games a sync had put in the backlog, untouched since, to it.
  Placing them, with a rating, is a page of its own, `/account/unsorted` (spec 4.5): each
  platform's card says how many of its games wait there.)
- **Hours:** a source's minutes are a `play_time` row of that source on the copy, summed over
  the items feeding it. A game shows the larger of what I typed and what its sources report
  together, never the sum, so a figure typed before linking is not counted twice.
- **Steps.** A sync is steps of at most twenty games put on the shelf, each one request, so a
  large library never outlasts a function; the page asks for steps until none is left. A
  second daily job (`/api/cron/sync`) runs every link that asks for it, longest unsynced
  first, within four minutes. Asked twice inside a minute, Steam is read once. Each account
  may put 2,000 games an hour on its shelf by syncing, and read its source 60 times.
- **Steam's terms** ask a site that keeps Steam data to say what it keeps: the privacy page
  (`/privacy`) says it, and is linked from the footer and from the Steam card. Valve asks for
  its own sign-in button, which is served from Shelf (`public/platforms/`).
- **Nintendo was parked** (the owner, 23 Oct 2026), to look first at how other sites read a
  Nintendo account, Exophase from a friend code among them; then built, below.
- **Everything that differs per source** is in `domain/sync/sources.ts` (what it can tell)
  and its adapter in `server/sync/` (how to ask it). PlayStation, Xbox and Nintendo are listed
  there already, not ready; the database's checks accept all four, so adding one needs no
  migration of those tables.

## Built: Nintendo (24 Oct 2026)

Decision 4 planned Nintendo as an import, because Nintendo offered nothing to read. Since late
2025 it does, for its own apps: the Nintendo Store app shows every game played on the account,
with the time played and when it was first and last played. The owner chose that over the
friend code (24 Oct 2026): "Build Nintendo from the Store app's play history: I sign in on
Nintendo's own page and Shelf keeps the session token, encrypted." What building settled:

- **Not the friend code.** Exophase links a Switch by its friend code alone. It reads the
  profile's play activity, which the person must set to be seen by everyone, through the
  Nintendo Switch app's private API, from a Nintendo account of its own, with an outside
  service signing that app in. That list is capped and can be cleared, and it is no sign-in:
  anyone could type someone else's code. The play history is the whole list, and the person
  signs in.
- **Shelf signs in as the Nintendo Store app does** (client id `5c38e31cd085304b`, PKCE), as
  the community script [ns-play-history](https://github.com/sibylsea-hub/ns-play-history)
  does, read 24 Oct 2026. Nintendo's page says the account is linked to "Nintendo Store". Its
  answer goes to an address only that app opens, so it never comes back to Shelf by itself:
  the person copies the link of the page's "Select this account" button and pastes it into
  the account page. The round trip's state and secret wait in a cookie only this browser
  sends back (`shelf_nintendo_trip`, fifteen minutes), so a link from another sign-in links
  nothing.
- **The session is kept sealed.** The link's code becomes a session of about two years; each
  read trades it for a token of fifteen minutes and asks for the play history. The session is
  the one secret a link holds (`platform_links.secret`, migration 0010), sealed with
  AES-256-GCM under `PLATFORM_TOKEN_KEY` and bound to the account and the source, so the
  database alone opens nothing and a sealed value moved to another link opens nowhere. When
  Nintendo ends the session, or the key changes, the link says `signed-out` and the card asks
  to sign in on Nintendo's page again; that keeps every answer. Of what Nintendo says about
  the account, only its id and nickname are read.
- **Nintendo is "played", as decision 2 has it for PlayStation and Xbox.** A cartridge and a
  download look the same in the play history. Every game is matched by title (rung 3, on the
  consoles that play it), and every match waits for me, as decision 4 asks: the list shows
  the game Shelf took it for, with **Cartridge**, **Download**, **Not this game** and **Not
  mine**, and one answer for every match at once ("all of these are downloads"). A game I
  find myself becomes the match, and waits the same way. Nothing goes on the shelf before.
- **One game, whatever the console.** The play history has an entry per game per console;
  they are one item, by Nintendo's title id, with the minutes summed. A console plays the
  games of the one before it (`plays` in `domain/sync/sources.ts`): a game played on a
  Switch 2 is searched for on the Switch too, and its copy goes on the Switch when its record
  is a Switch game, on the Switch 2 when it is a Switch 2 game only.
- **Nintendo's names, as IGDB writes them** (added 24 Oct 2026, after the owner's first
  link left 14 of 38 games unmatched). IGDB finds a name only as written, so the title rung
  asks for each spelling (`spellingsOf` in `domain/sync/titles.ts`): as the source wrote it,
  and with each dash between words as a hyphen or a colon. Nintendo writes "Breath of the
  Wild – Nintendo Switch 2 Edition" where IGDB has "- Nintendo Switch 2 Edition". The
  console Nintendo names at the end ("Nintendo Switch 2 Edition", with what comes bundled
  after a "+", and "for Nintendo Switch") is a platform suffix, left out when the title is
  stripped. **A Switch 2 Edition is its own record where IGDB keeps one**, the owner's
  choice: a shelf can hold a game on the Switch 2 and on the PC. Its copy then goes on the
  Switch 2. Where IGDB keeps none, it is the game itself. Migration 0011 has the next sync
  look again at every title nothing matched.
- **A name IGDB punctuates otherwise** (added 25 Oct 2026). Nintendo wrote "DEAD OR ALIVE
  Xtreme 3 Scarlet" where IGDB has "Dead or Alive Xtreme 3: Scarlet": the same title once
  bared, but the exact lookup never brought it back. A title no spelling found is asked once
  more, last, for the names holding every one of its words (`findByWords` in
  `server/igdb/api.ts`), and the rung compares them as before. Fewer words stay mine to find:
  Nintendo's "Vampire Crawlers" is not IGDB's "Vampire Crawlers: The Turbo Wildcard from
  Vampire Survivors", the owner's choice ("não quero fazer um match de jogos errado").
  Migration 0017 has the next sync look again at every title nothing matched.
- **The games Shelf matched are listed first**, each needing only Cartridge or Download, then
  those it could not find, under a heading of their own. The card says how many wait for an
  answer; it never says "up to date" while any do.
- **A game Nintendo lists twice is one row** (the owner's ask, 24 Oct 2026). Nintendo gave
  Warframe two title ids, "Warframe for Nintendo Switch" and "Warframe", and both matched
  Warframe. The list shows the items matched to one record as one game, its hours summed and
  its other names under it; an answer goes to each item, the first making the copy and the
  rest feeding it. The card's counts are games, not items: waiting, by the record matched;
  on the shelf, by the copy. What is left out still counts by item.
- **A new game starts unsorted, or playing** if last played these two weeks, as Steam's do.
  The hours are Nintendo's row on the copy, as Steam's are.
- **Tests never talk to Nintendo.** `fixtures/nintendo/play-history.json` and the double in
  `server/mocks/nintendo.ts` answer; with the test doubles on, "Sign in on Nintendo's page"
  opens a stand-in page of Shelf's own whose button links to the made-up account.
- **What can break:** none of this is documented by Nintendo. If Nintendo changes the sign-in
  or the play history, the card says Nintendo did not answer, and the adapter
  (`server/sync/nintendo.ts`, the only code that knows Nintendo's addresses) is what changes.

## Built: achievements (28 Oct 2026)

Issue 72 asked for achievements as a feature of their own, Steam first, on a foundation the
Xbox and PlayStation tickets extend rather than repeat. What building settled:

- **A set is one provider's, for one of its games.** `achievement_sets` (id `steam:220`) and
  `achievements` are shared by every account, read once for all of them. An account's
  progress through a set is `achievement_progress`: the account at the provider it was read
  for, the copy on the shelf it belongs to, when it was read and how the last read went. Its
  unlocks are `achievement_unlocks`. Nothing is matched across providers by name, and a game
  with two Steam apps (a game and its multiplayer app) has two sets, each shown apart.
- **The games are the sync's own decisions.** A set is read for every Steam item on the shelf
  (`source_items` with a copy), so editions and matches are what the sync already decided. A
  game not on the shelf has nothing read.
- **Three questions to Steam, with the key Shelf already has:**
  - `IPlayerService/GetTopAchievementsForGames` counts, for up to a hundred games in one
    question, each one's achievements and the account's unlocked ones.
  - `IPlayerService/GetGameAchievements` gives a game's achievements in one language, with each
    one's share of Steam's players. It is read in English and in Brazilian Portuguese.
  - `ISteamUserStats/GetPlayerAchievements` gives the account's unlocks in one game, with their
    moments.

  Checked against the live API on 28 Oct 2026:
  - A game without any answers an empty `response`, a 400 "no stats" or a 403.
  - A hidden achievement is described like the others, and its artwork is a file name in the
    game's folder. The shares are text.
  - A profile whose game details are private gets an empty count from the first, and 403
    "Profile is not public" from the last.
  - The last gives the same 403 for one game on a public profile: a game the account no
    longer owns, and an odd one it owns but never launched. The count never comes back empty
    for a public profile, whatever games are in it. So the account's achievements are private
    only when the count is empty and a game says so too. On a counted account, a game's own
    403 is read as none unlocked, as Steam's count of such a game says; with no count at all,
    that game is asked again an hour later. The first version took any game's 403 for the
    whole account's, and stopped reading at it.
  - It gives the same 403, too, for every game it keeps from anonymous eyes for its content,
    on a public profile: adult games, and some mature ones. Its count lists their unlocks all
    the same, each by `statid` and `bit`, which GetGameAchievements gives as `internal_key`,
    `(statid << 8) | bit` (checked on 28 Oct 2026: 3,727 unlocks of 39 such games, every name
    agreeing). So a game whose own answer is 403 and whose count names unlocks is read from
    the count, matched to its definitions by key, with no moments, which only the game's own
    answer gives. Before, those games were asked again every hour and never read.
  - `IPlayerService/GetAchievementsProgress`, which would count without listing, refuses a Web
    API key (401), and `GetSchemaForGame` gives no shares, which would cost a third question
    for each game.

  An unlock moment of 0 is not known, never 1970. A busy or failing Steam (429, 5xx) is asked
  again twice, a second and then three seconds later, or as long as its `Retry-After` asks, up
  to five seconds.
- **In steps, after the games.** A step reads the games due, the latest played first, eight at
  a time, for 15 seconds, and then answers; the next step goes on from there. The account page
  asks for steps once the games are in, and the daily sync does the same after each link's own.
- **Counted first, asked one by one only for what the count cannot tell.** A step asks Steam
  to count the next hundred games. Then:
  - A game counted with none is read as none, with no other question.
  - One with none unlocked has every achievement locked.
  - One with as many unlocked as last read, of a set that did not change, is read as before.
  - Only a game whose list is not read yet, or that has new unlocks, is asked about on its own.
  - A game Steam does not count, or every game when the count fails, is asked about as before.

  On a public profile's hundred latest played games, read for the first time, that was 276
  questions in 20 seconds, against 398 one game at a time. Read again, it is one question, and
  one more for each game with a new unlock. The definitions are shared, so a game read for one
  account is not asked about again for the next.
- **Due:** definitions and their shares after 30 days, or as soon as Steam counts another
  number of them; progress once the game is played (by Steam's own last-played moment, never
  Shelf's clock), once its set changed, and after a week. A failure waits an hour, and the
  other games' answers stay. Each account may ask for 240 steps an hour on its asking: an
  hour of Steam's time.
- **A read replaces the last.** The unlocks are Steam's latest answer, whole, so reading twice
  counts nothing twice, and an achievement Steam takes out goes with its unlocks. One added
  after the account's last read is `unknown` until the next: no percentage and no 100% until
  every state is known. A game with no achievements is never 100%.
- **Not the library.** Like the sync's memory, these rows raise no library's version and are
  not in the library file. A game's facts say which providers have achievements for it; its
  page then asks `/api/v1/libraries/{key}/achievements/{slug}` (a public shelf's, kept a minute
  by the edge) or `/api/v1/me/achievements/{slug}` (one's own, fresh). A private game, and a
  private shelf's every game, is in neither for anyone but its account, nor in the totals.
- **Disconnecting keeps them, as a snapshot,** as it keeps the games and their hours: the page
  says they are as of the last read, and that Steam is no longer linked. Linking another Steam
  account forgets every unlock read for any other; deleting the account deletes them, with its
  copies. The definitions stay: they are Steam's, not the account's.
- **Totals for the trophy page** (issue 68) are `unlocks()` in `server/services/achievements.ts`
  and `domain/library/trophy-achievements.ts`: games with known progress, unlocked and
  available achievements, perfect games (every set with achievements complete: Shelf's own
  count, not Steam's "Perfect Games"), the latest unlocks by their real moment, and the rarest
  by Steam's rates. Nothing infers a completion, a date or a status from them, and nothing
  changes what I set.
- **Steam's artwork** is used from Steam's image servers, as IGDB's covers are from IGDB's:
  `shared.akamai.steamstatic.com/community_assets/images/apps/`, which the pages' rules allow.
  The older `cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/` answers 404 for a
  game out in 2026 (checked 29 Oct 2026), where the newer one has every game's.

**For Xbox and PlayStation.** Each becomes a provider in `achievementProviders`
(`domain/achievements/achievements.ts`), with an `AchievementSource` in
`server/services/achievements.ts`: its definitions in each language, an account's progress,
and its rates where it has them. Its sets are its own (`xbox:{title id}`,
`playstation:{communication id}`), so a game on three platforms has three sets, never one.
What only one provider has goes in columns of its own on `achievements`, added with that
adapter: Xbox's Gamerscore, PlayStation's grade (bronze to platinum) and trophy group. A
platinum is a PlayStation trophy of that grade, never inferred from a Steam set.
