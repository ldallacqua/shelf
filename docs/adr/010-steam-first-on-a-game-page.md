# ADR 010: A game's store page on Steam before IGDB's record

- **Status:** accepted, 10 Nov 2026
- **Date:** 10 Nov 2026
- **Decides:** where a game's cover, screenshots, art and summary come from when it has a page on Steam's
  store. Amends [ADR 006](006-games-from-steam.md), which read Steam only for a game IGDB does not have.
- **Issue:** #192

## Context

Every game IGDB has was drawn from IGDB alone. IGDB's [content policy](https://www.igdb.com/content-policy)
keeps adult images off its servers, so games for adults were drawn worse than those read from Steam: a game in
the owner's library has one screenshot on IGDB and many on Steam. Steam's capsules and heroes are also usually
sharper and more recent than IGDB's copies.

The owner, on 10 Nov 2026: "I want steam to be the main source of truth for everything we show up in the page
up to the point where we don't have the data [...] use igdb only to backfill the things steam can't provide us
in the game details such as videos. I don't think we should change search and those things."

## Decisions

1. **Steam first, field by field.** For a game with a page on the store: its library capsule as the cover, its
   library hero as the art behind the cover, its screenshots instead of IGDB's, and its short description as the
   summary. A field the store leaves empty keeps IGDB's (`steamFirst` in `domain/library/game-page.ts`). IGDB
   stays the only source of videos (Steam's trailers aren't on YouTube, the only videos a page plays), the
   storyline, the time to beat, the releases on each platform, the rating, and the title, address and filter
   values, which are the library's and not the page's.
2. **The cover everywhere but search.** The owner, the same day. A cover isn't only on the page: it is in the
   library file, and the page's cover grows from the box on the shelf (`morph.ts`). Taken on the page alone, the
   image would change halfway through that transition. So the shelf, the wall, the list, the 3D shelf, the
   editor and the page all draw Steam's (`drawnCover` in `server/library/read.ts`), its colors and blur read from
   it. Search and Add a game keep IGDB's: they show IGDB's results.
3. **Kept apart from IGDB's record.** `steam_cover`, `steam_colors`, `steam_thumbhash` and `steam_page` on
   `games`, beside IGDB's columns, and laid over them as they are read. IGDB's refresh and Steam's reading never
   overwrite each other, and taking Steam's away puts IGDB's back as it was.
4. **One app for the catalog.** A game's apps are those IGDB lists, then its Steam store links
   (`steamAppsOf`); its page is the first the store shows as a game, not a soundtrack or a DLC. The row is
   every shelf's, so which app I bought doesn't choose it.
5. **Read after an add, and daily.** Once the answer to an add, or to a sync's last step, has gone
   (`askSteamAfterAdding`, as for the scores), the games never read are read. Then once a day, beside IGDB's
   refresh (`/api/cron/refresh`): those never read first, then the longest unread, a hundred apps to a question,
   for at most two minutes. Never because someone opened a page. A new cover's colors and blur are read from it,
   eight at a time; one that can't be read keeps IGDB's colors under it. A question that fails costs only its own
   games, which keep what they have and are read first next time. Only a cover or page that changed gives the
   shelves holding the game a new version.
6. **No page, IGDB's record.** A page the store no longer has, or one with nothing to show, leaves the game as
   IGDB has it.
7. **Games for adults, as ADR 006 decision 8 says.** A screenshot Steam keeps for adults is marked `mature` and
   drawn blurred behind the eye; the hero of a game for adults is marked and stands dimmed behind the cover; neither
   leaves through the public API, an assistant, structured data or a link's preview. A game the store marks for
   adults (descriptor 3 or 4) is adult on a shelf whatever IGDB says (spec 3.13), so "Hide adult games" takes it
   and its art off a device.
8. **A game IGDB doesn't have is read again too** (amended 11 Nov 2026, it first was not). Its row was read whole
   from the store (ADR 006); reading its page beside the others gives it a banner and keeps it current, and what is
   laid over its row is its own store's. A **capsule the store made up** from its header, for a game whose makers
   gave none (`portrait.png`, with no larger file and no library hero), is no cover for a game IGDB has: IGDB's goes
   before it. For a game only Steam has, it stays, as nothing better is there. The owner, on 11 Nov 2026: "some
   games on steam have a banner like image instead of a full 2:3 [...] we use igdb instead only for those".
10. **The banner** (amended 11 Nov 2026): a game's store header, 460 by 215 with its name drawn in, kept in
    `steam_banner` and carried in the library file for the banner view (spec 3.8). A game not on Steam takes IGDB's
    key art, then any art, then a screenshot for anyone, never one kept for adults.
9. **Not taken:** the store's long description, which is HTML and often a sales pitch, and would need making
   plain first; its trailers; and its pages in Brazilian Portuguese (`brazilian`), which would give the summary in
   the visitor's language. Each can follow on its own.

## Consequences

- Most covers on a shelf synced from Steam are now 2:3, where IGDB's are 3:4. The wall cropped every cover to 3:4
  until issue #193, which made its frame 2:3 and draws any other cover whole inside it (spec 3.8).
- A cover read from Steam has its path as its id, so the library file grows by about fifty bytes a game.
- Visitors' browsers fetch more from Steam's image servers. ADR 006 decision 7's note on Valve's licence applies to
  more of the site.
- Those servers send JPEG at fixed sizes, where IGDB's resize and send WebP: the same game's cover is two and a half
  to three times the bytes (64 KB against 25 at the smaller size, 205 against 70 at the larger, medians measured on
  11 Nov 2026). Each file is offered at its own width, so a browser takes the smaller wherever it is enough, and pages
  connect to Steam's servers early. Making them lighter still would mean converting them somewhere of Shelf's own.
- The scores and the pages are two `GetItems` readings a day, where one question could ask for both. They are kept
  apart so that each fails alone, and each can be asked about games the other wasn't.
