# ADR 006: Games IGDB does not have, read from Steam by a moderator

- **Status:** accepted, 1 Nov 2026
- **Date:** 1 Nov 2026
- **Decides:** how a game IGDB does not have gets onto a shelf, who may do it, and what is kept of it

## Context

The owner, on 1 Nov 2026, of a game on Steam that IGDB removed: "devemos deixar as pessoas
adicionarem ao nosso banco de dados. Claro que a gente não quer que todo mundo possa fazer isso.
Então sei la pode ser alguma flag no banco de moderador [...] Se possivel colar o link da steam da
pagina do jogo e a gente ja conseguir puxar o maximo de informação da steam".

[IGDB's content policy](https://www.igdb.com/content-policy) lists what it removes, and IGDB says
nothing per game. Backloggd, which also reads IGDB, [has the same gap](https://backloggd.com/about/adult-games).

## Decisions

1. **A flag, set from a terminal.** `users.moderator`, set by `pnpm account:moderator <handle>`. Nothing
   on the site changes it, as with `refresh_all`. `forModerator` asks the database on every request,
   after `requireAccount`, so nothing a browser sends or remembers counts.
2. **The store's `IStoreBrowseService/GetItems`, not `appdetails`.** One question answers it all, with
   a date as a number and the screenshots for anyone apart from those for adults. It is on the Web API,
   where [Valve's terms](https://steamcommunity.com/dev/apiterms) allow 100,000 calls a day, and the sync
   already asks it what kind each app is. `appdetails` is held to [about 200 requests per 5 minutes](https://github.com/GoFurry/steam-go/wiki/Rate-Limiting-Strategy) by what
   people have measured, and sends its date as words. Neither is documented by Valve.
3. **Only the app's number leaves what was pasted.** The address is never fetched, so a link can't
   send the server anywhere. The form sends the app and at most a title; everything else is read from
   Steam again when the game is added.
4. **A row in `games`, with no `igdb_id`.** The column has allowed that since the start. A made-up IGDB
   id would be quicker, and would be asked about at IGDB, and folded into families, for ever.
   `steam_app_id` marks these rows, unique, so a game stands once. The daily refresh already passes over
   a row with no IGDB id.
5. **A game IGDB has is never added this way.** Its link searches for it instead.
6. **An address that carries the app:** `{title}-steam-{app}`. A plain `{title}` could be the slug IGDB
   gives a game of that name one day, and `games.slug` is unique, so that game could then not be added
   by anyone.
7. **Images stay on Steam's servers,** as IGDB's stay on IGDB's, and an image's id is its path there,
   so every place that draws one goes on calling `imageUrl`. Those servers resize nothing: a cover is
   one or two files, and `@2x` on its id says whether there is a second, because a game with only one
   would otherwise fail on a sharp screen. They answer any origin, as the 3D shelf's textures need, and
   the site's policy already allowed them for achievements. Valve grants no licence for this that I could
   find; nor does its [subscriber agreement](https://store.steampowered.com/subscriber_agreement/)
   mention it. Worth a lawyer's reading before Shelf is more than a proof of concept.
8. **A game for adults keeps only its cover.** Descriptor 3 (adult only sexual content) or 4 (frequent
   nudity or sexual content) gives it IGDB's theme Erotic, so spec 3.13's switch hides it; 3 also counts as
   Adults Only. [Valve holds every capsule to PG-13](https://partner.steamgames.com/doc/store/assets/rules)
   and says nothing of other art, so no backdrop. On every game, only `all_ages_screenshots` are read.
   Shelf's pages are public, and [Vercel's policy](https://vercel.com/legal/acceptable-use-policy)
   bars "offensive, obscene, graphic or violent" content; nothing of these games is hosted here but words.
   Valve documents no descriptor: their meaning was read from the store's answers for games whose content
   is known, and from [what others have found](https://fredericksen.substack.com/p/steam-video-game-ratings-and-mature).
9. **Companies by name.** Steam gives names, IGDB ids. A name IGDB has already given, by its slug, takes
   that id, so a filter finds both; another takes an id from a billion up, past any of IGDB's.
10. **A release's day in Seattle's time.** Steam's number, read as UTC, was a day late on four of ten games
    checked; read in Pacific time it matched the store's page on all ten.

## Consequences

- A game's data can age: nothing refreshes it yet. Steam may also move an image, whose path carries a hash.
- A game kept only by being on shelves: removed from the last one, its row goes, as an IGDB record's does,
  and with it the title a moderator gave it. Undo brings it back.
- Rating, length, franchise and videos stay empty. Steam's reviews are not IGDB's rating and are not shown
  as if they were; its trailers are not on YouTube, the only videos a page plays.
- Built in three steps. This one: the flag, adding from a link, and the game's page. Next: anyone finding
  these games in the search, and a sync recognizing one. Then: refreshing them, and checking Play, the
  hours and achievements on them.
