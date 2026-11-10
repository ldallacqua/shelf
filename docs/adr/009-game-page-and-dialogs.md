# ADR 009: A game is a page, with my library beside it, and what a menu opens is a dialog

- **Status:** accepted, 9 Nov 2026: proposed by the owner, this record is the research and the details,
  which the owner accepted as written, the proposals in the open questions at the end with them. Built in
  four phases; each says below what it found.
- **Date:** 9 Nov 2026
- **Decides:** how a game is opened (always its page), what stands beside it (my library, as a list), how
  anything chosen in a menu is shown (a dialog, never the menu grown), and how a game's Saves says what it
  has to say with less
- **Replaces:** spec 7.2's panel, frame and sheet over the shelf; the sheets and the beside-Play popover of
  spec 7.10 and 7.12

## Context

A game is shown three ways today (spec 7.2): a panel at the window's edge, a frame centered over the shelf
on a very wide window, and a full page when opened directly. What it opens stacks on top: Play's ⋯ menu
offers Saves and Find a download, and choosing one turns the menu's place into a 36rem panel beside Play
(on a very wide window) or a second sheet over the first. So a game's Saves is a popover, grown out of a
menu, over a frame, over the shelf.

The owner, after using Saves on the 4K TV:

- "the game save backup screen might have too much information. It's not too direct, it explains a lot
  that might not be relevant to most people. They want it to work."
- "we click the three dots it opens a menu, when you choose one option in the menu it overwrites the menu
  content basically with a bigger content. and all of this is already inside a modal / frame."
- Their idea: clicking a cover opens the game's full page; a list of my other games on its left, as
  Steam's library and Hydra have, with a simpler filter than the library's; ⋯ stays a menu, and choosing
  an item opens a dialog; drawers go; one header size; "similar to the other stores but ... better.
  visually speaking and semantic speaking. steam looks very outdated and hydra looks too unbaked."

### What the guidance says

- **A popover is for a little, and never grows another view.** Apple: "Use a popover to expose a small
  amount of information or functionality", "Never show a cascade or hierarchy of popovers", "Don't show
  another view over a popover", and "Avoid making a popover too big" ([HIG, Popovers][hig-popovers]).
  Saves breaks all four.
- **No modal over a modal.** Stacked modals hide the context they came from, make Back and Escape close
  several layers, and trap focus; the alternatives are a step inside the same surface, a side panel, an
  inline reveal or a page, so a person can go "out and back" without losing their place
  ([Smart Interface Design Patterns][nested]). Design systems allow two levels at most
  ([Infor][infor]).
- **A long list beside its detail is list/detail.** Microsoft recommends it "to locate and prioritize a
  large collection of content": side by side from 641 effective pixels, stacked (one pane at a time, the
  detail reached and left like a page) below ([Windows, List/details][ms-list]). Android's canonical
  layouts do the same at its expanded width ([Android, canonical layouts][android]).
- **Show first what most people need.** "The very fact that something appears on the initial display tells
  users that it's important"; the rest goes behind a clearly named control, two levels at most
  ([NN/g, Progressive disclosure][nng-pd]).

### What other launchers do

- **Steam:** a library list on the left, collections that fold, a search and a few filter icons; the
  game's page beside it; **Cloud status** ("Up to date", "Syncing", "Unable to sync") beside Play; the
  cloud's switch is one checkbox in a Properties window, apart from the page ([PC Gamer][pcgamer],
  [Steam Community][steam]).
