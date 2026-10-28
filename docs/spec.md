# Shelf: product and UX spec

- **Status:** approved, and amended on 12 Oct 2026 by [ADR 002](adr/002-visual-direction.md).
  Written and built on 25 Oct 2026: two statuses (3.12), hiding adult games (3.13), archiving a
  game (7.4), wishing for a game on one platform (7.5), separating a version (7.6) and a game
  only I see (11.1). Written and built on 25 Oct 2026: playing a game (7.7), with the desktop
  app of [ADR 005](adr/005-desktop-app.md), all but its hours.
- **Date:** 12 Oct 2026
- **Builds on:** [research](research.md) and [ADR 001](adr/001-game-entry-model.md)

This document says what Shelf does and how it behaves. How it is built (versions, services,
hosting) is Phase 3.

**Visual direction.** This spec was written around my first recommendation, Vitrine. That
direction was built and rejected: it read as a library of books. The direction is now
**Backlit**, a game room's lit display wall, and games stand with their covers toward you.
[ADR 002](adr/002-visual-direction.md) records the change. Sections 3, 9, 13 and 14 below
have been rewritten to match; everything else is as approved.

**Lines marked "Done when"** are the acceptance checks for each feature. They become tests.

## Contents

1. [What Shelf is](#1-what-shelf-is)
2. [Pages and addresses](#2-pages-and-addresses)
3. [The library](#3-the-library)
4. [Adding games](#4-adding-games)
5. [Filters](#5-filters)
6. [Sorting](#6-sorting)
7. [Game detail](#7-game-detail)
8. [Data model](#8-data-model)
9. [Themes](#9-themes)
10. [Languages](#10-languages)
11. [Access](#11-access)
12. [Screen sizes and touch](#12-screen-sizes-and-touch)
13. [Accessibility](#13-accessibility)
14. [Motion](#14-motion)
15. [Landing page](#15-landing-page)
16. [Speed targets](#16-speed-targets)
17. [For AI assistants](#17-for-ai-assistants)
18. [Out of scope](#18-out-of-scope)
19. [Decisions I made for you](#19-decisions-i-made-for-you)

---

## 1. What Shelf is

A game library for anyone. It does two things: add games, and browse them on a shelf with
strong filters and sorting. Anyone can sign up for a shelf of their own, public or private
([ADR 004](adr/004-one-library-per-account.md)). Mine is `/u/lucas`.

**Two kinds of visitor**

| Who | Can do |
| --- | --- |
| Anyone | Browse any public shelf, open games, filter, sort, switch views, change theme and language; sign up |
| An account, signed in | All of that, plus, on its own shelf: add, edit and remove games, and save smart shelves |

**Principles**

1. **The games supply the color.** Covers are large. The interface around them is quiet.
2. **One game, one entry.** Platforms are copies of it ([ADR 001](adr/001-game-entry-model.md)).
3. **Every view shows the same library.** Shelf in 2D, shelf in 3D, wall and list share one
   order, one set of filters and one address.
4. **The address is the state.** Any filtered, sorted, grouped view can be bookmarked or sent.
5. **Motion answers an action.** Nothing moves for its own sake, and everything has a calm
   version.

---

## 2. Pages and addresses

Every address starts with the language: `/en/…` or `/pt-BR/…`. A visit to `/` goes to the
language the browser asks for.

| Address | What it is |
| --- | --- |
| `/en` | Landing page: what Shelf is, told with an example shelf ([section 15](#15-landing-page)) |
| `/en/foundations` | The design foundations, for reference: unlisted, not indexed |
| `/en/u/{handle}` | An account's library. Filters, sort, grouping and view live in the query string. |
| `/en/u/{handle}/shelves/{name}` | A saved smart shelf: the library with a stored filter, sort and grouping |
| `/en/u/{handle}/trophies` | Trophy wall: completed games and stats |
| `/en/u/{handle}/game/{slug}` | A game's page. Opened from the library, it appears over the shelf; opened directly, it is a full page. |
| `/en/sign-up` | A shelf of one's own: name, handle, email address, password, public or private |
| `/en/sign-in` | Sign-in, with an email address or handle, and a password |
| `/en/account` | One's name, handle and visibility, the platforms it syncs from ([section 4.4](#44-from-a-store-or-console)), password, sessions, and deleting the account |
| `/en/account/start` | Setting a new shelf up, where signing up leads: the platforms to bring games in from, and the way to placing them ([section 4.6](#46-setting-a-new-shelf-up)) |
| `/en/account/unsorted` | One's unsorted games, to rate and give a status, one at a time or many at once ([section 4.5](#45-placing-what-a-sync-brought-in)) |
| `/en/privacy` | What Shelf keeps about a person, where, who sees it, and how to remove it; last, whose marks Steam, Nintendo, PlayStation and Xbox are |
| `/llms.txt` | A plain-text guide to the site for AI tools |

The addresses from before accounts (`/en/library`, `/en/game/…`, `/en/shelves/…`,
`/en/trophies`) move for good to the same page under `/en/u/lucas`, query string kept.

Library query string, in full:

```text
/en/u/lucas?q=status:backlog+genre:rpg+-theme:horror
           &sort=-rating&group=platform&view=shelf
```

| Parameter | Values | Default |
| --- | --- | --- |
| `q` | A filter query ([section 5](#5-filters)) | empty: everything |
| `sort` | A sort key, `-` in front for descending ([section 6](#6-sorting)) | `title` |
| `group` | `none`, `platform`, `status`, `year` | `platform` |
| `view` | `shelf`, `wall`, `list` | `shelf` |
| `seed` | Only with `sort=random`: keeps a shuffle stable | none |

2D or 3D is **not** in the address. It is a per-device preference, and 3D is offered only with
experimental views on ([section 3.6](#36-switching-2d-and-3d)).

**Header, on every page:** the name; Library and Trophies of the shelf in the address (or,
elsewhere, one's own); a search field over it; theme switch, language switch. On the right, a
visitor's Sign in and Create your shelf, or, signed in, a menu: My shelf, Account, Sign out.
On one's own shelf, an Add button. **Footer:** credit to IGDB.com, Privacy, and the sign-in link.

**Done when**

- Loading any library address directly shows exactly the state it describes.
- Back and forward step through filter, sort, group and view changes.
- An unknown or malformed parameter falls back to its default and never shows an error page.

---

## 3. The library

### 3.1 Layout

Desktop:

```text
┌────────────────────────────────────────────────────────────┐
│ Shelf    Library   Trophies      [ Search ]   Add   ◐   PT  │
├────────────────────────────────────────────────────────────┤
│ 214 games     61 finished     2,340 hours                   │
│                                                            │
│ All  Playing  Backlog  Completed  Dropped  Wishlist        │
│ Filters 2   Group Platform   Sort Title                     │
│                                         Shelf  Wall  List  │
│ Genre: RPG  x     Not theme: Horror  x     Clear all        │
├────────────────────────────────────────────────────────────┤
│ PlayStation 4    38                                        │
│ ▮▮▮▮▯▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮                     │
│ ══════════════════════════════════════════════════         │
│ Nintendo Switch    27                                      │
│ ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮                                │
│ ══════════════════════════════════════════════════         │
└────────────────────────────────────────────────────────────┘
```

Phone:

```text
┌──────────────────────────┐
│ Shelf              ◐  PT │
│ PS4 38   Switch 27   PC  │  shelf tabs: swipe sideways
├──────────────────────────┤
│ ▮▮▮▮▮▮▮▮▮▮▮              │
│ ════════════════════     │
│ ▮▮▮▮▮▮▮▮▮▮▮              │
│ ════════════════════     │
│                          │
├──────────────────────────┤
│ Filters   Sort   View  + │  within thumb reach
└──────────────────────────┘
```

**Controls**

| Control | Does |
| --- | --- |
| Status row | One tap filters to a status. The commonest filter gets the shortest path. Unsorted is in it only while a shelf has unsorted games, and Someday and Retired only while it has a game in one (3.12). Not shown from 1536px, where the filters' column has the statuses (12). |
| Filters | Opens the filter panel. Shows how many conditions are active. Not shown from 1536px, where the panel stands beside the library (12). |
| Group | None, platform, status, year |
| Sort | The sort key and direction |
| Shelf, Wall, List | Switches view |
| 2D, 3D | Only in Shelf view, with experimental views on (3.6). Two labeled buttons, with the current one pressed. |
| Covers, Compact | The same: only in Shelf view, with experimental views on (3.6). |
| Active filter chips | One per condition, each removable, with Clear all |
| Search | Finds games in the library by title as you type. It also accepts filter syntax. |
| Stats line | Games, finished, hours. Reflects the current filter. |

### 3.2 Words used below

| Word | Means |
| --- | --- |
| **Shelf** | One group of games (a platform, a status, a year), with a label and a count |
| **Ledge** | One physical row. A long shelf wraps onto several ledges. |
| **Box** | One game as an object: a game case. Its shape and plastic color follow the platform's real case ([research, section 4](research.md#4-physical-inspiration)). |
| **Cover-out** | A box standing with its cover toward you. This is how games stand on the shelf ([ADR 002](adr/002-visual-direction.md)). |
| **Compact** | The dense option, experimental (3.6): boxes stand spine-out, so more fit on a ledge. A spine shows a platform band and the title, and is generated, because IGDB has no spine art. |
| **LED** | The light bar along the back of each ledge. Its color follows the game in focus. |

**How a box shows its state.** Never by color alone:

| State | On the shelf |
| --- | --- |
| Backlog | Stands in the row |
| Playing | Stands forward of the row, and its shelf's label carries a "playing" marker |
| Someday | Stands set back from the row, toward the wall; in 2D, a little smaller and in shade (3.12) |
| Completed | A small foil seal on the cover's corner |
| Retired | A small matte square tag on the cover's corner, with an infinity sign (3.12) |
| Dropped | Leans against its neighbor |
| Wishlist | An outlined placeholder with a faint cover, not a solid box |
| Owned only digitally | A cover with no case around it |
| Owned on more than one platform | A small count on the box's foot |

**Which box a game shows.** Grouped by platform, each copy stands on its own platform's shelf
in that platform's case. Otherwise the game shows one box: the copy I chose for display, or the
first one I added.

### 3.3 Shelf in 3D

Built to look best on a desktop. Experimental: offered only with experimental views on (3.6).

- **Scene.** A game room's display wall. Each shelf is a bay of black ledges, and the bays run
  left to right. Every ledge has an LED bar along its back edge, so the boxes in front of it
  are backlit. A label on the ledge names each shelf and its count.
- **Camera.** It travels sideways along the wall, as a visitor would walk. Scroll, trackpad,
  drag, arrow keys, Page Up, Page Down, Home and End all move it. It eases to a stop and cannot
  leave the wall.
- **Index.** A column of ticks at the edge, one per shelf. Clicking a tick takes the camera
  there. It is also the keyboard and screen-reader route between shelves.
- **Hover or focus.** The box comes toward you and glows, and its ledge's LED glides to that
  game's color. A small label gives title, platform and status.
- **Pull.** Click or Enter. The box slides out and turns to face you, the camera moves in a
  little, the wall behind dims, and the detail opens beside it. Escape or Back puts it back.
- **Detail by distance.** Far boxes show a blur of their cover's colors. Nearer ones get small
  covers. The nearest get full covers. The pulled box gets the largest.
- **When 3D cannot run.** No WebGL, a lost graphics context, or sustained low frame rate: the
  view changes to 2D and says so in one line. Nothing is lost.

### 3.4 Shelf in 2D

Built to feel best on a phone and on modest hardware. It is a design of its own, not a fallback.

- **Layout, desktop and tablet.** Shelves stack down the page. Each wraps onto as many ledges
  as the width needs. The page scrolls normally.
- **Layout, phone.** One shelf fills the screen. Swipe sideways for the next shelf; a row of
  tabs at the top shows where you are. Scroll down through that shelf's ledges.
- **Boxes.** Covers toward you, each in its platform's case: real proportions, the plastic's
  color, a band across the top. Cases differ in height and width, so the row has a real
  silhouette. In the compact option they stand spine-out instead, each spine wide enough to
  tap (at least 24px).
- **Depth.** Three layers move at slightly different rates on scroll: wall, ledge and shadow,
  spines. The total shift is small, about 12px.
- **Light.** Each ledge is lit from behind by its LED bar: a line of light at the ledge, a glow
  on the wall behind the boxes, and a halo round each box. The LED takes the color of the game
  in focus, and returns to violet when nothing is.
- **Hover or focus (desktop).** The box lifts toward you and its neighbors move aside a few pixels.
- **Pull (desktop).** Click or Enter. The box comes forward and its cover grows into the
  detail view.
- **Tap (phone).** The box lifts and a sheet rises from the bottom with the cover, title,
  status and platforms. Drag the sheet up, or tap it, for the full detail. Swipe the sheet
  sideways for the next or previous game.
- **Scrub (phone, compact option).** Press and slide a finger along a ledge. Each spine tips
  out as the finger passes, with its title shown above. Lift to select. This is how a narrow
  spine is chosen precisely.

### 3.5 What both shelf views must do

| Capability | 2D | 3D |
| --- | --- | --- |
| Same games in the same order | Yes | Yes |
| Filter, sort, group, search | Yes | Yes |
| Reordering animates | Yes | Yes |
| Hover or focus preview | Yes | Yes |
| Open detail with a shared-element transition | Yes | Yes |
| Full keyboard use | Yes | Yes |
| Full screen-reader use | Yes | Yes |
| State marks from 3.2 | Yes | Yes |
| Light and dark themes with different lighting | Yes | Yes |
| Calm version under reduced motion | Yes | Yes |
| Works by touch | Yes | Yes, though 2D is the default there |

### 3.6 Switching 2D and 3D

**Experimental views.** The 3D shelf and the compact shelf are unfinished: in 3D covers are
hard to read, and spines make games hard to recognize (issue 63). They stay out of sight until
I turn on **Experimental views** (Visualizações experimentais) on my account page, a switch with
a line that says they are unfinished and may look or work wrong.

- It belongs to this device, like the theme: off in a fresh browser, kept over a reload and
  over a restart of Shelf for Windows.
- While it is off, the shelf is 2D with covers. Neither pair of buttons is shown, `D` does
  nothing and is not in the list of keys, and a choice of 3D or compact stored before cannot
  bring either back, from the first paint on.
- Turned on, both pairs of buttons appear in the library's row of controls, under a label
  "Experimental" with a flask. The shelf stays in 2D with covers until I press 3D or Compact.
- Turned off, the shelf goes back to 2D with covers and the choices made under it are
  forgotten. Filters, sort and grouping are in the address, so nothing else changes.

**Default**

| Situation | Starts in |
| --- | --- |
| Every device | 2D |
| No WebGL | 2D, and the 3D button is disabled with a reason |

Once I press either button, that choice is remembered on this device.

**Covers or spines.** Beside 2D and 3D sits a second pair of buttons: Covers and Compact.
Covers is the default everywhere. Compact stands the boxes spine-out. It is also a per-device
choice, it is not in the address, and it works in both 2D and 3D.

**The switch itself**

- The game nearest the center of the view, or the focused game, is the **anchor**. After the
  switch the anchor is in the same place on screen. That is what "keeps my position" means:
  the two views lay shelves out differently, so pixels cannot match, but the place in the
  library does.
- Filters, sort, grouping, search and focus are untouched.
- Going to 3D, the wall tilts back and the boxes gain depth around the anchor. Going to 2D,
  it flattens. About 700ms.
- Under reduced motion: a 200ms crossfade.
- The 3D code is downloaded the first time 3D is opened, not before.

**Done when**

- Every library test passes in both views.
- Switching views leaves the address unchanged and the anchor game on screen.
- The choice survives a reload and a new visit on the same device.
- A device that has never chosen gets 2D, a desktop too.
- With experimental views off, nothing a control, a key or a stored choice does shows 3D or
  compact.
- With 500 games the 3D view holds 60 frames per second on a mid-range laptop.

### 3.7 Grouping

| Group by | Shelves | Order |
| --- | --- | --- |
| Platform | One per platform I own games on, plus "Not owned" | By family, newest generation first |
| Status | Playing, Backlog, Someday, Completed, Retired, Dropped, Wishlist, Unsorted | That order |
| Year | One per release year | Newest first |
| None | One shelf | |

- A game owned on two platforms stands on both platform shelves. Counts in the stats line and
  in filters count it once.
- Empty shelves are not shown.
- The sort applies inside each shelf.
- A shelf can be collapsed, on anything wider than a phone (a phone shows one shelf at a
  time). Collapsed shelves are remembered on this device.

### 3.8 Wall and List

**Wall.** Covers in a grid, the Letterboxd way: dense, with almost no chrome. Three sizes. A
status mark and platform marks appear on each cover. Shelf labels stay pinned while their games
scroll past, on a phone too. At rest a label sits on the wall like the shelf's and the list's
headings; only once pinned does it take a band of wall color, so no cover shows through it. The
trophy wall's year labels do the same.

**List.** One compact row per game, for fast scanning:

| Column | Notes |
| --- | --- |
| Cover | Thumbnail |
| Title | With the year |
| Platforms owned | Each with Physical or Digital, in words (a cartridge is no disc) |
| Status | |
| My rating | |
| IGDB rating | |
| Playtime | |
| Added | |
| Completed | |

Clicking a column heading sorts by it, which is the same sort as everywhere else. On a phone
the list keeps cover, title, platforms and status, and the rest move into the row's expanded
state.

Both views render only the rows on screen, so 1,000 games scroll as smoothly as 50.

### 3.9 Trophy wall and stats

**Trophy wall** (`/trophies`). Every completed game, face-out, each under its own light, grouped
by the year I finished it, newest first. Under each: title, date finished, hours, my rating.
The light is a small lamp above the cover throwing the game's own color down the wall, and the
cover stands on a short plinth. A trophy opens the game's page. A game finished on a day I
never recorded stands last, under "Day not recorded".

**Above the wall, its figures** (the first phase of issue 68, built 28 Oct 2026). The owner
asked for the trophy page to become "a personal gaming museum", after Steam Replay and
PlayStation Wrap-Up: "Every statistic should tell a story, and every story should let users
explore the games behind it."

- **Which trophies.** One row above everything it scopes: All time, then each year something
  was finished in, newest first; and a filter in the library's own language (`genre:rpg
  owned:switch`), with Clear. Both are in the address (`?year=2025&q=genre:rpg`), so a page of
  one year or one filter can be shared, and both work before the page is alive. A year is the
  games finished in it; a filter is the games it matches, as in the library, `keyword:` aside
  (keywords are not in the library file). Every figure below is of the same games. A year or
  filter that leaves nothing says "No finished game matches", with the way back to all time.
- **The headline.** Games finished, large, and under it how many this year and the share of
  started games finished. Beside it: hours played, across the whole library (of one year: the
  hours on its games), the average of my ratings (of every game I rated, or of the year's
  games), the median hours of a finished game, games dropped, the months in a row with a game
  finished (still going while this month has none yet) with the best run, the finished game I
  played longest, and the platform I played most on, by the hours on each game's main copy.
- **Year by year.** A column for each year from the first finish to this one, a year with none
  as an empty column. Each leads to that year's page; on a year's page, that year's column is in
  the accent and the others are quiet, and it leads back to all time. The best year and this
  year carry their numbers.
- **Month by month.** Of all time, a row of twelve months for every year, darker for more; of
  one year, its twelve months as columns. Each month leads to the library filtered to the games
  finished in it (`completed:2025-08`).
- **What is finished.** The eight genres, themes and platforms with the most games finished,
  most first, each with the share of its started games finished once five were started. A
  platform counts every game owned on it, as `owned:` does. Each leads to those games in the
  library.
- **Records.** The first finish recorded, the quickest finish, the game played longest of all
  when that is not the longest finished, the best rated finish, the oldest game finished, the
  best year and month, and the longest run of months. A month or a year leads to its games.
- **Every chart has its table,** folded under it, and a tooltip on hover and on focus; nothing
  is said by color alone. They are drawn without a script.

Started is playing, finished or dropped; a retired game is out of it, since it had no end to
reach (3.12). What cannot be known yet (no ratings, nothing started, no hours, one year only)
is left out, not shown as nothing. Achievements are not among the figures yet: they are the
issue's third phase. A public wall is listed for search engines once it has a trophy; an empty
one is not. A private shelf's wall is drawn only in its own browser (ADR 004).

**In the library**, the stats line (games, finished, hours) is always visible and follows the
current filter. Numbers count up once when first seen, and are still under reduced motion.

### 3.10 Empty, loading and failure

| Situation | What appears |
| --- | --- |
| Loading | The wall and ledges first, then boxes arriving in a short stagger. Blurred color placeholders stand in for covers. |
| Empty library, signed in | An illustration of an empty lit ledge, Add your first game, and Bring your games from a platform, which leads to the page that sets a new shelf up ([section 4.6](#46-setting-a-new-shelf-up)) |
| Empty library, visitor | The same ledge and one line saying the shelf is being stocked |
| No results | "No games match these filters", the active filters as removable chips, and Clear all |
| A cover fails to load | The generated spine colors with the title set in type |
| The library fails to load | What happened, and Try again |

### 3.11 Keyboard

| Key | Does |
| --- | --- |
| Arrow left, right | Previous, next game on the ledge |
| Arrow up, down | Ledge above, below |
| Page Up, Page Down | Previous, next shelf |
| Home, End | First, last game of the shelf |
| Enter or Space | Open the focused game |
| Escape | Close detail, sheet or panel |
| `/` | Focus search |
| `F` | Open filters |
| `G` | Change grouping |
| `S` | Change sort |
| `V` | Next view |
| `D` | Switch 2D and 3D, with experimental views on (3.6) |
| `R` | Shuffle ("surprise me") |
| `A` | Add a game (signed in) |
| `?` | Show this list |

Single-letter shortcuts are off while typing in a field, and can be turned off entirely.

### 3.12 Someday and Retired

**Built 25 Oct 2026.** The owner asked on 25 Oct 2026, of a game with no end: "qual status devo
colocar em um jogo que não tem fim? Tipo path of exile. Joguei umas 200 horas e não estou
jogando mais. Significa que eu dropei?"; and of games they may never get to: "Meu backlog tenho
certeza que vou jogar em algum momento, Mas tem uns jogos meio maybe, talvez um dia eu jogue
mas são menos prioridade que os do backlog." Then, of this section and of 3.13, 7.4 and 11.1:
"Escreve tudo essas coisas no spec, mas não constroi nada ainda".

Two statuses join the five, each for a game the others describe wrongly:

| Status | For | Not |
| --- | --- | --- |
| **Someday** (Algum dia) | A game I own and may play one day, after my backlog | Backlog, which I mean to play; Wishlist, which I do not own |
| **Retired** (Aposentado) | A game with no end to reach that I am done with, having had what I wanted from it | Completed, which reached an end; Dropped, which I gave up on before having what I wanted |

A game with a story and play after it (Path of Exile's campaign, then its endgame) is Completed
once the story is done. Retired is for the rest: a game that never ends, multiplayer or endless,
that I have stopped playing.

**On the shelf,** never by color alone, as every status (3.2):

| Status | On the shelf |
| --- | --- |
| Someday | Stands set back from the row, toward the wall: the opposite of Playing. In 2D, a little smaller, and in shade. |
| Retired | A small square tag on the cover's corner, matte, where Completed has a round foil seal |

The wall and the list give each its own mark, and a box's name says its status in words, as
for the others.

**The order,** everywhere statuses are listed (the status row, grouping, sorting, the editor,
adding a game, the placing page and its tally): Playing, Backlog, Someday, Completed, Retired,
Dropped, Wishlist, Unsorted. What I mean to play, then what I am done with, then what I do not
own, then what waits.

- **The status row** shows Someday and Retired only while the shelf has a game in one, as it
  does Unsorted: a shelf that never uses them looks as it does now.
- **The placing page** (4.5) offers both among the others, as shapes and words; on a phone the
  statuses wrap. What a sync brought in is where the two are needed most.
- **Stats** (3.9): a retired game is not finished. It is not on the trophy wall, not counted in
  games finished, here or in the stats line, and never the longest game. The share of started
  games that I finished leaves it out altogether: there was no end to reach, so it neither
  raises nor lowers it. Its hours count in hours played and the most-played platform, as every
  game's do. Someday is not started, as Backlog is not.
- **Neither sets a date.** Completed alone sets the completion date.
- **Filters:** `status:someday`, `status:retired`. The API, the MCP tools and `llms.txt` list
  the seven. The starter shelf Backlog stays `status:backlog`, so Someday is out of it, which is
  the point.
- **A sync never sets either:** a game it adds still starts unsorted, or playing (4.4).

**Done when**

- Someday and Retired each show by posture or mark, and in words, in 2D, 3D, the wall and the
  list, in both themes.
- Grouping and sorting by status give the order above, and the status row shows the two only
  while a game has one.
- A retired game counts in hours played and in nothing finished, and leaves the share of
  finished games as it was.

### 3.13 Hiding adult games

**Built 25 Oct 2026.** The owner asked on 25 Oct 2026: "Preciso de uma opção pra esconder todos os
jogos marcados como erotic. Mas não é uma opção permanente. Ela deve lembrar minha escolha obvio
mas devo poder reverter ou ativar ao pressionar um botão. Mas não quero ter que apertar pra
esconder toda vez que atualizar a pagina, então essa seleção tem que ser lembrada. Erotic e
Adult Only. Tipo se eu quiser mostrar minha biblioteca pra uma pessoa no meu pc e não quiser
mostrar esses games."

- **Adult** means a game IGDB gives the theme Erotic, or that the ESRB rates Adults Only (AO).
  Shelf keeps IGDB's themes already; age ratings are fetched with every game from then on, and
  for the games already cached as the daily refresh reaches them, about a hundred a day, so an
  Adults Only game not Erotic too is known within days. The ESRB gives AO for violence too
  (Hatred, Thrill Kill): those count, as the owner asked for Adults Only.
- **One switch, Hide adult games on this device** (Esconder jogos adultos neste aparelho), on
  my account page, in a section of its own, Adult games, after Experimental views (3.6), with a
  line that says which games it hides. No shelf has a button or a key for it, so nothing beside
  a shelf shows that anything is hidden, or offers to. It began as a button in the library's
  row of controls, shown only on a shelf with an adult game, and `H`; the owner moved it on 28
  Oct 2026: "Vc pode por favor mover o botão esconder jogos adultos do início pras
  configuração?"
- **Remembered on this device,** like 2D or 3D, before the first paint: a reload, a new visit
  and every page keep it until it is switched off. It is not in the address, so a link I share
  shows the person who opens it what they chose. It belongs to whoever is at this screen, so it
  is per device, not per account, and holds on every shelf seen on it.
- **While it is on, adult games are drawn nowhere:** not on the shelf, the wall, the list,
  3D, the trophy wall, the placing page, or in the search inside the library, and never drawn
  first and taken away. The counts, the stats line and the stats leave them out, so the numbers
  agree with what is on the screen. A page the server drew holds them until it comes alive,
  except on the trophy wall, whose stats are drawn both ways: a reload shows the library's
  totals with them for a moment, its boxes never. Nothing counts what is hidden, and nothing
  on a shelf is a sign that something is.
- **A game's own page,** reached by its address while it is on, shows no cover, art or
  screenshots, says the game is hidden on this device, and offers to show adult games again.
- **A visitor** to a public shelf who has an account has the same switch, on their own account
  page, for their device; one with no account has none. Until it is on, adult games show, for
  everyone.

**Done when**

- With it on, no adult game's cover or title is drawn on any page of a shelf, in any view,
  from the first paint, and a reload keeps it so.
- Switched off, they are back, and that survives a reload too.
- No shelf has a button or a key for it, and the list of keys does not name one.

---

## 4. Adding games

Signed in only. Opened by the Add button, by `A`, or from the empty library.

### 4.1 One game

1. **Type.** Results appear as I type, from two characters on, after a short pause. A newer
   keystroke cancels the older request. A word still being typed counts: "astral cha" finds
   Astral Chain, after the games that have every word whole (the owner, 25 Oct 2026: "astral
   cha -> não acha nada na busca. Astral Chain -> acha o jogo correto.").
2. **Read the results.** Up to eight. Each shows cover, title, **year**, platforms, and a tag
   when it is a remake, remaster or expanded edition. Same-titled games are told apart by year
   and platforms: Prey (2017) and Prey (2006) are both in IGDB under one name.
3. **Editions and ports are folded in.** Search hides edition records, and shows a port as
   "also on Switch" under its parent, not as a second result.
4. **Already have it?** A result I own, under any version, says "In library" and opens that
   entry.
5. **Choose.** Arrow keys and Enter, or tap.
6. **Fill three things:**
   - **Status.** Backlog by default.
   - **Platforms owned.** The platforms this game was released on, as chips, with my most-used
     first. Picking one asks physical or digital, preset to what I last chose for that platform.
     Wishlist needs none, and asks instead which platforms I want it on, if any (7.5).
   - **Optional:** my rating, tags, and a completion date if the status is completed.
7. **Add.** Enter adds and closes. Command+Enter adds and clears the field for the next game.

If the game is related to one already on the shelf, a line says so and offers the default from
[ADR 001](adr/001-game-entry-model.md): "You have Skyrim on PC. Add this as another copy?" with
both choices.

**Afterwards.** The new box slides onto the shelf and the view moves to it. A message offers
Undo. If the current filters hide the new game, the message says so and offers Show.

### 4.2 Many games

A second tab, "Paste a list".

1. Paste titles, one per line. A year in brackets and a platform in square brackets are
   understood: `Hollow Knight (2017) [Switch]`.
2. The app matches every line and shows progress. It can be canceled.
3. **Review.** One row per line: the match with cover and year, how sure it is (exact, close,
   none), and a menu of alternatives. Lines with no match are marked and can be fixed or
   skipped. Games already in the library are marked and skipped unless I say otherwise.
4. Set status, platform and format for all rows at once, and override any row.
5. **Add N games.**

Up to 200 lines at a time. A check against IGDB today showed exact-title lookups can be batched
ten to a request, and anything fuzzier needs its own request, so 200 titles take from a few
seconds to about a minute within IGDB's limit of four requests per second.

**Done when**

- A game can be found and added using only the keyboard.
- Two same-titled games are distinguishable in the results without opening either.
- Adding a second platform to a game I own never creates a second entry.
- A pasted list of 50 known titles produces a review table with every line matched or marked.
- Undo removes the game and everything added with it.

### 4.3 When IGDB misbehaves

| Problem | Behavior |
| --- | --- |
| IGDB is slow | Results area shows it is searching; typing stays responsive |
| IGDB is down | "Game search is unavailable right now", with Try again. The library itself keeps working, because it reads from our own copy. |
| Rate limit reached | Requests queue and continue; the bulk progress bar says it is waiting |

### 4.4 From a store or console

On the account page, under **Platforms** ([ADR 003](adr/003-platform-sync.md)), and as the
first step of setting a new shelf up ([section 4.6](#46-setting-a-new-shelf-up)): the same
cards in both. Steam and Nintendo are built; PlayStation and Xbox come next, and the page says
so. Every store and console is named in words: Shelf draws none of their logos, which their
owners do not allow, beyond Valve's own sign-in button.

1. **Link.** "Sign in through Steam", Valve's own button, goes to Steam's own sign-in page and
   back. Shelf never sees the Steam password. Steam has to show the account's game details
   publicly; the card says where that is set, and links to Steam's own privacy settings, in a
   tab of its own. Steam's sign-in comes back to the page it left.
   An empty shelf leads to these cards too, beside "Add your first game".
2. **The first sync** starts by itself on the way back. Every game the account owns on Steam,
   free games it has played among them, is matched to IGDB: by Steam's own id first, then by
   a strict title match on PC. Matched games go on the shelf at once, twenty at a time, with
   progress: "Added 120 of 480…".
   - **A game already on the shelf**, under any version, gains a PC digital copy, or feeds
     the one it has. Never a second box. Its status, rating, notes, tags and dates are never
     touched.
   - **A game new to the shelf** starts **unsorted**, waiting for me to place it, or as
     playing if Steam saw it played in the last two weeks. Owning a game on Steam does not
     make it my backlog. Placing them, with a rating, one after another, is section
     4.5's page.
   - **What Steam's store says is not a game** is left out by itself, before anything is
     matched: demos, playtests, software, videos and soundtracks. "Left out" says what Steam
     calls each one, and **Ask again** brings it back for good. A mode Steam lists apart from
     its game (a multiplayer, a zombies mode) goes on that game's copy, hours and all.
   - **Steam's hours** go on the copy, in Steam's own row. A game shows the larger of the hours
     I typed and what its sources report together, so nothing is counted twice; the editor
     shows Steam's hours beside the copy.
3. **What it could not match** waits under "2 games need you": **Find it** (IGDB searched by
   the title, which I can change), **Not a game**, **Not mine**. Every answer is kept.
4. **Afterwards:** **Sync now**, and once a day by itself while **Sync once a day** is on. A
   game I take off my shelf stays off. A game Steam stops listing stays on the shelf, under
   "No longer on Steam", for me to decide. **Disconnect** forgets what Steam listed and my
   answers about it; the games stay, with their hours, and so do their achievements, as they
   were when last read.
5. **Achievements** are read once the games are in, the latest played first, while the games
   are already on the shelf: "Reading achievements: 120 of 480…". Steam counts a hundred
   games' unlocks in one question, so a game is asked about on its own only for a list not
   read yet or new unlocks; a large library takes a minute or two the first time, and moments
   after. The card then says "Achievements read for 480 of 480 games". A game's achievements
   are read again after it is played, and after a week; Steam's definitions after a month, or
   as soon as Steam counts another number of them. Each game's page shows them (section 7.8).

| Problem | Behavior |
| --- | --- |
| Steam's game details are private | "Steam is not showing your games", with a link to where to change it |
| Steam keeps the achievements private | "Steam keeps your achievements private", with the same link; no game is shown as having none unlocked |
| Steam keeps one game's achievements from Shelf (a game no longer owned) | That game is read as none unlocked, as Steam counts it; the others are read, and nothing says the account is private |
| Steam keeps a game's own list from Shelf for its content (adult games, some mature ones) | Its unlocks are read from Steam's count of them, each "Unlocked, day not known": Steam gives no days there |
| Steam fails on one game's achievements | The others are kept; that game is read again an hour later, or with the next sync |
| Steam does not answer | Said on the card; the next sync tries again |
| A very large library | The rest of the games come with the next step, or the next sync, past 2,000 an hour |

**Done when**

- A first sync puts every matched Steam game on an empty shelf, as a PC digital copy with
  Steam's hours.
- A game already on the shelf gains a copy, never a second entry, and keeps its status.
- A game I removed is not put back by the next sync.
- Steam's hours never overwrite or add to the hours I typed.
- The sign-in links nothing for an answer the browser did not ask for, or one used before.
- A synced game starts unsorted or playing, never in the backlog; demos, playtests and
  software never reach the shelf.
- Every synced game's achievements are read without linking again, in steps, and reading
  them again adds nothing twice.

**Nintendo** reads the play history Nintendo keeps for the account, the one the Nintendo Store
app shows: every game played on a Switch or a Switch 2, with its hours.

1. **Link.** Nintendo's page cannot send the browser back, so the card says three steps:
   **Sign in on Nintendo's page** (a new tab); when Nintendo shows "Select this account", do not
   press it, copy its link (right-click, or press and hold on a phone); paste it into the card
   and **Link Nintendo**. The second step is also drawn: the button, with the menu open on
   "Copy link address". The drawing is Shelf's own, with nothing of Nintendo's page in it, and
   is hidden from assistive technology, since the words say it all. A wrong paste says what was wrong: not the button's link, a link from
   another sign-in, or one Nintendo no longer takes (each works once, for a few minutes).
   Shelf never sees the Nintendo password; it keeps the session Nintendo gives, sealed.
2. **The first sync** starts once linked. Nintendo lists what was played, not what is owned,
   so nothing goes on the shelf by itself: every game is matched by title on the consoles that
   play it, and waits under "9 games need you" with the game Shelf took it for, its cover and
   year. **Cartridge** or **Download**, each with its picture, puts it on the shelf; **Not
   this game** opens Find it; **Not mine**. One line answers every match at once: "All 7
   games Shelf found are: **Cartridges** / **Downloads**". A game I find becomes the match,
   and waits the same way.
   The matched games come first; those Shelf could not find follow, under "Shelf could not
   find these 2 games", each with Find it, Not a game and Not mine. The card says "9 games
   wait for your answer", never "up to date" while any do.
   - A game Nintendo lists under two names (Warframe for Nintendo Switch, and Warframe) is
     one row: "Nintendo also lists it as Warframe.", the hours of both, one answer for both,
     and one game in every count.
   - An answered game leaves the list the moment it is answered, not when the list comes
     back; it returns, saying what went wrong, only if the answer fails.
   - Nintendo's names are matched as IGDB writes them: "– Nintendo Switch 2 Edition" finds
     IGDB's "- Nintendo Switch 2 Edition", its own record, where IGDB keeps one, and the game
     itself where it does not; "for Nintendo Switch" is left out.
   - A game played on a Switch and then a Switch 2 is one game, its hours summed. A Switch
     game played on a Switch 2 is a Switch copy; a Switch 2 game, a Switch 2 copy.
   - A game already on the shelf gains the copy, never a second box; a new one starts
     unsorted, or playing if played these two weeks. Nintendo's hours go on the copy, as
     Steam's do.
3. **Afterwards** as Steam: Sync now, once a day, Disconnect. When Nintendo ends Shelf's
   session (it lasts about two years), the card says so and shows the three steps again;
   signing in again keeps every answer.

**Done when**

- Linking takes the link from Nintendo's button, pasted in the browser that signed in, and
  nothing else.
- No game Nintendo lists reaches the shelf before I say how I own it.
- One answer can place every match at once.
- A Switch game played on a Switch 2 lands on the Switch shelf; a Switch 2 Edition IGDB keeps
  a record of, on the Switch 2 shelf.
- The session is stored sealed, and is never sent to a browser.

### 4.5 Placing what a sync brought in

The owner asked for it on 23 Oct 2026, after their first Steam sync, with Minimap's "Rate my
games" page as the model: games a platform brought in "are actually in a waiting state, or
unassigned state, we will in a next step, add a review experience where we will allow the
user to assign a score to the game and which status they have." The rating is the editor's,
out of ten, not Minimap's five stars (the owner, 24 Oct 2026: "Usa o de 0-10 que a gente já
tem"). Built 24 Oct 2026. The same day, having used it, they asked that a placed game stay: "não
quero que o jogo desapareça depois de eu colocar um status nele imediatamente. Se eu colocar o
status errado ou não tiver dado uma nota ainda ele está desaparecendo. [...] Se eu atualizar a
pagina e voltar pro organize seus jogos ai beleza".

- **A page of its own**, `/account/unsorted`, for my unsorted games, reached from each
  platform's card ("240 games to place", the games that source brought in still unsorted);
  from the header, among my own shelf's links, "Place games" ("Organizar"), with how many
  wait in a small accent count after it, up to "999+", and no count when none does; and from
  the page that sets a new shelf up (4.6). The count follows the library as games are placed
  or synced, on the shelf and on this page. The owner, 27 Oct 2026: "O botão Organizar os
  jogos sem status não esta bom no lugar que ele esta. Adicione uma rota nova na header nav e
  quando tiver jogos sem organizar deixe um numerozinho mostrando quantos faltam". The count
  is after the word, not over it: on a text link, design systems put a count beside the label
  and keep it to four characters; its words are read out, so it is never only a colored shape. Its intro says what the page is for, in one sentence,
  and nothing of how it behaves, which using it shows (the owner, 24 Oct 2026: "esse texto ta
  explicando demais [...] So explica pra que serve e ponto").
- **One row per game:** cover, title and year, the platforms of its copies, hours on each
  source that feeds a copy and when I last played it there ("Not played on Steam" when it
  never was), or the hours I typed when no source reported any. Longest played first, as
  Minimap opens; also by last played, by title, and by last added. The first 50 are drawn, and
  50 more at a time.
- **On each row, my rating and a status, one tap each, saved at once,** with the controls the
  editor uses: the rating out of ten, and Playing, Backlog, Someday, Completed, Retired,
  Dropped, Wishlist as shapes and words, the one given shown pressed, with a tick. **A game given a status stays in
  the list for the rest of the visit,** so a wrong status is one tap to change and a rating can
  still be given; its pressed status, tapped again, takes it back to unsorted. If saving fails,
  the status is taken back, saying so. The next time the page is opened, it lists only the
  games still unsorted. Nothing else about the game changes: Completed here sets no completion
  day.
- **Not this game,** on a row still waiting, for a game the sync took for the wrong one (the
  owner, 24 Oct 2026: "build 'Não é este jogo' on the placing page, to fix games the sync
  matched wrong while keeping the copy and the hours"). IGDB is searched for its title, which
  I can change, and the game I pick is what it is from then on: its status, rating, notes,
  tags, copy and hours stay, the record it was taken for leaves the shelf, and the sync
  remembers the game I picked, so the next sync keeps it. When that game is on my shelf
  already, under any version, this one folds into it as a sync would have put it there: its
  copy joins (one already there on the same platform and format is fed, its hours added),
  what the other lacks of mine (a status, a rating, notes) it takes, and the row leaves the
  list. A row given a status here is placed: tapping its status again brings the choice back.
- **A tally beside the list,** as Minimap's has: how many games are in each status, and how
  many are still unsorted, moving as I place them. On a phone it sits above the list, the
  statuses on one wrapping line.
- **Many at once:** select rows, "the N games under an hour", or all of them (those two count
  only the games still waiting), and give them one status, in one write, with Undo, which puts
  each back as it was. The bar that does it stays under the header while the list scrolls.
- **Leaving one unsorted is fine:** it stays in the list for another day.
- Keyboard all the way: the list is one stop (each row's checkbox), the arrows move through
  it, Home and End go to either end, Space selects, and Tab goes on into the row's link,
  rating and statuses. A row placed from the keyboard stays, and focus with it. Both themes,
  both languages, a phone.

**Done when**

- Every unsorted game can be given a status and a rating from one page, without opening it.
- A game given a status stays, showing it, until the page is opened again; one tap changes
  it, and its own status taken back makes it unsorted.
- A game the sync took for the wrong one becomes the right one from its row, with its copy
  and hours; when the right one is on the shelf, it takes them in, and no second box appears.
- The tally always agrees with the shelf.

### 4.6 Setting a new shelf up

The owner asked for it on 24 Oct 2026: "precisamos de uma pagina de onboarding. Essa pagina o
usuário que acabou de criar uma conta vai poder fazer algumas ações. Tipo importar seus games,
ir na lista e arrumar os jogos que estão errados durante o import". They also asked for
something that says how many games have no status, but "não quero que vc fique adicionando
botões a torto e a direito": the line under the status row (4.5) was that, and nothing else
was added. On 27 Oct 2026 they moved it into the header, as a link with a count (4.5).

- **A page of its own**, `/account/start`, titled "Set up your shelf", where signing up leads.
  An empty shelf leads there too.
- **Two steps,** each checked off by what is true of the shelf, never by a box I tick:
  1. **Bring your games in:** the platform cards of 4.4, working here as on the account page:
     linking, the first sync with its progress, and the games that need my answer, answered
     in the card; a card's "240 games to place" is left to the next step here. Or by hand, on
     my shelf. Done once the shelf has a game and no platform
     waits for an answer ("3 games are waiting for your answer above").
  2. **Say where each game stands:** how many games have no status yet, of how many, with a
     bar, and the way to the page for placing them (4.5). Done once none is unsorted. Leaving
     some for another day is fine, and the step says so.
- **See my shelf** ends the page, its main action once both steps are done.
- **Nothing else points here:** no banner, no menu item. What waits has its own place:
  platforms on the account page, unsorted games in the header's link to placing them, with
  their count (the owner chose a count on 27 Oct 2026, though leaving games unsorted is
  allowed, so it may stay a while); a banner would push the games down to say what the link
  says; a tour teaches less than doing (Nielsen Norman Group
  found that deck-of-cards tutorials did not help people finish tasks, and made the tasks
  seem harder).

While building it, "Last synced in 2 seconds" showed on the first sync: the server's clock ran
a moment ahead of the browser's. A sync is never said to be in the future.

**Done when**

- Signing up leads here, and Steam's sign-in started here comes back here.
- Each step checks itself off as the shelf changes, a sync's progress included.
- Both themes, both languages, a phone.

---

## 5. Filters

### 5.1 What can be filtered

**From IGDB**

| Field | Key | Kind |
| --- | --- | --- |
| Genre | `genre` | List |
| Theme | `theme` | List |
| Age rating | `age` | List: each board's rating, the board first: `esrb-ao`, `esrb-m`, `pegi-18`, `classind-l`. The ESRB, PEGI, CERO, USK, GRAC, ClassInd and ACB, as IGDB records them. |
| Keyword | `keyword` | List |
| Game mode | `mode` | List |
| Player perspective | `perspective` | List |
| Platform released on | `platform` | List |
| Franchise | `franchise` | List |
| Series | `series` | List |
| Developer | `developer` | List |
| Publisher | `publisher` | List |
| Release year | `year` | Range |
| IGDB rating | `igdb` | Range, 0 to 100 |
| Time to beat | `length` | Range, hours |
| Kind of game | `kind` | List: main, remake, remaster, expanded, port |

**Mine**

| Field | Key | Kind |
| --- | --- | --- |
| Status | `status` | List |
| My rating | `rating` | Range, 0 to 10 |
| Platform owned | `owned` | List. Also accepts a family: `playstation`, `xbox`, `nintendo`, `pc`. |
| Wanted on | `wanted` | List: the platforms a wishlist game is wanted on (7.5). Families too. |
| Format | `format` | `physical`, `digital` |
| Number of platforms owned | `copies` | Range |
| Completion date | `completed` | Date range |
| Date added | `added` | Date range |
| Playtime | `hours` | Range |
| Tag | `tag` | List |
| Has | `has` | `notes`, `rating`, `playtime`, `cover` |
| Featured | `is` | `featured` |

Franchise and series are two different lists in IGDB (Tomb Raider is a franchise; "Tomb Raider:
Survivor" is a series), so they are two filters.

### 5.2 Combining them

Three levels, each a superset of the one before.

**Level 1: the panel.** Each value of a list filter has three states: off, include, exclude.
On a desktop, clicking a value cycles through them. On touch, each value has explicit include
and exclude buttons, because a hidden cycle is not discoverable. On a window 1536px wide or
more the panel is a column left of the library, always open and in view as the shelves scroll;
narrower, it is a sheet the Filters button opens. The two are one panel: a section open in one
is open in the other, and the filter is the same either way.

- Several included values in one filter mean **any of** them. A switch on the filter changes
  that to **all of**.
- Excluded values always mean **none of**.
- Different filters combine with **and**.

That covers most questions: RPG or adventure, not horror, in my backlog, on Switch.

**Level 2: groups.** "Match any of these groups" adds a second group of conditions joined to
the first with **or**: physical on PS5, or anything rated 9 and up.

**Level 3: typed.** The search field accepts the same conditions as text, for anything the
panel cannot express. The panel and the text are two views of one filter: changing either
changes the other.

### 5.3 The filter language

One line of text describes any filter. It is what the address stores, what a smart shelf
stores, and what an AI assistant sends.

| Write | Means |
| --- | --- |
| `genre:rpg` | Genre is RPG |
| `genre:rpg,adventure` | RPG **or** adventure |
| `genre:rpg genre:strategy` | RPG **and** strategy |
| `-theme:horror` | **Not** horror |
| `year:2015..2020` | From 2015 to 2020 |
| `rating:>=8` | My rating 8 or more |
| `hours:<10` | Under ten hours played |
| `completed:2025` | Finished in 2025 |
| `completed:2025-06..2025-08` | Finished June to August 2025 |
| `has:notes` | I wrote notes |
| `-has:rating` | I have not rated it |
| `(owned:ps5 format:physical) OR rating:>=9` | Either group |
| `zelda` | "zelda" in the title |
| `"breath of the wild"` | That phrase in the title |

Rules:

- A space means **and**. `OR` in capitals means or. Brackets group. A leading `-` negates.
- Values are lower-case with hyphens: `developer:eidos-montreal`, `tag:couch-co-op`.
- Keys are always the English ones above, in both languages, so a link works for everyone.
  Labels in the panel are translated.
- Anything that cannot be understood is ignored and shown to me as a struck-through chip, so a
  hand-edited address still loads.

### 5.4 Counts

Beside every value: how many games would match if I picked it, given everything else that is
active. Values that would match nothing are dimmed and sink to the bottom. Long lists
(developers, franchises, keywords) show the top eight with a search box.

### 5.5 Smart shelves

A smart shelf is a named filter with a sort and a grouping. It updates itself as the library
changes, like Steam's dynamic collections.

- **Save** from any library view (signed in): give it a name. It gets its own address.
- **Open** from a list in the library header.
- **Change** it by changing the view while on it. The header says "changed" and offers Save and
  Save as new.
- **Starter shelves**, present from day one and editable:

| Name | Filter |
| --- | --- |
| Playing now | `status:playing` |
| Backlog | `status:backlog`, oldest added first |
| Short ones | `status:backlog length:<10` |
| On the shelf | `format:physical`, grouped by platform |
| Favorites | `rating:>=9` |
| Wishlist | `status:wishlist` |

### 5.6 Speed

Filtering happens on the device, over the library already loaded. A change shows its result on
the next frame. There is no Apply button and no spinner.

**Done when**

- Every filter in 5.1 works alone and combined with any other.
- And, or and not behave as the table in 5.3 says, including nested groups.
- A filter round-trips: panel to address to panel gives the same filter.
- Counts are correct for every value under any active filter.
- With 1,000 games a filter change updates the results in under 50ms.
- A smart shelf's address shows the same games for a visitor as for me.

---

## 6. Sorting

| Sort | Key | Notes |
| --- | --- | --- |
| Title, A to Z or Z to A | `title` | Follows the language's alphabet. A leading "The", "A" or "An" is ignored. |
| Date added | `added` | |
| Release date | `released` | |
| My rating | `rating` | |
| IGDB rating | `igdb` | |
| Playtime | `hours` | |
| Completion date | `completed` | |
| Status | `status` | Playing, Backlog, Someday, Completed, Retired, Dropped, Wishlist, Unsorted |
| Surprise me | `random` | A shuffle. The address keeps a seed, so a shared link shows the same order. Shuffling again picks a new seed. |

Two more that the data makes cheap. Say if you do not want them:

| Sort | Key | Why |
| --- | --- | --- |
| Time to beat | `length` | IGDB provides it. Shortest first is the natural way to work a backlog. |
| Color | `color` | Cover colors are extracted anyway. This gives a rainbow shelf, a common way collectors arrange spines. |

Rules:

- `-` in front of a key reverses it: `sort=-rating`.
- Games with no value for the sort key come last in both directions.
- Ties are broken by title.
- With grouping on, the sort applies inside each shelf.
- Every sort works with every filter.

**The reorder is animated.** Boxes lift slightly, slide to their new places and settle, with a
short stagger. Only boxes on screen animate; the rest are simply in place when scrolled to. The
whole move takes at most 600ms. Under reduced motion it is a 150ms crossfade.

**Done when**

- Each sort gives the documented order, including ties and missing values, in both languages.
- Sort and filter survive a reload together.
- A reorder never drops below 60 frames per second with 500 games.

---

## 7. Game detail

### 7.1 What is on it

| Part | Content |
| --- | --- |
| **Hero** | The cover, large, over the game's key art dimmed behind it. No key art: a screenshot. No screenshot: the cover's own colors. |
| **Heading** | Title, year, developer |
| **Mine** | Status, my rating, platforms owned with format, playtime, date added, date completed, tags, notes |
| **About** | IGDB's summary and storyline, in their paragraphs. A long one shows about a screen's worth, and the rest behind **Read more**, opened in place |
| **Videos and screenshots** | One strip, videos first: each video on one of the game's own pictures with a play button and what it is ("Launch Trailer"), then the screenshots. No scrollbar: an edge with more past it fades, and on a pointer that can hover an arrow there moves the strip. A screenshot opens a full-screen viewer (arrow keys, swipe, pinch to zoom); a video plays over the page, from YouTube, which nothing reaches before it is pressed |
| **Achievements** | For a game a sync brought in from Steam: how many are unlocked, and each one (section 7.8) |
| **Details** | Genres, themes, modes, perspectives, franchise, series, publisher, release dates (one line a date, with every platform it came out on that day), time to beat, IGDB rating and how many ratings it rests on |
| **Versions** | The editions and ports linked to this entry (signed in) |

Each value under Details is a link to the library filtered by it.

IGDB's text stays in English, as IGDB provides it. In the Portuguese interface those passages
are marked as English, so a screen reader pronounces them correctly.

### 7.2 Opening and closing

- **From the shelf**, the cover is the shared element. In 2D the spine turns to its cover and
  grows into the hero. In 3D the pulled box becomes the hero. Closing reverses it.
- **From the wall or list**, the thumbnail grows into the hero.
- **Opened from the library**, detail sits over the shelf: a panel on desktop and tablet, a
  sheet on a phone. Back closes it and the shelf is where I left it.
- **Opened directly**, it is a full page with a link back to the library.
- **Next and previous** follow the library's current order: arrow keys on desktop, a sideways
  swipe on a phone.

### 7.3 Editing

Signed in, every field under Mine is edited in place and saved as I go. A change shows
immediately; if saving fails it reverts and says why. Mine is in groups set apart by a rule:
how I play it (status, rating, hours, completion date), what I own, tags and notes, privacy,
the versions, and archiving or removing.

- **Status** changes take effect on the shelf at once: the box changes posture.
- **Completed** sets the completion date to today, editable.
- **Hours played** takes only a number, typed with a point or a comma, or stepped an hour at a
  time with − and + beside it (ten with Shift) or the arrow keys. When a store reports hours on
  a copy, a line under it says how many, and that the larger of the two is shown.
- **Platforms owned:** each copy on a card of its own, with its platform, the hours a store
  reports on it, physical or digital, and a button to remove it. **Add a copy** opens a new one
  apart from them: a platform, physical or digital (one I own already cannot be picked), and
  Add.
- **Versions:** each on a card with its cover, what it is (main version, edition, port), its
  year and platforms; the others offer Make main and Separate (7.6).
- **Notes** are private unless I mark them public for that game.
- **Archive** takes the game out of sight, kept whole, and offers Undo (7.4).
- **Remove from library** asks once, offers archiving instead, and offers Undo.

**Done when**

- The shared-element transition runs from all four views, and its reduced-motion version is a
  short crossfade.
- A direct visit to a game's address renders the full page without the library loading first.
- A visitor never sees private notes or any edit control.
- An address for a game that is not in the library returns "not found".

### 7.4 Archiving a game

**Built 25 Oct 2026.** The owner asked on 25 Oct 2026 for "um jogo que eu quero que suma do meu
shelf, que esteja em um lugar escondido. Tipo, não quero ficar olhando pra ele pq eu não comprei
de fato. Ganhei de presente se la. Mas não quero deletar ele completamente, quero poder restaurar
ele se quiser."

Remove from library does part of that for a game a sync brought in: it waits on its platform's
card, left out, and "Put back on my shelf" brings it back, but as new, without what I had
set. For a game I added myself it does none of it: Undo lasts a day. And its name says delete.

- **Archive** (Arquivar), in the editor beside Remove from library. It takes the game off my
  shelf at once, says so, and offers Undo. It asks nothing first, since nothing is lost.
- **An archived game is kept whole:** status, rating, notes, tags, dates, copies and hours.
- **It is nowhere else,** to me or anyone: not on the shelf, the wall, the list, 3D or the
  trophy wall; not in a count, a stat, a filter's values or a smart shelf; not on the placing
  page or in the search inside the library; not on the public shelf or in an API or MCP answer.
  Its address answers "not found". To look at it again, I bring it back.
- **One place lists them:** "Archived games" on the account page, there only while one is.
  Each row has the cover, the title and the platforms, and **Bring back** (Trazer de volta),
  which puts the game on the shelf exactly as it was and says so.
- **A sync** still feeds its copies' hours, and a copy found on another platform joins it, but
  it stays archived: never back on the shelf by itself, never listed for placing.
- **Adding it again,** by search or a pasted list, finds it archived and offers Bring back, not
  a second box: an IGDB record belongs to one entry per library (ADR 001).
- **Remove from library** stays as it is. Its question names the other way: archiving keeps
  the game out of sight with everything I set, and is one button there.

**Done when**

- An archived game is in no view, count or answer, to me or anyone, and comes back exactly as
  it was.
- A sync neither puts it back nor gives it a second entry, and adding it again offers Bring
  back.
- The account page lists every archived game, and shows nothing when there is none.

### 7.5 Wishing for a game on one platform

**Built 25 Oct 2026.** The owner asked on 25 Oct 2026, of Tsukihime, on the wishlist and released
on PS4 and Switch: "eu não quero ele no ps4, eu quero ele no switch. [...] Tem como colocar que
eu desejo esse game no switch? Sei que tem a opção tenho em: mas eu não tenho, então não faria
sentido eu colocar tenho em switch sendo que ta na minha lista de desejos certo?"

Right: Platforms owned is for what I own. Until then a wishlist game had no platform of its own,
so its box took the case of the first platform IGDB lists it on, PS4's here.

- **Want it on** (Quero em), in place of Platforms owned while a game is on the wishlist: the
  platforms it was released on, as chips, and I pick one or more, or none, each saved at once.
  Adding a game as Wishlist (4.1) asks the same, and needs none. A wishlist game that has a copy
  already (a sync found it owned) shows its copies too.
- **Its box** stands in the case of the first platform I want it on, outlined as a wishlist
  game is, still on the Not owned shelf when grouped by platform. With none wanted, it is as
  before.
- **Its page and its box's name** say where I want it: "Wanted on: Nintendo Switch", and
  "Wishlist, wanted on Switch".
- **Filter:** `wanted:switch`, a list like `owned`, families included (`wanted:nintendo`).
- **When I get it,** changing its status from Wishlist turns Want it on back into Platforms
  owned, with the platform I wanted already picked, asking only physical or digital. What I
  wanted is then let go.

**Done when**

- A wishlist game wanted on Switch stands in a Switch case, says so in words, and is found by
  `wanted:switch` and not by `owned:switch`.
- Leaving the wishlist starts its first copy on the platform I wanted.

### 7.6 Separating a version

**Built 25 Oct 2026.** The owner asked on 25 Oct 2026, of Dark Souls II and Scholar of the First
Sin standing as one game: "esses jogos são dois jogos diferentes, não acho que deveriam estar
agrupados assim. [...] Se for cagar outros varios games tudo bem. Pode deixar assim."

IGDB files Scholar as an expanded game of Dark Souls II, and ADR 001 folds an expanded game into
the game it expands; a sync, which cannot ask, takes that default. The default stays: it is right
for Skyrim and its Special Edition, and for Persona 5 and Royal. What was missing is a way to undo
it for one game.

- **Separate into its own game** (Separar em outro jogo), on each version under Versions in the
  editor except the main one. It asks first, saying what goes with it and what stays, since
  joining two games back is not built.
- **The version becomes a game of its own,** titled, dated and covered by itself, in Unsorted,
  to be placed as a game a sync brings in is. It is private if the game was, and keeps the
  game's date added.
- **What goes with it:** the copies that name that version, and every store item matched to it,
  with its hours. A copy both fed (Dark Souls II and Scholar both on Steam, one PC digital copy)
  becomes two, each with its own game's hours.
- **What stays:** status, rating, notes, tags, dates, the hours I typed, and every other version
  and copy.
- **Afterwards** it says so, with Open, which goes to the new game's page.
- **A sync leaves them apart:** each store item feeds its own game, and nothing joins them
  again. Searching for the separated game finds it on the shelf as itself.

**Done when**

- Separating Scholar from Dark Souls II leaves two games, each with its own copies and the hours
  its store items report, and the first keeps everything I set.
- A copy both fed is split, and no hour is counted twice or lost.
- The next sync changes neither.

### 7.7 Playing a game

**Built in the steps of [the desktop guide](desktop.md#4-the-steps) on 25 Oct 2026: Play on
Steam in a browser, the app, Play in it, the window's own title bar, Ready to play, updates
and the installer in one step. Hours not yet.** The owner
asked on 25 Oct 2026: "quero converter esse projeto não somente em um browser mas tbm em um
projeto que vai rodar no meu computar para eu executar meus jogos direito dele, tipo o hydra
sabe. [...] Eu vou poder apontar o caminho no meu pc do game local e ele vai rodar o game, se o
game for da steam ele vai rodar o comando que executa o game pela steam." Then, choosing Tauri:
"Desde que o projeto continue mostrando todos os meus dados corretamente na versão baixada ta
tudo certo." Then, having installed it:
"* vai ter um instalador no github para as pessoas baixarem ne mas eu queria atualização
automatica, é o melhor cenario, tem como? * Tem como tirar a barra de cima nativa do windows?
queria algo mais parecido com o discord, mais integrado sabe? Sem redundacia do nome shelf
tanto na barra nativa quanto na nav bar. * No app instalado precisamos de um "filtro" que
mostre jogos instalados. Igual o botão da steam "Exibir apenas jogos prontos para jogar" * Se
possivel queria que o instalador fosse mais paracido com o do discord. Que não tem que ficar
clicando setup setup, next, next. E sim aparecesse uma splashzinha."

- **Shelf for Windows** ([ADR 005](adr/005-desktop-app.md)) is the same Shelf in a window of
  its own: the same pages, the same sign-in, the same data, served by the same server. What it
  adds is Play.
- **Play** (Jogar) is the first thing under Mine, on my own shelf only, never to a visitor.
- **In a browser,** on a computer: **Play on Steam** (Jogar na Steam), for a game the Steam
  sync brought in. It opens Steam on that game; the browser asks once whether it may open
  Steam. Nothing else: a browser cannot start a file. Not on a phone.
- **In the app,** Play starts the game:
  - a game with a file chosen for it starts from that file, in the file's own folder;
  - else a game owned on Steam, or one IGDB lists on Steam and Steam has installed here, starts
    through Steam;
  - a game owned on Steam and not installed offers **Install on Steam** (Instalar na Steam);
  - any other offers **Choose the game's file** (Escolher o arquivo do jogo): Windows' own
    picker, for an `.exe`, a shortcut (`.lnk`, `.url`) or a `.bat`.
- **The file's name** is in a menu beside Play (Formas de jogar), with **Change the file**,
  **Show in folder** and **Forget the file**; for a game played through Steam, the menu offers
  **Choose a file instead**. A file no longer there says so and offers to choose it again.
- **The files chosen stay on this computer.** Shelf's server never sees them, and another
  computer keeps its own.
- **Its own title bar.** The app's window has no Windows bar: Shelf's header is the bar, with
  minimize, maximize and close at its right end. Dragging the header moves the window, and a
  double click maximizes it.
- **Ready to play** (Prontos para jogar), on my own shelf, in the app: a button among the
  library's controls that leaves only the games I can start on this computer, as Steam's "show
  only games ready to play" does: a file chosen and still there, or a Steam app installed here.
  It is this computer's choice and stays until pressed again. Counts, filters and sorting work
  on what it leaves; with nothing ready, the shelf says so and offers to show every game.
- **Installing** asks nothing: a small window with Shelf's mark shows while it installs, then
  Shelf opens.
- **Updates come by themselves.** Each time the app starts, a small window looks for a newer
  version; it downloads and installs one, saying how far it is, then opens Shelf.
- **The installer is public,** on this repository's releases.
- **Hours,** built after Play: the time a game started from its file is open is added to its
  PC copy, as a store's hours are. A game started through Steam is counted by Steam and its
  sync, never twice.

**Done when**

- Signed in in the app, every page shows what a browser shows: the shelf in every view, a
  game's page and panel with Mine and private notes, a private game, the trophy wall, the
  placing page and the account page.
- Play starts a game from its file, from its folder, and one that needs administrator gets
  Windows' prompt.
- A Steam game starts through Steam, and nothing a page sends can start anything but a file I
  chose or Steam.
- A visitor sees no Play, and a phone no Play on Steam.
- The window has one bar, Shelf's, and Shelf's name once; it moves, maximizes, minimizes and
  closes from the header.
- Ready to play leaves exactly the games with a file that is still there or a Steam app
  installed, in every view, with counts to match.
- The installer opens Shelf without a click, and a newer release is installed at the next start
  without one.

---

### 7.8 Achievements

A game a sync brought in from Steam has an **Achievements** section, after its videos and
screenshots, asked for as the page opens (never part of the library file).

- **How far:** "34 of 50 unlocked", a bar, and 68%, rounded down, so 99.5% is never 100%.
  "All 50 unlocked" when every one is. Under it, where they are from and when: "From Steam,
  read 3 hours ago."
- **Each achievement:** Steam's artwork, its name and description, and in words whether it is
  unlocked and when ("Unlocked Oct 10, 2025", or "Unlocked, day not known" when Steam does not
  say; never a made-up date), and how rare it is: "2.1% of Steam players", Steam's own share,
  not Shelf's. Locked ones are dimmed and say "Locked".
- **Hidden ones** say "Hidden achievement" until they are unlocked, with no name or
  description, until I turn on "Show the 3 hidden ones".
- **Which and in what order:** All, Unlocked or Locked, each with its count; Steam's order,
  Recently unlocked, or Rarest first. A long list shows 30, then "Show all 120".
- **A game with two Steam apps** (a game and its multiplayer app) shows each set apart, named:
  "Half-Life 2 on Steam".
- **In Portuguese** the names are Steam's own Portuguese ones where Steam has them, and its
  English ones, marked as English, where it does not.

| State | Shown |
| --- | --- |
| Not read yet | "Not read from Steam yet. They come with the next sync." |
| No achievements | "This game has no achievements on Steam." Never "0 of 0" |
| Kept private on Steam | "Steam keeps these achievements private." Never "0 unlocked" |
| Steam did not answer | Said, and read again with the next sync; what was read before stays, "as of" its day |
| One added since the last read | Counted, but no percentage until it is read: "One achievement was added since, and is read with the next sync." |
| Steam disconnected | What was read stays, "From Steam, as of Oct 19, 2025. Steam is no longer linked, so they are not read again." |
| Could not be loaded | "The achievements could not be loaded." and **Try again** |

A private game's achievements are its own account's alone, on its page and in every total. A
shelf's achievements change no status, rating or date of mine, and say nothing about whether I
finished a game.

**Done when**

- A game's page shows its achievements, and how many are unlocked, from what Steam last said.
- A hidden achievement's details stay hidden until it is unlocked or I ask.
- Private, not read, none and failed are each said, never shown as none unlocked.
- Both languages, both themes, a phone and the keyboard work.

## 8. Data model

[ADR 001](adr/001-game-entry-model.md) is the decision; [ADR 004](adr/004-one-library-per-account.md)
gives each account a library of its own. In short:

- A **library** is an account's: its entries, tags and smart shelves. The IGDB cache is shared
  by all of them.
- An **entry** is the game as I think of it: status, rating, notes, tags, dates.
- An entry links to one or more IGDB records. One is **primary** and supplies title, cover and
  metadata. Editions, ports and remasters I fold in are the others.
- A **copy** is one thing I own: a platform plus physical or digital.
- **Playtime** is stored per source, so a sync never overwrites what I typed. A game shows the
  larger of what I typed and what its sources report together.
- A **source item** is a game a store or console listed, and what was decided about it
  ([ADR 003](adr/003-platform-sync.md)): the IGDB record it matched, and the copy it feeds, or
  "not a game", "not mine", "removed".
- IGDB data for my games is **cached** in our own database. The library never waits on IGDB.

Two additions the brief did not ask for, both small:

| Addition | Why |
| --- | --- |
| **Featured** (yes or no, per game) | Decides which boxes stand face-out. A shelf with a few covers showing reads far better than a wall of spines. |
| **Notes public** (yes or no, per game) | The library is public and notes may not be meant to be |

An entry's status is one of eight since 25 Oct 2026, with Someday and Retired (3.12); a
wishlist entry keeps the **platforms wanted** (7.5); an entry can be **archived** (7.4); and
an entry can be **private** (11.1). A game's cached IGDB data says whether the ESRB rates it
Adults Only (3.13).

---

## 9. Themes

Light, dark, and "follow my system", which is the default. The switch is in the header. The
choice is remembered, and the right theme is applied before the first paint, with no flash.

A theme is a **lighting state**, not an inversion ([research, section 4](research.md#4-physical-inspiration)):

| | Light: room lights on | Dark: room lights off |
| --- | --- | --- |
| Light source | Daylight | The LED bar behind each ledge |
| Wall | Pale cool gray | Near-black |
| Ledge | Black, strong against the wall | Black, seen by its line of light |
| LED | A thin line and a faint tint | Carries the room: a glow up the wall, a halo round each box |
| Shadows | Soft, under ledges | Replaced by light spilling under ledges |
| Covers | Evenly lit | Lit from the front as in daylight, rimmed with LED light |
| Reflection | Faint | Stronger, on the floor and ledge top |

Covers are never tinted. The LED lights the wall and the edges of a box, never the cover's
face.

**Changing theme** is itself the lighting change: about a second in which the room lights
fade and the LEDs come up, or the reverse. Under reduced motion it is immediate.

**Done when**

- Every screen is designed in both themes, and screenshots of both are part of each step's
  review.
- Every text and control meets its contrast requirement in both themes.
- No flash of the wrong theme on load, checked with the system set each way.

---

## 10. Languages

English and Brazilian Portuguese from the first build.

| Topic | Behavior |
| --- | --- |
| First visit | The browser's language decides. Portuguese gets pt-BR; everything else gets English. |
| Switcher | In the header. Changes language in place, keeping the page, filters and position. The choice is remembered. |
| Interface text | Every string comes from a translation file. None is written into a component. |
| Plurals | Per language: "1 game", "2 games"; "1 jogo", "2 jogos" |
| Numbers | `2,340.5 h` in English, `2.340,5 h` in Portuguese |
| Dates | `12 Oct 2026` and `12 de out. de 2026` |
| Alphabetical sort | Follows the language |
| IGDB data | Stays as IGDB provides it: titles, genres, summaries |
| Addresses | `/en/…` and `/pt-BR/…`. Filter keys stay English in both. |
| Screen readers | Labels exist in both languages. English passages inside a Portuguese page are marked as English. |

**Done when**

- A check fails the build if any string is missing from either file, or if interface text
  appears outside the translation files.
- Key screens have reference screenshots in both languages.
- Switching language on a filtered library keeps the same games on screen.

---

## 11. Access

| | Visitor | Another account | The shelf's own account |
| --- | --- | --- | --- |
| See a public shelf: library, trophy wall, smart shelves, game pages | Yes | Yes | Yes |
| See a private shelf | No: told it is private | No | Yes |
| See public notes | Yes | Yes | Yes |
| See private notes | No | No | Yes |
| Search IGDB | No | For its own shelf | Yes |
| Add, edit, remove games; save smart shelves | No | On its own shelf only | Yes |
| See a game marked private (11.1) | No | No | Yes |

- **Sign-up** is open to anyone: a name, a handle (the shelf's address, `/u/{handle}`), an
  email address and a password of 10 characters or more, and public or private, with Public
  picked. Three new accounts an hour from one address. No email is sent yet: no confirming,
  and no reset by email (21 Oct 2026, ADR 004). Signing up leads to the page that sets the
  new shelf up (4.6).
- **Sign-in** is an email address or handle, and the password. A wrong one is turned away with
  a plain message, and repeated tries are slowed down.
- **The account page** changes the name, the handle (the old address then leads nowhere), the
  visibility and the password; lists the archived games, while there are any, to bring back
  (7.4); signs out everywhere; and deletes the account and everything on its shelf, after the
  password.
- **Every change** is checked on the server, against the session's own account. A write never
  names a library: it acts on one's own. Hiding a button is never the protection.
- **IGDB search is for accounts**, each limited per hour, so no one spends the whole site's
  request allowance.
- **A linked platform is one's own.** Its link, what it listed and the answers about it are
  read and changed only by its account, and a platform account is linked only through the
  platform's own sign-in.
- **Edit controls are absent** for anyone but the shelf's own account, not disabled.
- Search engines may index public shelves. A private shelf, or an address with no shelf, is
  marked not to be.

**Done when**

- Every write request without a valid session is refused, tested request by request.
- Another account's ids answer "not found", for every service, tested.
- A wrong password cannot sign in.
- The public pages contain no private note text, and a private shelf's pages and files none of
  its games, checked in the page source.

### 11.1 A game only I see

**Built 25 Oct 2026.** The owner asked on 25 Oct 2026 for "outra opção de esconder o game do
publico. Não so erotic mas qualquer jogo. Tipo a opção da steam que eu posso deixar o jogo como
privado. Ou seja, so eu vejo ele no meu shelf."

- **Private** (Privado), a switch per game in the editor, under Mine: off unless I turn it on,
  and saved at once, like everything there.
- **On my own shelf, signed in, it is there as ever,** in every view, count and stat, with a
  small closed lock on the box's foot, the same mark on the wall and in the list, and "only you
  see it" in its name. In 3D the box's name says so; no lock is drawn on it. `is:private` finds
  them. Its own account's browser reads its own files for that: the public ones never carry it.
  Its address opens for its account, and the trophy wall counts it there.
- **To anyone else it does not exist:** a visitor, another account, a search engine, the public
  API, the MCP tools, `llms.txt` and the structured data. It is not on the shelf, the wall, the
  list or the trophy wall, and not in a count, a stat, a smart shelf or a filter's values (a
  developer only it has is not offered); its address answers "not found". The public shelf's
  pages and files never carry it, so it cannot be read from the page source.
- **On a private shelf** every game is already only mine. The switch is still there, and what
  it says is kept for when the shelf goes public.
- **A sync** never changes it, and the games it adds are not private.
- **The table above** has a row for it, "See a game marked private". The landing page's part 8,
  its question on who can see a shelf (15), and `/privacy` say that any one game can be kept to
  oneself.

**Done when**

- A private game's title, cover and data are in no public page, file, API or MCP answer,
  checked in the page source, and in no count or filter value a visitor sees.
- Its own account sees it everywhere, marked, in both themes and both languages.
- Switching it on or off is what a visitor sees the next time the shelf loads.

---

## 12. Screen sizes and touch

| | Phone (under 640px) | Tablet (640 to 1023px) | Desktop (1024px and up) |
| --- | --- | --- | --- |
| Shelf default | 2D | 2D | 2D; 3D is experimental (3.6) |
| Shelf layout | One shelf per screen, swipe between | Shelves stacked, ledges wrap | 2D: stacked. 3D: bays along a wall. |
| Main controls | Bar at the bottom | Row under the header | Row under the header |
| Filters | Bottom sheet | Side panel | Side panel; from 1536px, a column beside the library |
| Sort and group | Bottom sheet | Menus | Menus |
| Detail | Bottom sheet, two heights | Side panel; sheet in portrait | Side panel |
| Add | Full-screen sheet | Dialog | Dialog |
| List columns | Four | Six | All |

**Touch, designed on purpose**

| Gesture | Does | Without the gesture |
| --- | --- | --- |
| Swipe sideways on the shelf | Next or previous shelf | Shelf tabs |
| Tap a spine | Select and raise the sheet | |
| Press and slide along a ledge | Scrub through spines | Tap, or the List view |
| Drag the sheet up or down | Full detail, or close | Tap the sheet; close button |
| Swipe the sheet sideways | Next or previous game | Arrow buttons on the sheet |
| Pinch a screenshot | Zoom | Zoom buttons |

Every gesture has a plain tap equivalent. Sheets close with Back.

**Wide screens.** From 1536px the library's filters stand in a column of their own, 304px wide,
left of the shelves, and the library's page widens from 1440px to as much as 2560px, the header
and footer with it, so on a 1080p screen the shelves gain room: at 1920 they are 1496px wide, where
they were 1360. Only the library's pages widen; every other page keeps 1440px. The title and
totals head the shelves' side, so the column starts just under the header and is whole on the
first screen; it stays in view as the shelves scroll, its list scrolling inside it with a slim
scrollbar, and an edge with more of the list past it fades. The status row is not shown there:
the column's Status section, open from the start and counting, does its work. Between 1536 and
about 1785px the column takes a little of the shelves' room. The
breakpoint is where the shelves keep about as much room beside the column as a 1200px laptop
gives them, so a 1080p screen at 125% scaling has it and a 1440px one does not. Browser zoom
moves it, as it moves every breakpoint here.

**Done when**

- Each screen is reviewed at 390, 820 and 1440 pixels wide, in both themes, and the library
  at 1920 as well, with its filters beside it.
- Nothing scrolls sideways unintentionally at any width from 320px up.
- Every gesture's alternative reaches the same result.

---

## 13. Accessibility

The target is WCAG 2.2 level AA in both themes.

| Area | Requirement |
| --- | --- |
| **Keyboard** | Everything in 3.11. Focus is always visible: a 2px ring in the accent color, with an offset. Focus is never trapped except inside an open dialog or sheet, and returns to where it was on close. |
| **Shelf structure** | Each shelf is a labeled list under a heading. Each game is one item named with title, platforms, status and my rating. One Tab stop per shelf; arrows move within it. |
| **3D** | The canvas is hidden from assistive technology. The same labeled lists exist alongside it and drive it: moving focus moves the camera. A screen-reader user gets the same shelf, in the same order, in both views. |
| **Announcements** | Filter and sort changes announce the result: "42 games, sorted by my rating". Adding, removing and undo are announced. |
| **Targets** | At least 24 by 24 pixels, including spines |
| **Contrast** | Text 4.5:1, large text and control boundaries 3:1, in both themes. Text over art sits on a scrim. |
| **State** | Never by color alone ([3.2](#32-words-used-below)) |
| **Motion** | Everything has a calm version ([section 14](#14-motion)). Nothing flashes more than three times a second. |
| **Gestures** | Every swipe, drag and pinch has a single-tap alternative ([section 12](#12-screen-sizes-and-touch)) |
| **Language** | The page declares its language; English passages in a Portuguese page are marked |
| **Zoom** | Usable at 200% zoom and at 320px wide |

**Done when**

- Automated accessibility checks pass on every key screen, in both themes and both views.
- Every library scenario is completed in tests using the keyboard alone, in 2D and in 3D.
- The 2D and 3D views expose the same names in the same order to assistive technology.

---

## 14. Motion

Motion is quick and exact, like a console's home screen: things snap to attention and settle.
Nothing bounces.

| Name | Length | Used for |
| --- | --- | --- |
| Instant | 100ms | Press feedback |
| Quick | 180ms | Hover, focus, chips |
| Base | 280ms | Panels, sheets, menus |
| Slow | 480ms | A box lifting, sliding, turning; the LED changing color |
| Cinematic | 800ms | Camera moves, the 2D and 3D switch, theme change |

Only position, scale, rotation and opacity are animated.

**Each animation and its calm version**

| Animation | Full | Under reduced motion |
| --- | --- | --- |
| Shelf loads | Boxes arrive in a stagger | Appear together |
| Hover or focus | Box comes toward you; the LED glides to its color | Outline; the LED changes color at once |
| Pull | Slide, turn, camera moves in | 200ms crossfade to detail |
| Reorder | Lift, slide, settle | 150ms crossfade |
| 2D and 3D switch | Wall tilts and gains depth | 200ms crossfade |
| Theme change | Room lights and LEDs trade places over a second | Immediate |
| Camera travel | Eased glide | Jumps to the destination |
| Depth on scroll | Layers shift | None |
| Stat numbers | Count up | Final value shown |
| Sheets and panels | Slide in | Fade in |

Reduced motion follows the system setting. Smooth scrolling is never applied to touch or under
reduced motion.

---

## 15. Landing page

A product page, for people who have not made a shelf yet (ADR 004): what Shelf does, shown
working, part by part, with one call to action, **Create your shelf**. It is built from an
**example shelf**, labelled as one: 61 games from the sample library, real IGDB covers, with
what was done with each invented (`pnpm landing:demo`). No account's games are ever on it.

| Part | What happens |
| --- | --- |
| **1. Arrival** | "Every game you own, on one shelf.", a line on physical and digital, every console, and the call to action. Beside it (under it, on a phone) three bays of real covers in near darkness; their lights come on bay by bay, once, with the flutter of a tube catching. |
| **2. Ask it anything** | The example shelf and the real filter language. As it comes into view, three filters switch on in turn, "Not started", "Under 10 hours", "On Switch", and the boxes rearrange for each: 61, 26, 6, 3. Then it is the visitor's: a filter on or off, or typed. |
| **3. One game, every copy** | One game owned three ways, each copy in its platform's case, then the one box the shelf stands, with its count of copies. |
| **4. Add in seconds** | A search typed letter by letter and the games it finds; a pasted list and the game each line matched. |
| **5. Bring your Steam library** | Games arriving from Steam one by one, each with its hours, then the count, and "Again tomorrow, by itself". |
| **6. Shelf, wall or list** | The same games three ways, turning by itself until the visitor picks one; covers travel between the shelf and the wall. |
| **7. How far you got** | A glimpse of the trophy wall: its stats counting up (finished, this year, hours, the average rating), over the example shelf's latest year of trophies, each under its own light. |
| **8. Yours to show, or to keep** | Public or private, as sign-up offers them, and that notes stay private unless marked public. |
| **9. Your AI assistant** | A conversation: asked for something short, not started, on the Switch, it answers from the shelf (section 17). |
| **10. The close** | An empty lit shelf, "Your shelf is waiting.", the call to action again, and five questions: free, where game data comes from, bringing in games one already owns, who can see a shelf, taking the games away. |

- **Signed in**, the call to action is **Go to your shelf**.
- **Motion** is the product's own: lights, boxes rearranging, numbers counting. Parts rise into
  place as they scroll into view, by CSS where the browser ties animations to scrolling, and
  by a small script elsewhere. Only opacity and position move.
- **Under reduced motion** nothing plays by itself. Each part is there as it ends.
- **Nothing moves the page.** A part that rearranges or turns keeps the same room throughout.
- The page is built ahead whole. Nothing on it asks the server anything, and no 3D code loads.
- **A link to it** shows its first screen in the dark, in the link's language: the eyebrow,
  the headline and the lit shelf (`pnpm landing:share`).
- **It follows the product.** Every later step that adds something a visitor would choose
  Shelf for adds its part here, and a step that changes what a part shows changes the part.
  Step 9's trophy wall, for one, turned part 7 into a glimpse of the wall itself, and the
  Steam sync added part 5.

**Done when**

- The page scores 90 or more on Lighthouse for mobile.
- Its call to action leads to sign-up, and works before any script has run.
- Every part reads the same in both themes and both languages, at every width.

---

## 16. Speed targets

| Measure | Target |
| --- | --- |
| Lighthouse, mobile, landing and library | 90 or more |
| Largest contentful paint, mobile | Under 2.5s |
| Response to input | Under 200ms |
| Layout shift | Under 0.1 |
| Filter or sort change, 1,000 games | Under 50ms |
| Animation | 60 frames per second |
| 3D shelf, 500 games, mid-range laptop | 60 frames per second |
| 3D code on a page that has not opened 3D | None |
| Lists of 1,000 or more | Only visible rows are rendered |

Covers come from IGDB's image servers in the size each view needs, with a blurred color
placeholder first. Fonts are subset, preloaded, and never block text from showing.

---

## 17. For AI assistants

| Piece | What it gives |
| --- | --- |
| **A typed core** | The rules for library, games, filters and sorting live apart from the interface, so the app, the API and an assistant all get identical answers |
| **A documented API** | Read the library with any filter, sort and grouping; read one game; read the available filter values |
| **An MCP server** | The same as tools: search a public shelf by its handle, apply filters and sorting, read a game; signed in as an account, the same on its own shelf, and add a game, change a status |
| **The filter language** | One line of text an assistant can write and a person can read ([5.3](#53-the-filter-language)) |
| **`llms.txt`** | What the site is and where its data lives |
| **Structured data** | Each public page describes itself to search engines: the site, the collection, each game |

Reading a public shelf is open, as it is in the browser. Adding and changing need the same
sign-in as the interface, and act on that account's own shelf.

---

## 18. Out of scope

Not built now. The design leaves room for each.

| Later feature | What already makes room for it |
| --- | --- |
| Export and import, backups | Stable ids; every table holds plain data; filters are text |
| Importing from the reference app | Entries link to IGDB ids, which the reference app also stores |
| PlayStation, Xbox and Nintendo sync | Steam is built ([section 4.4](#44-from-a-store-or-console)). The others plug into the same matcher and memory; how each is read: [ADR 003](adr/003-platform-sync.md) |
| Offline use | The library is one loaded data set filtered on the device; the desktop app ([section 7.7](#77-playing-a-game)) shows the hosted Shelf and needs the internet, and its guide lists playing offline as a later step |
| Games not on IGDB | A game record does not require an IGDB id |
| Editions and regions | A copy can already name its exact version; region is one more attribute |
| Merging two entries | A row move in the model, as separating a version is ([section 7.6](#76-separating-a-version)) |
| DLC, replays, subscriptions | Noted in ADR 001 |

---

## 19. Decisions I made for you

Each is a default you can overturn. None blocks Phase 3.

| # | Decision | Alternative |
| --- | --- | --- |
| 1 | ~~Visual direction is Vitrine~~ Overturned: the direction is Backlit, with covers facing out ([ADR 002](adr/002-visual-direction.md)) | |
| 2 | Ports and editions join the existing entry silently; remasters and expanded editions ask, defaulting to "same game"; remakes ask, defaulting to "separate" | Different defaults per kind |
| 3 | Notes are private unless marked public per game | Public by default |
| 4 | A "featured" flag keeps chosen games cover-out in the compact option, where the rest stand spine-out | No featured games, or automatic (top rated) |
| 5 | Two extra sorts: time to beat, and color | Only the nine in the brief |
| 6 | On a phone, a tap raises a preview sheet first; a second step opens full detail | Tap opens full detail directly |
| 7 | A compilation box is one entry | Split into its games |
| 8 | Addresses carry the language (`/en`, `/pt-BR`) | No prefix for English |
| 9 | Search engines may index the public pages | Ask them not to |
| 10 | My rating is out of ten, in half steps | Five stars, or out of 100 |
| 11 | DLC is not tracked | Track it under its game |
| 12 | In 3D the wall runs sideways and the camera walks along it; in 2D on desktop the page scrolls down | The same direction in both |
| 13 | Franchise and series are separate filters, as in IGDB | Merge them |
| 14 | The library opens grouped by platform, sorted by title | Ungrouped, newest first |

Made on 25 Oct 2026 for the five sections not built yet (3.12, 3.13, 7.4, 7.5, 11.1):

| # | Decision | Alternative |
| --- | --- | --- |
| 15 | Someday and Retired are in the status row only while a game has one | Always there |
| 16 | A retired game is out of the share of finished games altogether | Counted as finished, or as dropped |
| 17 | Archiving asks nothing and offers Undo; removing still asks | Both ask |
| 18 | An archived game's address is not found, to me too: I bring it back to look at it | Its own account sees its page, marked archived |
| 19 | Adult is IGDB's Erotic theme or the ESRB's Adults Only | Also IGDB's keywords for sexual content, or a mark of my own per game |
| 20 | Hiding adult games is per device, and off until turned on, for visitors too | Per account, or on by default for visitors |
| 21 | Nothing counts the hidden adult games, and from 28 Oct 2026 nothing on a shelf is a sign of them: the switch is on the account page | Say how many are hidden |
| 22 | IGDB's results when adding a game are not hidden: they are not the shelf's games, and it is me typing | Hidden too, which needs every result's themes and age ratings |
| 23 | A wished game stays on the Not owned shelf, in the case of the platform I want it on | It stands, outlined, on that platform's shelf |
| 24 | A wish names platforms, not physical or digital | The format too |

Made on 25 Oct 2026 for separating a version (7.6):

| # | Decision | Alternative |
| --- | --- | --- |
| 25 | A separated game starts Unsorted, with nothing of mine on it but its copies | It takes the status of the game it left |
| 26 | Separating asks first | Undo, which needs joining two games, not built |
| 27 | A sync still folds an expanded game into the game it expands | Expanded games stand apart unless I join them |
| 28 | Only the version I pick moves, not versions of it | Its editions and ports go with it |

Made on 25 Oct 2026 for a game's videos (7.1):

| # | Decision | Alternative |
| --- | --- | --- |
| 29 | A video's tile shows one of the game's own screenshots, so a page reaches YouTube only when a video is pressed | YouTube's own thumbnail, fetched from YouTube on every visit |
| 30 | A video plays over the page, in YouTube's privacy-enhanced player | A link out to YouTube |
| 31 | At most six videos a game, in IGDB's order | All of them |

Made on 25 Oct 2026 for playing a game (7.7), with the owner's choice of Tauri:

| # | Decision | Alternative |
| --- | --- | --- |
| 32 | The app opens the hosted Shelf, so it shows exactly what the site does | A copy of the site inside the app, with a server of its own |
| 33 | A game's file is kept on the computer that chose it, never on the server | Kept with the account, for every computer |
| 34 | In a browser, Play on Steam only for a game the Steam sync brought in | Also for a game IGDB lists on Steam, which may be owned elsewhere |
| 35 | A chosen file wins over Steam | Steam first, for a game owned there |
| 36 | The app counts hours only for games it starts from a file | Every game it starts, Steam's too, which would count them twice |
| 37 | Windows only, at first | Mac and Linux too, untested |
| 38 | The installer is not signed, and Windows warns once | A signing service, open to individuals in the USA and Canada only |
| 39 | Shelf's header is the app's title bar | Windows' bar above the header, and the name twice |
| 40 | Ready to play is this computer's choice, kept on it | A filter in the address, which means nothing on another computer |
| 41 | Installers and updates are releases of this repository, made public by the owner | A public repository of installers only, the code staying private |
| 42 | The app looks for an update as it starts, and installs it before opening Shelf | Asking first, or updating while Shelf is open |
