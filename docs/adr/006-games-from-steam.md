# ADR 006: Games IGDB does not have, read from Steam by a moderator

- **Status:** accepted, 1 Nov 2026
- **Date:** 1 Nov 2026
- **Decides:** how a game IGDB does not have gets onto a shelf, who may do it, and what is kept of it.
  Amended the same day by decision 13: a sync reads such a game for itself

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
8. **Screenshots for adults are blurred, behind an eye.** Descriptor 3 (adult only sexual content) or 4
   (frequent nudity or sexual content) gives a game IGDB's theme Erotic, so spec 3.13's switch hides it; 3
   also counts as Adults Only. Steam lists a game's screenshots for anyone apart from those it keeps for
   adults, and the second kind are stored marked `mature`, on any game. First this took only the first kind.
   The owner, the same day, of a game left with none: "pode trazer as imagens adultas tbm. So borra elas ou
   coloca um aviso do olhinho que são +18". So a page draws them blurred, by a CSS rule and not a script, so
   none is seen sharp while it starts, under an eye and "+18"; pressing one shows that game's. Until then the
   viewer does not hold them, so a swipe can't arrive at one. **Nothing else takes them:** not the public API
   nor an assistant, which could blur nothing; not a link's preview or structured data; not a backdrop. A
   game for adults did at first have no art behind its cover, because
   [Valve holds capsules to PG-13](https://partner.steamgames.com/doc/store/assets/rules) and says nothing of
   the rest. The owner, the same day: "notei que ta faltando banner nos 2 jogos [...] seria legal por." So its
   library art is its backdrop, dimmed and unblurred, as on any game, and marked `mature`, which keeps it
   from the public API; a link's preview takes only a cover. It may show what a cover may not, and a
   visitor sees it without pressing anything; "Hide adult games" takes it off a device. Shelf's pages are public, and [Vercel's policy](https://vercel.com/legal/acceptable-use-policy)
   bars "offensive, obscene, graphic or violent" content: the files stay on Steam's servers, and only their
   paths are here. A visitor's browser does fetch the blurred file from Steam; anyone reading the page's
   source could open it. Valve documents no descriptor: their meaning was read from the store's answers for
   games whose content is known, and from
   [what others have found](https://fredericksen.substack.com/p/steam-video-game-ratings-and-mature).
9. **Companies by name.** Steam gives names, IGDB ids. A name IGDB has already given, by its slug, takes
   that id, so a filter finds both; another takes an id from a billion up, past any of IGDB's.
10. **A release's day in Seattle's time.** Steam's number, read as UTC, was a day late on four of ten games
    checked; read in Pacific time it matched the store's page on all ten.

11. **A sync recognizes these games by their app,** before IGDB's rungs, so a title can't take one for
    another game. A game on my shelf gets the copy and the hours, and keeps what I set, a wishlist status
    too, as a game from IGDB does (spec 7.5); otherwise it starts as any game a sync adds. A game a moderator
    adds after the source listed it is found at the next sync, on every shelf linked to Steam. That is what
    gives one achievements: they are read for what a sync put on a copy. `GetOwnedGames` also answers for
    only the apps it is asked about (`appids_filter`, read from what it answers: Valve lists the parameter
    and says little of it), so a game just closed, or just off the wishlist, is synced by itself (spec 4.4).
12. **Pasting a game's link again brings it up to date with its page,** all but its title, address and
    companies, for a moderator, and raises the version of every shelf that has it.
13. **A sync reads a game from Steam by itself.** The owner, the same day, of the list of games a sync
    could not match: "se o jogo ja veio da steam, ja tem id tudo. Da pra vc pegar os dados da steam e adicionar
    o game você mesmo? [...] nem moderador nem usuário precisa fazer nada". What the moderator guarded against
    is anyone putting anything in the catalog every shelf shares. Here Steam vouches that the account owns
    the app, through a sign-in nobody can make up, and its store that the app is a game. So when IGDB's
    rungs find nothing for an app, its store page is read, and it is stored as in decision 4 and placed as in
    decision 11. One row for an app, however many lists have it: a later list takes that row and its title.
    A moderator is still what adds a game **nobody's list vouches for**, as for a wishlist. An app with no
    store page, or that is not a game, still waits for an answer, and its page is read again after a week.
    **An adult game comes in private** (spec 11.1): nobody chose to show it, and the moment "Not mine" gave
    to keep it off a public shelf is gone. The owner can turn that off game by game.

## Consequences

- A game's data can age: nothing refreshes it by itself yet. Steam may also move an image, whose path carries
  a hash. Until then a moderator pastes the link again.
- A game IGDB has under a name no rung takes (no looser matching, on purpose) now comes in from Steam rather
  than asking. It stands apart from IGDB's record of it, so a copy on another console makes a second game. That
  is the price of nobody being asked.
- A game kept only by being on shelves: removed from the last one, its row goes, as an IGDB record's does,
  and with it the title a moderator gave it. Undo brings it back.
- Rating, length, franchise and videos stay empty. Steam's reviews are not IGDB's rating and are not shown
  as if they were; its trailers are not on YouTube, the only videos a page plays.
- Built in steps. First: the flag, adding from a link, and the game's page. Second: a sync recognizing one,
  and screenshots for adults. Next: anyone finding these games in the search. Then: refreshing them by
  themselves, and checking Play and the hours on them.