- **Hydra** (the owner's screenshot): the same list on the left, a back arrow and the game's title above a
  wide hero, **Salvamento em nuvem** as a button on the hero that opens a dialog, **Gerenciar** another.
- **GOG Galaxy 2.0:** a game opens as a page of its own, with back and forward working everywhere
  ([PCWorld][galaxy], [Neowin][neowin]); per-game settings in a dialog from "More".
- **Xbox:** before a game starts, one sentence ("Your previous device is still uploading your game
  save"), one line of advice, where and when it was last played, a progress bar, two buttons
  ([Windows Central][xbox]). Its Game Saves dialogs each say one thing and offer two or three actions
  ([Xbox, Game Saves dialogs][xbox-dialogs]).
- **Nintendo Switch:** two switches for the whole console, automatic backup and automatic download
  ([Nintendo][nintendo]).
- **Heroic** shows "Save Sync" status on the game page and puts the save path inside a section of the game's
  settings that is folded until opened ([Heroic][heroic]).

What none of them puts in front of a person who only wants it to work: where on disk the saves are, which
database said so, how many snapshots are kept, or a paragraph about what the feature does once it is on.

## Decisions

### 1. A game is always its page

Choosing a game anywhere (a cover on the shelf or the wall, a row in the list, a search result) goes to
its page, `/u/{handle}/game/{slug}`, with an address of its own. The panel, the centered frame and the
phone's sheet go. Back returns to the library as I left it: its arrangement, filters and scroll (issue
149's lesson: the arrangement is read again on arrival).

The cover growing out of the shelf into the hero (spec 7.2) stays where the browser can do it, as a view
transition between the two pages, the cover as the shared element; where it can't, the page simply
changes. Phase 1 confirms it in this Next.js and React, and the record says what was found.

### 2. My library beside it

From 1024px wide, the page has a column on its left, about 18rem, with my library as a list, as Steam,
Hydra and Galaxy have it, so another game is one click away and the shelf is never lost:

- **At its top:** the way back to the library (the shelf, as it was), then a search box.
- **The list follows the library's arrangement:** its grouping as headings that fold, with their counts (as
  Steam's collections), its order, and its filters. A filter carried from the library shows as one chip
  that clears it. The "simpler filter" is that: search, and the grouping, chosen in one menu (none,
  status, platform); everything else stays in the library's own panel. In the app, Ready to play is a
  third choice, as Steam has its "ready to play" icon.
- **A row** is the game's small cover and title; the open one is marked (`aria-current`) and scrolled into
  view. Arrow keys and the next and previous buttons follow the same list (spec 7.2's order).
- **It stays put between games:** it lives in the layout around the page, so its scroll and search survive
  going from one game to the next; only the page beside it changes.
- **Large libraries:** only the visible rows are drawn, and the list reads the light fields the library
  already reads (title, cover, status, platform), cached; the page's own data is read beside it, so it
  never waits for the list.
- **Narrower than 1024px**, and on a phone, the page stands alone with its way back (list/detail's stacked
  style). A visitor to someone else's shelf sees the same, with only what they may see.

Visually it is Shelf's, not a file manager's: the covers are the rows' faces, a group's heading reads as a
shelf's label, the open game as a box pulled forward. The design pass in phase 2 starts from the library's
own parts.

### 3. A menu's item opens a dialog

⋯ stays a menu of short items. Choosing one closes the menu and opens a **dialog** centered over the page:
Saves, Find a download, and anything after them. With the game a page, the dialog is the only layer, and
Escape or its close button goes straight back to the page.

There is one dialog component. On a phone it rises from the bottom and fills the screen, as Apple's
popovers become sheets in compact widths ([HIG][hig-popovers]); it is the same component, so drawers as a
separate pattern go: Add a game, Save as a shelf, the shortcuts, the library's filters on a narrow window,
Saves and Find a download all become it, and `src/ui/sheet.tsx`, `beside-play.tsx` and the centered-frame
code with them.

### 4. One header

The page has no frame of its own, so the header is the same on every page.

### 5. Saves, simpler

Most people want three answers: is it on, are my saves safe and where, and can I go back. Everything else
is for when something is wrong, or for the curious, and moves one step back.

- **Beside Play, once it is on:** a small button with the state in a few words, as Steam's Cloud status:
  "Saves in Google Drive · 11 h ago", "Saves waiting to go", "Choose which saves to keep" (drawn as a
  warning). It opens the Saves dialog. Off, Saves is only in ⋯, to turn it on.
- **The dialog, top to bottom:**
  1. **The state, in one sentence, with where and when, and the one action that fits it:** "In step with
     Google Drive, backed up 11 hours ago" and Back up now; "Another computer has newer saves" and Use
     them; the choice's two cards (unchanged). While something is being done, the progress bar stands
     here instead.
  2. **The switch,** one line. The paragraph about what it does shows only while it is off.
  3. **History** (today's Snapshots; "snapshot" is a word most people don't use): the newest three, each
     one line, when and which computer, with this computer's and the place's marks as icons that say
     themselves in a tip; Restore on each. "All 12" opens the rest.
  4. **Where the saves are,** folded into one line ("1 folder · 38 files · 2 MB") with Change. Opened, it is
     today's section unchanged: the folders, Add a folder, the game's folder, "not this game", the
     registry's note, and the credit to PCGamingWiki and the Ludusavi manifest, which the list's terms ask
     for. It opens by itself when nothing is found, as then it is the task.
- **What leaves the dialog:** the limits ("up to 20 snapshots of up to 500 MB"), which are Settings' and stay
  there, and the place's line at the bottom, which the first sentence now says.
- **Nothing is lost:** every action of today is in the dialog or one fold away, never two.

## Phases

1. **A game is a page.** Covers, rows and results go to the page; Back restores the library; the morph as a
   view transition where it can be; the panel and frame go; one header. Spec 7.2 rewritten.
2. **My library beside it.** The column, its search and grouping, drawn rows only, keys; stacked below
   1024px.
3. **Dialogs.** The one dialog, phones included; ⋯'s items open it; every sheet becomes it.
4. **Saves, simpler.** The state beside Play and the dialog as section 5 says. Spec 7.12 rewritten.

Each phase has its design pass first (AGENTS.md), its stories, and `pnpm desktop:check`'s steps where the
app is concerned (Play, Ready to play, Saves).

## What each phase found

### Phase 1, a game is a page (9 Nov 2026)

- **The morph stays, as the browser's view transition, not React's.** Next.js 16.4's guide pairs
  `<ViewTransition name>` on both pages, but that names every box on the shelf, and the browser takes a
  picture of each named element in every transition. `morph.ts` names the box's cover and the page's
  cover for the one transition, as it did for the panel. The move is the router's, in its own time, so
  the transition holds the shelf's picture until the page is drawn; a page not drawn within 300 ms gets
  no flight, and the line across the top follows it instead.
- **The page is drawn at once, from the library.** A move to a page the server builds waits on the
  server: in development the whole page came in one answer, after about 250 ms, and the screen held
  still meanwhile. The library knows the game's cover, title, status and copies, so it hands the page
  a drawing of them (`hand-off.tsx`), which the page's Suspense fallback shows until the server's page
  replaces it where it stands. The drawing's code is fetched as a game is reached for, as the panel's
  was, so the game's page carries none of it.
- **Only once the router knows the page's frame** (found on production, the day phase 1 shipped).
  Until the router has had one game page, it waits for the server's whole page, and a game page not
  built yet took 2.5 s there: the owner saw a first game open after one to three seconds, behind a
  cover that flew toward nothing. The library asks for the frame while it is idle, from the one game
  page every build makes, which costs the server nothing and carries no game's art; any game page
  teaches the router the frame for all of them. A game's own prefetch, on the press, would bring its
  whole page, art and all, and only a moment ahead.
- **A game's address is the game's alone.** It kept the library's arrangement (`?view=wall`) for the
  way back and for phase 2's list. On Vercel a page built ahead answers without the query it was asked
  with; the router takes that for a wrong guess of the route and stops guessing it for the rest of the
  visit, so from the second game on every click waited for the server, one to four seconds. Back
  keeps the arrangement anyway; the Library link from an address opened directly leads to the library
  as this device last arranged it. **Phase 2's list cannot read the arrangement from the game's
  address:** the library hands it over, as it hands over the drawn page.
- **Back needs nothing of ours.** With Cache Components the router keeps the last three pages in the
  document, hidden (React's Activity), so Back shows the library as it was, scroll and all. Its
  effects run again as it shows, which puts focus back on the box. The page's Library link is Back
  when the library is the page before (`window.navigation`), and a link to the library otherwise.
- **One header.** From 96rem wide the game page takes the library's width, so the header stands
  the same on both; the game's own parts keep their 90rem measure inside it, centered, until phase 2
  puts the list at the column's left.
- **3D** pulls the box as before, with a bar under it (title, status, platform, **Open**, **Put it
  back**, and Escape); the pulled box chosen again opens the page.
- **Next and previous** go with the panel, and come back with the list in phase 2.

### Phase 2, the library beside the game (9 Nov 2026)

The list lives in `game/layout.tsx`, outside the changing slug. It uses the same library file,
filter evaluator and arrangement as the library; the library hands its arrangement over in memory,
never in a game's address. Small covers, folding headings, search and one carried-filter chip follow
Steam's library list and the list/detail guidance above. No design-review skills were installed;
keyboard access, focus, narrow layouts and concise labels were reviewed directly.

The column is 17rem at 1024px and 19rem from 1280px. The game uses container queries so the
remaining width, rather than the whole window, decides its layout. Rows are windowed with overscan;
Up/Down and Home/End draw the target row before focusing it. The current game has `aria-current`.
Search, folds and scroll survive game changes. A fresh move from the library starts its arrangement
again. Ready to play is available only on one's own shelf in the desktop app.

Previous/Next replace the current history entry, while choosing a row adds one. The Library link
walks back through consecutive games of the same shelf. Below 1024px there is no column; a game
opened from the library retains stepping, while a direct visit does not fetch the list. Loading,
failure, empty, filtered and long-list states have stories. Menu dialogs and the simpler Saves
screen remain phases 3 and 4.

### Phase 2 follow-up: aligned controls and focus on the game

The owner's desktop screenshots showed navigation, grouping and Ready to play competing in one
short row. Navigation now stands above search, with grouping and Ready to play aligned beneath
it; the play filter is last. Spotify's sidebar separates navigation and collection filters
([illustrated guide](https://community.spotify.com/forum/en/discussion/5571855/new-your-library-sidebar)),
which was inspected in a browser. Its collapsing behavior is a reference, but Shelf keeps an
explicit, labeled Hide list / Show list control in the game's top row, outside the column.
The same button remains focused and available in either state. The list remains mounted so its
search and folds survive; the existing device-preference script applies visibility before paint.
No design skills were installed. Controls have browser, desktop, selected and ungrouped stories;
visibility has interactive shown and hidden stories, using both language/theme toolbar choices.

### Phase 2 follow-up: a row never waits for the router (10 Nov 2026)

The owner saw a click in the list wait for the whole next page, twice, at what seemed random: the
stall phase 1 fixed, back. Next.js 16.4's router draws a page it has not fetched only by guessing
its route from one it has (`optimistic-routes.js`), and it keeps what it learned for
`staleTimes.static`, five minutes from the moment it learned it, with nothing that renews it
early. A server action that changes the library (adding a game from the header) throws it away
too. After that, the next game the router hasn't seen is a route it doesn't know: it asks the
server for the whole page and holds the one shown until that comes, one to four seconds on
production. The next click is quick again, as that answer taught the route afresh. Reproduced
against `pnpm serve:test` with the page's answer held 2.5 s: at once, then 2.6 s six minutes
later, both from the library and on a game's address opened directly; the shelf itself behaves the
same way after five idle minutes.

Asking for the frame again on a timer cannot close the gap, since the router keeps a guess it still
has and only learns again once it has expired. So the list no longer depends on it: when the router
hasn't drawn the game within 100 ms (`SOON_MS`, well inside the cover's 300 ms), the layout around
the games draws the handed-off page itself (`Arriving`, in `hand-off.tsx`), keeps the page being left
hidden as the router keeps a page behind (Activity), puts the top in view, and marks the row, until
the router lands anywhere, history moves, or the games are left. A router that knows the route
draws the page first, and the layout draws nothing. The address follows when the server answers.
`Arriving` reads the address only while a game is on its way, so the layout is still built ahead
whole.

### Phase 3, one dialog (10 Nov 2026)

`src/ui/dialog.tsx` is the one dialog, on Radix's, which already held focus for the sheets: centered from
640px, as tall as its content up to the window less 2rem, at one of four widths; below 640px the whole
screen, risen from the bottom. Primer's dialog guidance, read for this phase, is the model: a safe area
round a centered dialog, a title and a close button that are always there, a body that scrolls between
them and a foot with a rule, and on a narrow viewport the full screen for anything with a field
([Primer, Dialog][primer]). Apple's sheets add "Display only one sheet at a time" ([HIG, Sheets][hig-sheets]),
so a restore's question inside Saves is asked in its row (`ConfirmInPlace`), Cancel first and Escape its
answer, and no longer as an alert dialog over the dialog. Nothing drags it, so it has no grabber.

Saves, Find a download, Add a game, Save as a shelf, the shortcuts and the library's filters under
1536px are dialogs now; the filters' column beside a wide library stays. The sheet, the beside-Play
popover and the centered frame's variants and constants are gone. A menu's item closes the menu as the
dialog opens; the menu does not take focus back, and closing the dialog puts focus on the menu's ⋯
button, as the item has gone. The accessibility-review skill's WCAG checklist was run on the primitive
and its stories, seen at 375, 1280 and 2560px wide in both themes and languages: its text pairs are
already in the token contrast test, focus order, Tab and Escape have tests, its buttons are 40px (44 by
touch), and at 200% zoom a laptop crosses into the phone layout at 640px. Not checked: a real screen
reader, a phone's own keyboard on a device, and Android's Back, which leaves the page rather than
closing a dialog. Material's guidelines could not be read: the browser pane was hidden, and that page
draws only with script.

### Phase 4, Saves with the important first (10 Nov 2026)

`saves-standing.ts` turns the app's answer into one standing, in the order that matters: a choice
waiting, newer saves, a place that can't take them (signed out, full, out of reach), backups waiting on
this computer, nothing found, changed, kept. The dialog's first sentence and the words beside Play are both
drawn from it, so they never disagree, and neither says a backup reached a place it is still waiting to go
to. The switch is one line, its explanation only while off; History shows three, then All; where the saves
are is one line that opens by itself when nothing usable was found. The limits and the place's line left
for Settings. "Snapshot" is "backup" and "history" in both languages' words, Settings included, as the
third open question proposed; the app's own Windows notifications kept the old word until a desktop
release, which this phase didn't make (0.18.0 did, 10 Nov 2026).

The status beside Play needs no new command: the app's `game_state`, read every few seconds already, says
whether a game's saves are on, and an app too old to say shows nothing. Reading the saves themselves lists
the place's backups, which may mean asking Google Drive, so it is done once as the page shows the button
and again after each sync, never on a timer. The dialog and the button share the latest answer in the
dialog's module, so what is done in the dialog shows beside Play without another read; the button's code
comes with the dialog's, fetched only in the app.

Steam's Cloud status beside Play and Xbox's one-sentence save dialogs were the models; the states (off,
first setup, this computer only, in step with a service or a folder, waiting, newer elsewhere, a choice,
signed out, full, out of reach, loading, a failed read, progress, a restore's question and a long history)
each have a story and the meaningful ones a test. Not checked: a real Google Drive or OneDrive, and the
owner's own saves, which no check may touch.

### After phase 4: one way of labelling, and Play's own line (10 Nov 2026)

The owner, looking at a game in the app: each section's heading had a face of its own, and Mine was the one
section whose title shared its line, with Play, which the saves' state then made wrap. Measured, the page
had three: the sections' small mono capitals, and inside Mine bold Archivo for groups and medium Archivo
for fields, both louder than "Mine" above them, while a visitor's Mine and Details used the capitals.
Foundations already said it: Martian Mono does numbers and labels. Mine's labels are the page's now, and a
property panel's quiet labels are what Linear's and Steam's sidebars use, so the chips, the number and the
hours are what stands out. Play has a line of its own under the heading, as Steam's play bar is under its
art: Play and its menu, then the saves' state as one of that bar's figures, "Saves" over "Google Drive ·
11h ago". In the app the line is kept from the first paint.

The same day, why Steam almost never asks about saves: another computer's newer backup is no question,
and never was one Play asked, but the words said "Newer saves found" with **Use them** behind a question.
They say now that Play brings them, and the button asks nothing.

`pnpm desktop:check` then caught a click on Play's ⋯ opening Saves: Radix opens a dropdown on the
press, the menu came up under the pointer before it was let go, and the release chose the item there,
as a person's click could. In every menu (`src/ui/dropdown-menu.tsx`) a release chooses an item now only
when the press was in the menu too; it still opens on the press, and from the keys as before. And a real case asked when it shouldn't:
after more backups on one computer than it keeps, the other's last snapshot was pruned, and the cut line
was a choice. ADR 008's section 5 takes the one head then, when nothing changed here.


- One way to show a game, one way to show what a menu opens: less code, and no layer over a layer.
- Every game has its address whatever opened it, so a link, a bookmark or a back button lands where I was.
- The shelf is a page I go back to, not a backdrop; the list beside the game is what keeps it close.
- The game page reads my library's list as well as the game: a cost to watch in the page's JavaScript and
  Lighthouse budgets, kept small by drawing only the rows in view.
- `pnpm desktop:check` reads the game as a panel today, and its Play and Saves steps change with each phase.

## Open questions for the owner

1. **The 3D shelf.** Today a box pulled from it stays out, with the game's panel beside it (spec 7.2: "In
   3D it stays a panel, for the pulled box to stand beside"). Proposed: in 3D, a click pulls the box as now
   and shows its title with **Open**, which goes to the page; a second click on the pulled box does too.
2. **The list's width and start:** 18rem from 1024px wide is the proposal; the owner's TV at 2560px wide has
   room for more, and a wider list could show each game's status and hours, as Steam's doesn't.
3. **Words:** "History" and "backup" for "snapshot" in the app's words, in both languages.

## Not chosen

- **The game in a panel, with Saves as a step inside it** (back arrow to the game): one layer instead of
  two, but three ways to show a game stay, and so does the header's second size.
- **The page over the library as a modal with its own address** (an intercepted route): the same layer
  over the shelf as today, and every dialog from it a second layer.
- **A Saves page of its own** (`…/game/{slug}/saves`): a page for what is usually one glance and one
  button.

[hig-popovers]: https://developer.apple.com/design/human-interface-guidelines/popovers
[nested]: https://smart-interface-design-patterns.com/articles/the-case-against-nested-modals/
[infor]: https://design.infor.com/patterns/interactions/dialog/
[ms-list]: https://learn.microsoft.com/windows/apps/design/controls/list-details
[android]: https://developer.android.com/design/ui/mobile/guides/layout-and-content/canonical-layouts
[nng-pd]: https://www.nngroup.com/articles/progressive-disclosure/
[pcgamer]: https://www.pcgamer.com/download-steam-cloud-saves-sync-issue
[steam]: https://steamcommunity.com/discussions/forum/1/3271310952924677432
[galaxy]: https://www.pcworld.com/article/605372/gog-galaxy-2-0-is-a-must-have-app-to-organize-all-your-pc-games.html
[neowin]: https://www.neowin.net/news/gog-enhances-its-galaxy-20-closed-beta-with-the-euporie-update---heres-whats-new
[xbox]: https://www.windowscentral.com/gaming/xbox/xbox-more-games-stream-your-own-game-cloud-save-status
[xbox-dialogs]: https://devdocs.xbox.com/build/core-features/common/game-save/game-saves-dialogues
[nintendo]: https://nintendo.com/au/support/articles/how-to-enabledisable-automatic-save-data-backups-and-downloads
[heroic]: https://www.answeroverflow.com/m/1420120237180846110
[primer]: https://primer.style/product/components/dialog/guidelines/
[hig-sheets]: https://developer.apple.com/design/human-interface-guidelines/sheets
