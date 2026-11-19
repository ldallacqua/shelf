# 01 The library

Step 10's second screen, after [the pilot](00-sign-in-up.md). Captured on 56e59c2, 15 Nov 2026, plus the library's
new scenes in `scripts/ui-capture.ts` on the branch `review-01-library`, with `pnpm ui:capture library library-mine
library-wall library-list library-banners library-empty` against `pnpm serve:test`:

- `library` (a visitor at `/u/sample`, 230 games): `open`, `filters` (a dialog below 1536px; at 1920 the filters stand
  beside the library), `filtered` (`?q=genre:rpg status:backlog`), `no-match` (`?q=zzzz`), `sort-menu`, `grouped`
  (`?group=status`);
- `library-mine` (signed in as its owner): `open`, `filtered`;
- `library-wall`, `library-list`, `library-banners` (a visitor): `open`;
- `library-empty` (a new account's own empty shelf): `open`.

Each at 320, 390, 640, 820, 1024, 1440 and 1920, with 390 and 1440 in both themes and both languages. No scene
failed and no console error.

Lenses run: critique, accessibility (WCAG 2.2 AA) and words, one after the other, by one Claude Code agent (the
`ui-review` subagent). The Design plugin's skills weren't available in this session, so each lens followed
[the procedure's](../ui-review.md) checklists by hand. Where the pictures couldn't settle a question, it was
checked live with headless Playwright scripts against the same server, kept outside the repository. Those checks
covered 400% zoom (320 by 256), a short phone (320 by 568), Shift+Tab under the sticky header, the phone's Tab
order, what overflows at 640 and 320, the list's columns at every width from 640 to 1920, contrast that axe left
"incomplete", the sort menu and the filter dialog.

axe-core found two rules, both in `library/sort-menu` and both false positives (finding 27). The pilot left two
checks for this screen, and both fail. Shift+Tab under the sticky header breaks 2.4.11 (finding 2). The phone's
toolbar, last on screen but first in the DOM, makes the Tab order jump (finding 19). It also hides list rows
(finding 2) and takes the shelf's whole height at 400% zoom (finding 1). Shell findings already in
[#217](https://github.com/ldallacqua/shelf/issues/217) aren't repeated. The skip link's 32x16 in every `facts.json`
is #217's finding 1.

## Findings

IDs are the lenses' own (C critique, A accessibility, T words). One row where two lenses found the same thing.

| # | IDs | Severity | Where | What | Why | Fix | Effort |
| - | --- | -------- | ----- | ---- | --- | --- | ------ |
| 1 | A1 | Blocker | Shelf view (the default) at 400% zoom: 320 by 256 CSS pixels, found live (`.data` has no picture of it) | No game can be seen. On a phone the library is fixed at `100dvh` less the header (199px here), and the sticky toolbar takes 107px of it, so the shelf pager gets 0px. The toolbar covers the stats and the status row, and the shelf tabs are drawn over the footer's text. In the other views the page scrolls, but the sticky header and toolbar still hold 164 of the 256 pixels. | 1.4.10 Reflow (content lost at 320 by 256), 1.4.4 | `src/ui/shelf.css`: apply the phone's full-screen shelf (`.library[data-view='shelf']` height, `.shelf-pager`, `.shelf-panel`) and the sticky `.library-controls` only from a height where they fit, e.g. `@media (max-width: 39.99rem) and (min-height: 30rem)`. Shorter than that, the shelves stack as they do from 640 up, with the toolbar static at the top. | M |
| 2 | A2 | Blocker | 1440, shelf view, Shift+Tab upward; 390, list view, Tab downward. Found live | Moving back up the page, a shelf's fold button (24 by 24) stops at y 0 to 24, entirely under the 57px sticky header (the PlayStation Portable, Switch 2 and Vita shelves). On a phone, Tab through the list leaves rows (God of War, Returnal, Control) entirely under the sticky bottom toolbar. Boxes in the shelf, wall and banners views are only partly hidden, which AA allows. | 2.4.11 Focus Not Obscured (Minimum). The pilot's open check | `src/app/globals.css`: `html { scroll-padding-top: calc(3.5rem + 1px + 0.5rem) }`, and more while the wall's shelf name is pinned under the header (`.wall-label`, about 2.5rem). Below 640, while the toolbar sticks to the bottom, `html:has(.library-controls) { scroll-padding-bottom: calc(7rem + env(safe-area-inset-bottom)) }` | S |
| 3 | A3 | Blocker | Wall, 320, both languages (`library-wall/open/320-light-pt-BR`) | The page scrolls 12px sideways: the wall's S/M/L control joins the toolbar's second row and pushes the view switch past the edge. Squeezed, the Group button shrinks to a bare chevron with no word. | 1.4.10 Reflow at 320 | `src/features/library/toolbar.tsx`: let the "how it is laid out" row wrap on a phone (`max-sm:flex-wrap`) and keep the Group button at least its word's width (`max-sm:min-w-24` instead of `min-w-0`). At 320 in the wall, size and view then take a third row; other views keep two. | S |
| 4 | A4 | Blocker | Wall, every width, both themes: the platform names and status mark at a cover's foot (`.wall-marks`) | 9px white text on a gradient that is only half strength where the letters stand. Measured behind the text: about 3.0:1 over Final Fantasy VII Remake's white cover and 4.0:1 over Ghost of Tsushima. axe can't judge text over a gradient, so it left 50 of these "incomplete" in each wall capture rather than failing them. | 1.4.3 Contrast (4.5:1 for small text) | `src/ui/shelf.css`, `.wall-marks`: a full-strength band under the text, fading only above it, e.g. `linear-gradient(to top, rgb(0 0 0 / 0.8) 0 1.4rem, transparent)`, and `font-size: 0.625rem` | S |
| 5 | A5, C8 | Blocker | Every view, from the code (`library-view.tsx`, `onKey`) | `/` (search) and `?` (shortcuts) always work. The switch in the shortcuts dialog turns off only the letters. That dialog opens only by pressing `?`: nothing on the page says the shortcuts exist. The harm is small (neither key changes anything), but the letter of A is broken. | 2.1.4 Character Key Shortcuts (A): every single-character shortcut must be able to be turned off or remapped. Nielsen 7 and 10 | The off switch covers `/` and `?` too (check `shortcutsOn()` before them). Give the list a visible way in, so turning shortcuts back on never needs `?`: a "Keyboard shortcuts" button at the toolbar's end from `lg`, or the same switch in Settings, Appearance. The words in `shortcuts-dialog.tsx` follow. | M |
| 6 | A6, C11 | Blocker | `library-mine` and `library-empty`, 640 pt-BR: one's own shelf, signed in | The header's right side doesn't fit from 640 to 701px in Portuguese (640 to 641 in English): the page scrolls 62px sideways, and the account menu and the language link are cut off. Only one's own shelf shows Add in the header, which is why other signed-in pages (the duel, Settings) fit at 640. | AGENTS.md, Done means: nothing scrolls sideways at any main breakpoint, 320 to 1920 | `src/features/add-game/add-button.tsx`: the label `max-md:sr-only` and `max-md:px-2.5` (now `max-sm:`), as the phone already draws it | S |
| 7 | C1 | High | Shelf view, phone: 320 by 568 (live), 320 and 390 (captures), both themes | The first screen is mostly controls. At 320 by 568, the header, title, stats, search, status row, shelf tabs and shelf name take 258px and the toolbar 107px, leaving 146px (26%) for games. At 320 by 640 that is one cut-off row of covers. At 390 the PlayStation 5 shelf shows 6 of its 20 games and its second row ends just above the toolbar, with nothing to show that the shelf scrolls down inside itself. Two look-alike rows of pills sit one above the other: the status row filters, the shelf tabs jump to a shelf. | First look (the purpose is the games); Nielsen 8 (minimal design). Spec 3.4's one shelf per screen | A design pass for the phone's library. A one-row toolbar: Filters, Sort and Group as icon-and-word buttons, the view as a menu, about 56px. The stats on the title's line, or after the shelf name. The shelf tabs on the shelf name's line, the name being the current tab. A fade or a peek of the next row at the panel's foot, as `.filters-edge` does for the filter column. | L |
| 8 | C2, A10 | High | Filter dialog and the filter column, a mouse or trackpad: each value's row (`list-section.tsx`). Checked live | Each value looks like a checkbox, but clicking it runs off, included, excluded. A second click, meant to clear the tick, excludes the value instead ("Playing, 6 games, excluded"), and the shelf shows everything but those games. The rule is said only to screen readers (`Filters.panel.description` is `sr-only`). The state is only in the button's name, with no `aria-pressed` or `aria-checked`. A name that changes on the focused button is often not spoken, so the person hears only the new count. | Nielsen 5 (error prevention) and 4 (a checkbox's look); 4.1.2 met only through the name, from the code | Draw a pointer row as touch already does it: the box includes and unchecks (`role="checkbox"`, `aria-checked`), and a separate minus button excludes (`aria-pressed`, `Filters.panel.exclude`). An excluded value keeps its line-through. | M |
| 9 | C3 | High | List view at 1024, both languages (`library-list/open/1024-light-pt-BR`); measured live from 640 to 1920 | At 1024 the Title column is 4px wide. No game's title shows, only its thumbnail, and "TÍTULO" is drawn over "PLATAFORMAS". Just past each breakpoint the title is starved: 68px at 768, 80px at 1100, 172px at 1536, where the filter column takes its room. Each time, columns are added by the window's width while Title takes whatever is left (`table-layout: fixed`). | Use: the list exists to read titles; layout must hold between breakpoints | `src/features/library/list-view.tsx`: show `MEDIUM` and `WIDE` by the list's own width (a container query on its wrapper) rather than the window's, with the Title column kept at least about 14rem before Added and Completed appear. Failing that, move them a step later: `MEDIUM` from `lg`, `WIDE` from `xl` (and from 1920 while the filters stand beside) | M |
| 10 | C4 | Medium | Every view, phone (390, 320): the toolbar's Sort and Group | On a phone the words "Sort" and "Group" are `sr-only`, so the buttons read "Title" and "Platform" alone, with nothing saying what they change. | Nielsen 6 (recognition); every control obviously one | `sort-control.tsx`, `toolbar.tsx`: a small icon before the value on a phone (`ArrowDownUpIcon` for the sort, a grouping icon for the group), `aria-hidden`, with the words kept for screen readers as now | S |
| 11 | C5 | Medium | Shelf and wall views, every width | What a box's look means is never said. On the shelf: a gold seal (completed), a count badge (copies), a green dot and a box standing forward (playing), a box leaning (dropped), set back in shade (someday), an infinity tag (retired), a cover with no case (digital), a dashed outline with a faded cover (wishlist). On the wall: ✓, a dashed circle and ▷. A screen reader hears it all in words (`describeBox`); a sighted visitor has to guess. The banners say it in words. | Nielsen 6 and 10 | A key to the marks: a small "What the marks mean" button by the stats, opening a popover that draws each mark beside its word with the shelf's own components. A new element, so it needs its own design pass and story. | M |
| 12 | C6 | Medium | `library-mine/open`, 1440 and 390 | On an unfiltered library, "Save as a shelf" is a filled accent button beside the search, as loud as the header's Add. Saving there only copies the whole library. On a phone it is an unlabeled bookmark icon in accent. | First look: one main action; Nielsen 8 | `library-view.tsx`: `variant="secondary"`, shown once the view differs from the plain library (a filter, or a sort or grouping other than the default). On a phone, a `Tip` with its words. | S |
| 13 | C7 | Medium | `library/filters`: 390 (full screen) and 1440 (a dialog up to 1535px) | Changes apply at once but behind the dialog: only "230 games match" shows what they did. On a phone the only way back to the shelf is the X at the top. Up to 1535px, filtering covers the shelf it filters, at 1440 too, the most common desktop width. | Nielsen 1 and 3; thumb reach. Airbnb and most shops end a filter sheet with "Show N results" (from memory) | Dialog footer: a primary button that closes it, "Show 28 games" (new `Filters.panel.show`: EN `{count, plural, =0 {No games to show} one {Show # game} other {Show # games}}`, PT `{count, plural, =0 {Nenhum jogo para mostrar} one {Mostrar # jogo} other {Mostrar # jogos}}`), beside Clear all. Later, once 9 is fixed: the filters beside the library from 80rem (`FILTERS_BESIDE` in `beside.ts`). | S |
| 14 | T1 | Medium | A visitor at Sample's shelf: the filters, the list, the sort menu, box names; both languages, mostly Portuguese | The owner's words speak for the visitor. The filter section is "Mine" ("Meus"), and "My rating" appears in the filters, the list and the sort. In Portuguese, much of it is in the first person: "Plataforma que tenho", "Quero em", "Plataformas que tenho", the shelf "Não tenho", box names "não tenho" and "tenho em 2 plataformas", sorts "Data em que adicionei" and "Data em que zerei". | Clear: says exactly what is meant; "you" on the site, never a visitor's "I" | Words true for both owner and visitor. `Filters.panel.mine` EN "On this shelf", PT "Nesta estante". `Filters.keys.rating`, `Filters.values.has.rating`, `Sort.keys.rating` and `Library.list.rating`: EN "Rating", PT "Nota" (IGDB's stays "IGDB rating" / "Nota no IGDB"). PT only: `Filters.keys.owned` "Tem em"; `Filters.keys.wanted` "Quer em"; `Filters.keys.copies` "Plataformas com cópia"; `Library.shelf.notOwned` "Sem cópia"; `Library.box.notOwned` "{title}, sem cópia, {status}"; `Library.box.wanted` "{title}, sem cópia, {status}, quer em {platform}{more, plural, =0 {} one { e mais #} other { e mais #}}"; `Library.box.alsoOn` "{description}, em {count} plataformas"; `Sort.keys.added` "Adicionado em"; `Sort.keys.completed` "Zerado em" (the list's own words) | S |
| 15 | T2 | Medium | pt-BR, `no-match` and `filtered`: the stats, the shelves' counts, filter values' names | Zero takes the singular: "0 JOGO 0 ZERADO 0 HORA", "Algum dia, 0 jogo". Portuguese's plural rule puts 0 with 1, so `one` is chosen. | Natural to a Brazilian | PT, an `=0` that takes the plural: `Library.stats.games` "{count, plural, =0 {jogos} one {jogo} other {jogos}}"; `Library.stats.finished` "{count, plural, =0 {zerados} one {zerado} other {zerados}}"; `Library.stats.hours` "{count, plural, =0 {horas} one {hora} other {horas}}"; `Library.shelf.count` "{count, plural, =0 {# jogos} one {# jogo} other {# jogos}}"; the same `=0 {# jogos}` in `Filters.status.counted`, `Filters.panel.value.*` and `Filters.panel.include`. Worth a check in `pnpm i18n:check`: a PT plural with `one` needs `=0`. | S |
| 16 | T3 | Medium | Every view, EN: the stats above the status row | "79 FINISHED" sits just above "Completed 79": two words for one status (the Portuguese says "zerados" and "Zerado"). | The same word for the same thing | `Library.stats.finished` EN "{count, plural, other {completed}}" | S |
| 17 | T4 | Medium | pt-BR: the filters' IGDB values, and chips such as "Gênero: Role-playing (RPG)" | Genres, themes, modes and perspectives are IGDB's English in a Portuguese page: "Simulator", "Strategy", "Racing", "Fighting", "Sport", "Music", "Card & Board Game". They are marked `lang="en"`, so speech is right, but they aren't how a Brazilian site says them. | Portuguese natural, not left in English | Translations for IGDB's fixed vocabularies (genres, themes, game modes, perspectives), e.g. under `Filters.values.genre.*`: "Corrida", "Luta", "Esporte", "Música", "Estratégia", "Estratégia por turnos", "Estratégia em tempo real", "Simulação", "Aventura", "Tático", "Cartas e tabuleiro", "Perguntas e respostas", "Quebra-cabeça", "Tiro"; "RPG", "Indie", "Arcade", "Visual novel" and "Point-and-click" as they are. Keywords, franchises and companies stay IGDB's. The filter text (`genre:rpg`) stays English, as AGENTS.md says. | M |
| 18 | T5 | Medium | Shelf view, phone: the toolbar's Shelves button and the shelf tabs | Two things are named "Shelves" ("Prateleiras") on one screen: the smart-shelves menu (`Shelves.open`) and the row of tabs for the shelves on screen (`Library.shelf.tabs`). In English "shelf" already means the whole library ("Sample's shelf"), a group, a view and a saved shelf. | The same word for the same thing, and one word per thing | `Library.shelf.tabs` EN "Go to a shelf", PT "Ir para uma prateleira" | S |
| 19 | A7 | Medium | Shelf view, phone, Tab from the top (390, found live) | Focus goes from the status row at the top down to the toolbar at the foot of the screen (Filters, Sort, direction, Group, View), back up to 25 shelf tabs, each its own stop, and only then to the first game: 38 stops before a box. The DOM order is on purpose (`.library-controls` in `shelf.css`) and keeps the meaning, controls before what they control, but the eye has to jump. | 2.4.3 Focus Order (met in meaning; the jumps are friction). The pilot's open check | `shelf-view.tsx`: the shelf tabs as one stop, with arrows, Home and End moving between them (`tabIndex` 0 on the current, -1 on the rest; `aria-current` stays). Keep the toolbar first in the DOM, and say so in `shelf.css`'s comment as the reason it stays. | S |
| 20 | A8 | Medium | Wall, banners and list views, keyboard (`focus.json`) | Every game is a Tab stop: 230 boxes, plus 25 fold buttons. The list adds 7 sort buttons under each of its 25 shelves, about 175 more. The shelf view gives each shelf one stop and moves inside it with arrows and Page Up/Down, so the same library takes 50 Tabs in one view and over 400 in another. | 2.1.1 met; Nielsen 4 (consistency) and 7 | `wall-view.tsx` and `banner-view.tsx`: `shelf-grid.tsx`'s model (one `tabIndex` 0 per shelf, arrows across the grid's rows, Page Up/Down to the next shelf). The list: rows by Up and Down within a shelf, and the column sort buttons once, in the first shelf's table (the toolbar's Sort does the same) | M |
| 21 | A9 | Medium | `no-match`, a screen reader, from the code | When a search or filter leaves nothing, nothing may be spoken. `ResultStatus` says nothing at 0 on purpose, leaving it to `NoResults`, but that `role="status"` is put in the page already filled (with a button inside), and screen readers often don't announce a live region that arrives filled. | 4.1.3 Status Messages | `result-status.tsx`: at 0, say `Filters.noResults.title` (its region is always in the page). `no-results.tsx`: drop `role="status"`. | S |
| 22 | C9 | Low | 640 to 1023, every view (`open/640`, `820`) | The toolbar wraps into a third row that holds only the view switch, alone on the right. At 640 the status row ends at a word's edge ("Lista de desejos", its count hidden), so it doesn't look like it scrolls. | Alignment; nothing lost in empty space | `toolbar.tsx`: from `sm` to `lg`, the view switch as icons (it already has names) so one row holds it, or put it on the search's row. A fade at the status row's right edge while it scrolls. | S |
| 23 | C10 | Low | `library-empty/open`, 1440 | A new owner's empty shelf shows "Search the library" in the header, for a library with nothing in it. On the populated library the toolbar's field replaces it, because `globals.css` hides `.site-search` where `.library` is drawn, and the empty shelf doesn't draw `.library`. | Nielsen 8 | Hide `.site-search` on the empty library too (the same rule in `globals.css`, keyed on the empty state's frame) | S |
| 24 | T6 | Low | Every view: each shelf's fold button | "Fold the PlayStation 5 shelf away" against "Show the PlayStation 5 shelf": "fold away" is unusual, and the pair don't match. | Clear, the common word | `Library.shelf.fold` EN "Hide the {shelf} shelf" (PT "Recolher a prateleira {shelf}" stays) | S |
| 25 | T7 | Low | `library-empty/open`; a visitor at an empty shelf, from the code | "Add a game, or paste a whole list, and it will stand here": "it" for a list. In Portuguese the two buttons disagree, "Adicione…" (do) beside "Trazer…" (to bring). A visitor reads "The shelf is being stocked. Games will stand here soon.", a promise nobody can keep. | Clear; Portuguese consistent with itself; honest | `Library.emptyMineBody` EN "Add a game, or paste a whole list, and your games will stand here." PT "Adicione um jogo, ou cole uma lista inteira, e seus jogos vão ficar aqui." `Add.bringIn` PT "Traga seus jogos de uma plataforma". `Library.emptyTitle` EN "No games on this shelf yet." PT "Ainda não há jogos nesta estante." `Library.emptyBody` EN "They will stand here once they are added." PT "Eles vão ficar aqui quando forem adicionados." | S |
| 26 | T8 | Low | pt-BR toolbar and filter dialog; EN, from the code | "ORDEM Título" (a noun) beside "AGRUPAR Plataforma" (a verb). "230 jogos combinam" is word for word. The search inside a filter section is named "Find a Platform owned". | Portuguese natural; one grammar per row | `Sort.label` PT "Ordenar". `Filters.panel.results` PT "{count, plural, =0 {Nenhum jogo encontrado} one {# jogo encontrado} other {# jogos encontrados}}". `Filters.panel.find` EN "Find in {key}" (PT already "Encontrar em {key}") | S |
| 27 | A11 | Low | `library/sort-menu`, axe | `region` (every capture): the menu is put in `<body>`, outside the landmarks, as Radix does for every menu. `scrollable-region-focusable` (390, light, English, at the moment of capture): the menu's items are reached by the arrow keys, which scroll it. Live at 390 by 844 the menu doesn't scroll at all. | Both are false positives: a menu lasts only while open, and is operable by keyboard | No change needed | – |

## What works

- Filtering is visible and reversible in words. Each condition is a chip with its own Remove button, and the Filters
  button says how many are active ("Filters, 2 active"). The status row counts what each status would leave, and
  Clear all is always near. The search field and the panel are one tree, and what the search can't read is shown
  as "Not understood, so ignored" rather than failing.
- Every box's name says everything its look shows: title, year, platform, format, status, copies (`describeBox`).
  The marks are `aria-hidden`. The shelf view gives a shelf one Tab stop with arrows and Page Up/Down. Fold buttons
  carry `aria-expanded` and say which shelf.
- The roles are right throughout. The status row, the view switch and the wall's cover size are radio groups. The
  sort menu is `menuitemradio` with `aria-checked`. The list's headings carry `aria-sort`, and each table has a
  caption and `aria-rowcount` for the rows drawn later. A list row's title button is stretched over the whole row:
  the 21px "targets" in `library-list`'s facts are false.
- What a filter or sort leaves is spoken once typing settles (700 ms), not at each letter. At 1920, "Skip the
  filters" works and is 113 by 36 when shown.
- Both themes are one room with the lights on or off, and the covers face out. No text stands in the glow behind
  the games. Waiting is ghosts, never words or a spinner. Reduced motion is respected: the stats' count-up,
  hover's lift and the swap between views turn calm.
- The empty states say what goes there and offer the way in (Add your first game, Bring your games from a
  platform). The no-match state keeps the chips and offers Clear all.
- The Portuguese is natural nearly everywhere: "Na fila", "Zerado", "A definir", "Me surpreenda", P, M and G for the
  cover sizes. The English is calm and concrete.

## Not checked

- Screen-reader speech: 8, 19 and 21 are reasoned from the code and the live checks, not heard.
- Touch. The captures use a fine pointer, so these weren't seen: the touch layout of the filter rows (plus and
  minus buttons), swiping between shelves, the scrub along a shelf (2.5.7 Dragging, if it is the only way to
  something), and a phone keyboard over the search.
- States without a scene: the Shelves and Group menus open, a smart shelf changed ("Changed", "Back to the saved
  shelf"), the Save as a shelf dialog, a search with a part not understood, the library failing to load, a private
  shelf (to a visitor and to its owner), a visitor at an empty shelf (25 is from the code), the shortcuts dialog, a
  folded shelf, the wall at small and large, the list sorted by a column, the stress set (1,280 games), Ready to
  play (Shelf for Windows only), and the experimental 3D shelf (left to its own pass).
- Text spacing (1.4.12), Windows forced colors, a phone's text enlarged by the system rather than by zoom, Firefox
  and Safari (the scripts run Chromium only).
- Other products (Steam's library, Backloggd, Airbnb's filters) were cited from memory, not opened.

## For the review itself

- Six findings are Blockers by the letter of the scale (1 to 6). Only 1 stops a task, so the pilot's question about
  the scale stands.
- The capture missed what the live checks found. Its focus walk is desktop-only, forward-only and stops at 60, and
  its `Covered` column tests only a stop's centre. Its widths skip the moments just past a breakpoint, where 9
  shows, and it takes no 320 by 256 picture, where 1 shows. It also lists axe's violations but not its
  "incomplete", where 4 was. Worth adding: a phone focus walk, a Shift+Tab walk that marks a stop "entirely
  covered", a 320 by 256 picture, and a count of axe's incomplete contrast.
- The hours figure differs between pictures (4,225 to 4,236). `SettlingNumber` counts up on `requestAnimationFrame`,
  which `settle()` doesn't wait for, since it waits only for Web Animations. This is not a fault in the page; the
  capture could wait for `[data-settle][data-counted]` and a still figure.

## Chosen to fix

The owner's choice (15 Nov 2026): all of them ("pode fazer tudo"). Fixed on the branch `fix-01-library`,
one commit per group:

| # | Outcome |
| - | ------- |
| 1 | Fixed. The phone's full-screen shelf and its bottom bar need a screen at least 30rem tall; shorter, the library is a page with its controls on top. |
| 2 | Fixed. A scroll margin on what can be focused in the page clears the sticky header, a wall shelf's pinned label and a phone's bottom bar. A scroll padding on the page was tried first and dropped: the bars' own buttons stand in it, so focusing one moved the page (opening the phone's view menu scrolled 378px). |
| 3 | Fixed by 7: a phone's cover size is in the view menu, and the row no longer passes 320. |
| 4 | Fixed. A full-strength band under the wall's marks, and 10px: 12:1 over any cover. |
| 5 | Fixed. Off turns `/` and `?` off too; a keyboard button at the toolbar's end, from lg, opens the list and its switch. |
| 6 | Fixed. The header's Add is an icon below md. |
| 7 | Fixed. One row at a phone's foot (Filters, the sort and its direction, a menu for the view, the grouping and the cover size); the shelf tabs are the shelf's name, in the headings' type, where its heading stood; a fade at a long shelf's foot; a tighter head. |
| 8 | Fixed. A value is a box to check, and a minus beside it excludes: the same with a mouse and on touch. Spec 5.2 changed with it. |
| 9 | Fixed. The list's extra columns come by the list's own width (a container query); the title keeps about 14rem. |
| 10 | Fixed. Below lg, Sort and Group carry an icon for what they change. |
| 11 | Fixed. "What the marks mean", by the totals on the shelf and the wall, opens a key drawn with the shelf's own marks. |
| 12 | Fixed. Save as a shelf is secondary, and only once the library is filtered, sorted or grouped other than its own way. |
| 13 | Fixed. The dialog ends with "Show 28 games", which closes it. The filters beside the library from 80rem were left: the column still takes the list's room at 1280. |
| 14 | Fixed. "On this shelf", "Rating", and Portuguese true for anyone. |
| 15 | Fixed. Every Portuguese plural with `one` has an `=0` (115 across the site), and `pnpm i18n:check` fails on a new one. |
| 16 | Fixed. "79 completed". |
| 17 | Fixed. IGDB's genres, themes, modes and perspectives in the page's language, in the panel, the chips and a game's page. |
| 18 | Fixed. The tabs are "Go to a shelf". |
| 19 | Fixed. The shelf tabs are one Tab stop, with arrows, Home and End. |
| 20 | Fixed. One Tab stop a shelf in the wall, the banners and the list; the list's column headings are stops in the first table only. |
| 21 | Fixed. The region always in the page says when nothing matches; the empty shelf's own is no longer a status. |
| 22 | Fixed by 10: icons below lg, so from 640 one row holds the controls (the wall's cover size takes a second, with the views). |
| 23 | Fixed. The empty shelf doesn't offer the header's search. |
| 24 | Fixed. "Hide the PS5 shelf". |
| 25 | Fixed. |
| 26 | Fixed. |
| 27 | No change needed: both are false positives. |

The second review, over the fixed screens, follows.

## Second review

Captured on the build of 67e2369, 15 Nov 2026. The capture's indexes name ed341d8, the next commit, which only made the
key's loading ghosts plain `.ghost` spans and added the scenes. The run was `pnpm ui:capture library library-mine
library-wall library-list library-banners library-empty` against `pnpm serve:test`. It took the first review's scenes,
plus `library/marks` and `library-wall/marks` (the key to the marks, open) and `library/layout-menu` (the phone's view
menu, open; wider, the page as it opens). No scene failed, there was no console error, and nothing scrolls sideways at
any width.

Lenses run: critique, accessibility (WCAG 2.2 AA) and words, one after the other, by one Claude Code agent (the
`ui-review` subagent), over what the branch changed (`git diff main..HEAD`). The Design plugin's skills weren't
available in this session either, so each lens followed [the procedure's](../ui-review.md) checklists by hand. Live
checks used headless Playwright (Chromium) scripts against the same server, kept outside the repository. They
repeated what the first review found live: 320 by 256, Shift+Tab under the header in all four views, the phone's Tab
order and bottom bar, and the list's title column at 26 widths from 320 to 1920. They also covered:

- Tab, the arrows and Page Down through the shelves in every view at 390, 639, 640 and 1440;
- the shelf tabs' keys;
- the shortcuts switch below lg, and G on a phone;
- the key and the filter dialog at 320 by 256;
- a width sweep from 320 to 1100 as the owner, in both languages;
- what the status region says at no match, and the contrast of the new words.

axe-core found one new rule, `scrollable-region-focusable`, at 320 by 640. On the key's body (`.px-5`) it is right
(29). On the phone's far shelf panels it catches a passing state of the row window, not a fault a person meets (46).

Of the 27 findings, 20 are fixed as the table says, and 27 needed no change. Six are only partly fixed:

- 1: the 30rem threshold is low (36);
- 5: there is no way back below lg (31);
- 11: the list has no key (33);
- 19: Tab leaves the chosen shelf (32);
- 20: below 640 a shelf with no row drawn has no stop, and Page Down loses focus (28, 30);
- 22: the status row's fade is missing (37).

The fixes also brought 40 and 41, and 35 and 43 were first seen in this pass.

| # | IDs | Severity | Where | What | Why | Fix | Effort |
| - | --- | -------- | ----- | ---- | --- | --- | ------ |
| 28 | A12 | Blocker | Wall, list and banners below 640, both languages: 390 by 844, 320 by 256 (400% zoom), 639 by 800. Found live | Tab from the first shelf's stop goes straight to the footer, and the other 24 shelves are skipped. Shift+Tab from the footer reaches the last shelf, then the first table's headings. A shelf has its stop only among the rows drawn, and `useRowWindow` draws none for a shelf far from the screen. From 640 up, the fold buttons pull each shelf near as Tab passes them, but below 40rem they are hidden. Before the branch every game was a stop, so Tab drew the rows as it went. The shelf view isn't affected: a phone's panels keep their stop. | 2.1.1 Keyboard (A) at 320 CSS pixels; 2.4.3. Brought by 20's fix | `use-roving.ts` and the three grids: a shelf with no row drawn still has a stop. While its stop's row isn't drawn, the grid (`data-roving`) takes `tabIndex={0}`. On focus it draws that row (`revealRow`) and hands focus to it (`focusNext`, as `move` does). Or the stop's row is always drawn, as `first-touch.ts` keeps a phone panel's box. A test: Tab from the first stop at 390 reaches the second shelf. | M |
| 29 | A13 | Blocker | `library/marks`: 320 by 256 (400% zoom) in both languages, and 320 by 640 in Portuguese (`marks/320-light-pt-BR`, axe `scrollable-region-focusable` on `.px-5`). Found live | The key's body scrolls: 536px of words in 170px at 320 by 256, and 596 in 554 at 320 by 640, which cuts the last row's "vê". Nothing in it can take focus. Tab stays on Close, because the dialog's trap moves only among tabbable elements, and the arrows don't scroll it. At 400% zoom a keyboard user reads 3 of the key's 11 marks. Elsewhere the key fits (at 390, and in English at 320 by 640), so the harm is small there, but axe is right. | 2.1.1 Keyboard (A) | `src/ui/dialog.tsx`: while it overflows (a `ResizeObserver`), the scrolling body takes `tabIndex={0}` and `role="region"`, named by the dialog's title, so Tab reaches it and the arrows scroll it. Every dialog whose words outgrow a short screen gains it. | S |
| 30 | A14 | High | Wall, list and banners, every width: Page Down and Page Up between shelves. Found live at 390 and 1440 | The second Page Down drops focus to the page (in the list at 1440, the first one does). `leaveShelf` scrolls the next shelf into view, and the focused row leaves the window and is taken out of the page. Two frames later the next shelf's rows aren't drawn yet, so nothing gets focus. The next Tab carries on from about where the page stands. But the shortcut the list names ("Previous or next shelf") loses the person's place, and below 640 it is the only key that gets past 28. The shelf view's Page Down, the model, works. | 2.4.3 Focus Order; 2.4.7 (no focus to see). Brought by 20's fix | `use-roving.ts`, `leaveShelf`: before scrolling, focus something that stays (the next grid, `tabIndex={-1}`, `focus({ preventScroll: true })`). Then focus its stop once the row window has drawn it: wait on the window, as `move` does through `focusNext`, rather than a fixed two frames. | S |
| 31 | A15, C12 | High | Every view below 1024, with a keyboard: the shortcuts switch. Found live at 820 | Turned off, every key on its own is off, `?` included. The keyboard button that opens the list is `max-lg:hidden`, so below 1024 nothing turns the shortcuts back on (at 820 the button isn't shown at all). The switch's own hint promises "the keyboard button in the toolbar". 200% zoom on a 1440 screen is 720px wide. | Nielsen 3 (control and freedom) and 10; the words promise what isn't there. 2.1.4 itself is now met. 5's fix, incomplete | `toolbar.tsx`: show the keyboard button from `sm` (it already has a `Tip`), and on a phone add a "Keyboard shortcuts" item at the foot of `LayoutMenu`. `Shortcuts.lettersHint` EN "Off, no key on its own does anything, / and ? included. Turn them back on from the keyboard button by the views, or the view menu on a phone." PT "Desligados, nenhuma tecla sozinha faz nada, nem / e ?. Para religar, use o botão de teclado ao lado das visualizações, ou o menu de visualização no celular." | S |
| 32 | A16 | High | Shelf view, phone (390 by 844): the shelf tabs, with a keyboard. Found live | The arrows, Home and End choose a shelf, and the pager glides to it. Tab then goes to the first shelf's box (PlayStation 5), and the pager glides back: the choice is undone every time. After End, Tab landed on the PlayStation 5 panel itself, a scroller with no box drawn. While the pager glides (over a second for End), the focused tab is off the screen. Tab's stop follows the shelf passing under the window, not the focused tab. | 2.4.3 Focus Order; Nielsen 3. 19's fix, incomplete | `shelf-view.tsx`, `onTabKey`: Tab without Shift moves focus to the current panel's stop (`[tabindex="0"]` inside the `index`th `.shelf-panel`) and prevents the default. `tabIndex` follows the focused tab, not `current`, and the strip keeps the focused tab in view as it moves. | S |
| 33 | C13 | Medium | List view, phone (`library-list/open/390-light-en`, `320-light-pt-BR`) | Below sm the list shows each status as the wall's icon alone (a check, a dashed circle, a play mark), under a heading only screen readers get. The list is the one view with marks and no "What the marks mean", which only the shelf and the wall draw. | Nielsen 6 (recognition). 11's fix, incomplete | `library-view.tsx`: `MarksKey` in the list too, with the wall's marks and no platforms row (`marks-list.tsx`). Or, below sm, the status word under the year, in the title's cell | S |
| 34 | A17 | Medium | Every view below 640, with a keyboard (a narrow window, 400% zoom): G. Found live at 390 | G opens the wider screens' Group menu, whose button is hidden here. The menu stands in the top-left corner over the header and the title. Escape leaves focus on the page (`body`), not in the toolbar. S, F and V work. | 2.4.3 (focus lost on close); Nielsen 4 | `library-view.tsx` / `toolbar.tsx`: below sm, G opens `LayoutMenu` (its open state lifted as `groupOpen` is), whose button takes focus back | S |
| 35 | C14 | Medium | List view at 320 (`library-list/open/320-light-pt-BR`); measured live | The title column is 84px wide: "Astro …", "Baldur'…", "Demo…", "Doom …". The cover, the platforms with their format and the status take the rest. It was already so before the fixes (the first review measured from 640 up). Now it is the one width where the list loses its titles. | Use: the list exists to read titles (9's own reason) | `list-view.tsx` below sm: the platforms without their format word and in a narrower column, and the title on two lines (`line-clamp-2`) rather than cut to one | S |
| 36 | C15 | Low | Shelf view, phone width, 320 by 480 (the threshold itself). Found live | 1's fix holds at 320 by 256. But the full-screen shelf starts at 30rem tall, where the head, the tabs and the bar leave the pager 88px: the tops of two covers, faded. 320 by 568 leaves 176px. | First look (the purpose is the games); spec 3.4 | `shelf.css`: the full-screen shelf and the sticky bar from `min-height: 36rem`; shorter screens get the page, as at 256 | S |
| 37 | C16 | Low | 640 to 819, Portuguese (`open/640-light-pt-BR`); a filtered library in Portuguese at 1024 to 1047, found live | 22's other half wasn't done. At 640 the status row still ends on a word's edge ("Lista de desejos", its count hidden), with nothing to say it scrolls. Just past lg, "Filtros 1" makes the row wrap, leaving the views and the keyboard button alone on a second row at the right. (22 already said the wall wraps from 1024.) | Alignment; nothing lost at an edge. 22's fix, incomplete | A fade at the status row's scrolling edge, as `.filters-edge` does. The view switch as icons until the row holds its words: a container query on the toolbar rather than `lg` | S |
| 38 | C17 | Low | The key: `library/marks/1440-dark-pt-BR` and `390-dark-*`; `library-wall/marks/390-*` | In the dark, Someday's swatch looks like Backlog's at 92% size (brightness 0.78 on a dark box changes little), so the two read alike, though the key exists to tell them apart. In the wall's key at 390, the sample "PS5 · PC" breaks onto two lines in its 2.5rem column. | Consistency; the key's one job | `shelf.css`, `.marks-box[data-status='someday']`: a shade that shows in both themes (a fill mixed toward `--text`); the sample `whitespace-nowrap` and its column `auto` | S |
| 39 | C18 | Low | Phone, the view menu (`layout-menu/390-*`) | The button shows only the view's icon and a chevron. Nothing in sight says the grouping is inside it (or, in the wall, the cover size). Changing the grouping on a phone is now a guess. | Nielsen 6 (recognition over recall) | `LayoutMenu`'s button: the grouping's word beside the icon ("Platform"), as the sort shows "Title"; the icon alone below about 22rem | S |
| 40 | A18 | Low | Portuguese, the filters' IGDB values kept in English (`filters/text-pt-BR.txt`) | Translating the vocabularies (17) also took `lang="en"` off the values the Portuguese keeps in English: "Point-and-click", "Hack and slash/Beat 'em up", "Visual novel", "Battle royale". `isIgdbName` is now false for every word that has a key, so a Portuguese voice reads them with Portuguese sounds. 3.1.2 exempts loan words, and most of these are, but "Hack and slash/Beat 'em up" hardly is. | 3.1.2 Language of Parts, mostly met by its exception | `vocab.ts`: list the values kept in English (a set) and give them `lang="en"` in the panel and the chips, as before | S |
| 41 | T9 | Low | English: the filters' genres, themes, modes and perspectives (`Filters.vocab` in `messages/en.json`) | They are Shelf's own words now, but they keep IGDB's mixed forms: "Real Time Strategy (RTS)" beside "Turn-based strategy (TBS)", "Visual Novel", "Card & Board Game", "Bird view / Isometric", "Quiz/Trivia", "Hack and slash/Beat 'em up", "4X (explore, expand, exploit, and exterminate)", "Massively Multiplayer Online (MMO)". | One form; sentence case, as elsewhere | `Filters.vocab` EN: `genre.rts` "Real-time strategy (RTS)", `genre.visual-novel` "Visual novel", `genre.card-and-board` "Card and board game", `genre.trivia` "Quiz and trivia", `genre.hack-and-slash` "Hack and slash, beat 'em up", `theme.4x` "4X", `mode.mmo` "MMO", `perspective.isometric` "Isometric" (the PT already says "Isométrica") | S |
| 42 | T10 | Low | The shortcuts list, every view (from the code) | "Previous or next game on the ledge" and "The ledge above or below" are the shelf view's words. The arrows now move through the wall's covers and the list's rows too. | The same words for what every view does | `Shortcuts.keys.arrows` EN "Previous or next game", PT "Jogo anterior ou próximo"; `Shortcuts.keys.ledges` EN "The row above or below" (PT "A fileira de cima ou de baixo" stays) | S |
| 43 | T11 | Low | Excluding a value, both languages (`?q=-status:playing -genre:sport`, found live) | The minus now stands on every row, so its words are read more often. The chips say "Not Status: Playing" and "Sem status: Jogando" (in Portuguese, "with no status"), and the section's summary says "sem Jogando". | Clear; natural Portuguese | `Filters.chips.not` EN "{key}: not {values}", PT "{key}: exceto {values}"; `Filters.panel.notValue` PT "exceto {value}" | S |
| 44 | T12 | Low | Portuguese, `no-match` (`no-match/390-light-pt-BR`), and what the status region now says there | "Nenhum jogo combina com estes filtros." keeps the word-for-word "combina" that 26 took out of the count ("encontrado"). `ResultStatus` now speaks it too (21). | Portuguese consistent with itself | `Filters.noResults.title` PT "Nenhum jogo encontrado com estes filtros." | S |
| 45 | T13 | Low | The key's words (`marks/text-*.txt`, `marks-list.tsx`) | Backlog's line, "a box as it stands" ("a caixa como ela é"), gives nothing to look for. A visitor is told what Private looks like, though only an owner ever sees it. The wall's key leaves out Unsorted, whose inbox mark an owner with a sync sees. | Useful: says what to look for | `Library.marks.shelf.backlog` EN "a plain box, standing straight", PT "a caixa reta, sem marca"; the Private row only for `useIsMine`; `unsorted` in the wall's marks, `Library.marks.wall.unsorted` EN "an inbox: came in from a sync, not placed yet", PT "uma caixa de entrada: veio de uma sincronização e ainda não tem lugar" | S |
| 46 | A19 | Low | axe at 320 by 640: `scrollable-region-focusable` on two phone shelf panels (`shelf-platform-130`, `-24`) in `open`, `sort-menu`, `layout-menu` and `library-mine/open`; `region` on the view menu | The panels: 19 of them, far from the one in view, have no box drawn yet (the row window's design), and Chrome makes an empty scroller a stop. At a person's pace (half a second a Tab), Tab at 320 by 640 reached every shelf by its box and never a panel. Only Tab held down lands on one, and 32's Tab after End does. `region`: Radix puts a menu in `<body>`, as 27 said for the sort menu. | Both false positives for a person, as in 27 | No change needed. 32's fix removes the one way a person lands on an empty panel | – |

### What works

- Checked here and fixed as the table says:
  - 2: Shift+Tab from the footer, at 1440 in all four views, the wall at 820 and the shelf at 1024: no stop is
    entirely under the header or a pinned wall label. On a phone, list rows and wall covers moved by the arrows stop
    above the bar.
  - 3 and 6: no sideways scroll at any width from 320 to 1100, as owner and visitor, in both languages.
  - 4: the band under the words is 80% black, 12:1 over a white cover.
  - 7: at 390, two whole rows of covers and the tops of a third; at 320 by 640, one row and a fade.
  - 8: a checkbox with `aria-checked` and a minus with `aria-pressed`. An excluded value shows a ban mark, its name
    struck through and the minus filled.
  - 9: from 640 to 1920 the title keeps 212 to 556px (4px before).
  - 12: no Save on the library as it opens; secondary once filtered.
  - 13: "Show 92 games" closes the dialog and gives focus back to Filters.
  - 21, live: "No games match these filters.", then "9 games, sorted by Title, ascending".
  - 10, 14 to 18, 23 and 24 to 26, as the table says.
- 1 at 320 by 256: the library is a page with its controls on top, and every view scrolls to its games.
- On a phone, at a person's pace, the shelf view's Tab order is the header, the key, the search and Shelves, the
  status row as one stop, the bar's four buttons, the tabs as one stop, then one stop per shelf, with the pager
  following. Every stop has its ring and none is under the bar. The scroll margin, rather than padding, means opening
  the phone's view menu no longer moves the page.
- From 640 up, the wall, the list and the banners give a shelf one stop between its fold buttons, as the shelf view
  does.
- The key is drawn with the shelf's own marks and loads only when opened, its wait shown as plain ghosts. The new
  words keep 5.8:1 in light and 8.4:1 in dark. The phone's bar is one row of 40px targets, and the shelf tabs read as
  headings, not as a second row of filters.
- A Portuguese zero takes the plural everywhere captured ("0 ZERADOS 0 HORAS", "0 jogos").

### Not checked

- Screen-reader speech. 28, 30 and 32 were found with the keyboard alone. How a screen reader announces the tabs
  (a `nav` of buttons, with no hint that arrows move between them) and the key wasn't heard.
- Touch: the filter rows' 44px minus, swiping between panels, the view menu by thumb.
- Safari and Firefox. Chrome makes a scroller with nothing focusable a stop on its own, so 29 and 46 may differ
  there.
- Windows forced colors (the key's swatches are borders and fills), text spacing, and a phone's system text size.
- The game page, where 17 also put the genres in Portuguese (row 02's review); the shortcuts dialog's own layout;
  Storybook's new stories; the experimental density item in the view menu; a private game or an Unsorted one (the
  sample has neither, so 45 is from the code); the stress set.
- Other products weren't opened.

### Fixed after the second review

All of them, as the owner chose for the first ("pode fazer tudo"), in one commit on `fix-01-library`:

| # | Outcome |
| - | ------- |
| 28 | Fixed. A shelf with no row drawn has its grid as its stop; focused, it draws its game and hands focus on (`useRovingShelf`). |
| 29 | Fixed in `src/ui/dialog.tsx`: a body that overflows with nothing in it to focus takes focus itself, a region named by the dialog's title. |
| 30 | Fixed. Page Down and Page Up focus the next grid before anything scrolls; the grid hands focus to its game once drawn. |
| 31 | Fixed. The keyboard button stands by the totals at every width; the switch's hint says so. |
| 32 | Fixed. Tab from a shelf tab enters the shelf chosen; the tabs' stop follows the tab chosen. |
| 33 | Fixed. The list has the key, with the wall's icons. |
| 34 | Fixed. Below 640, G opens the phone's view menu. |
| 35 | Fixed. A phone's list title has two lines, in the year's place; its platforms go without their format. |
| 36 | Fixed. 36rem, the height the 3D shelf asks. |
| 37 | Fixed. The status row's edge fades while it can scroll; the views are icons until xl. |
| 38 | Fixed. Someday's swatch is faded too; the wall's sample doesn't wrap. |
| 39 | Fixed. The button shows the grouping's word, the icon alone below 22rem. |
| 40 | Fixed. The values the Portuguese keeps in English are `lang="en"` (`staysEnglish`). |
| 41 | Fixed. |
| 42 | Fixed. |
| 43 | Fixed: "Theme: not Horror", "Tema: exceto Terror". |
| 44 | Fixed. |
| 45 | Fixed. |
| 46 | No change needed. |

## Third review

Captured on the build of c10cb1e, 15 Nov 2026: eeead1e's fixes, plus the library's new JavaScript budget and the second
review's report. The run was `pnpm ui:capture library library-mine library-wall library-list library-banners
library-empty` against `pnpm serve:test`, with the second review's scenes. No scene failed, there was no console error,
and nothing scrolls sideways at any width. axe-core found only what 27 and 46 judged: `region` on the sort and view
menus, and `scrollable-region-focusable` on two far phone shelf panels at 320 by 640. The key's `.px-5` hit is gone.

Lenses run: critique, accessibility (WCAG 2.2 AA) and words, one after the other, by one Claude Code agent (the
`ui-review` subagent), over what eeead1e changed. The Design plugin's skills weren't available in this session, so each
lens followed [the procedure's](../ui-review.md) checklists by hand. Live checks used headless Playwright (Chromium)
scripts against the same server, kept outside the repository. They repeated the checks that found 28, 29, 30 and 32:

- Tab and Shift+Tab through every shelf of the wall, the list and the banners at 390 by 844, 320 by 256 and 639 by 800;
- Page Down and Page Up between shelves in the same three views at 390 and 1440;
- the key at 320 by 256 in three views and both languages, and at 320 by 640 in Portuguese;
- the phone's shelf tabs: the arrows, Home and End, then Tab, with motion and reduced.

They also looked at 31, 34, 35, 36 and 37 on screen:

- the shortcuts switched off and on again at 820, 390 and 320 by 256, and G at 390;
- every list row's title and platforms at 320, 390, 639, 820, 1440 and 1920;
- the shelf view at 320 by 480 and 568, 390 by 575 and 576, and 360 by 640;
- the toolbar and the status row every 16px from 640 to 1600, in both languages, plain and filtered, as visitor and
  owner;
- a shelf folded at 1280, then seen at 390 and at 320 by 200.

Of 28 to 45, ten work as the table says: 29, 31, 33, 36 and 39 to 44. Eight are only partly fixed:

- 28: every shelf has its stop, forward and back, but a shelf taller than the screen keeps focus on its grid (48);
- 30: focus no longer drops to the page, but it lands off screen and nothing scrolls (49);
- 32: Tab enters the shelf chosen, but the strip loses the focused tab while the pager glides (52);
- 34: G opens the phone's menu, but on the views rather than the grouping (53);
- 35: titles hold at 390 but not all at 320, and the narrower platforms column cuts more (50);
- 37: the views as icons hold one row at 1024, but the fade isn't drawn (51);
- 38 and 45: the key's swatches and words changed as asked, but two of its lines no longer match the shelf (55, from the
  code).

47 has been in the code since `da58262`, long before this branch, and is first seen here; 32's fix made it catch Tab.

| # | IDs | Severity | Where | What | Why | Fix | Effort |
| - | --- | -------- | ----- | ---- | --- | --- | ------ |
| 47 | A22, C19 | Blocker | Every view below 640, a shelf folded on a wider screen: a narrow window, or a laptop zoomed to 250% and more (1440 at 250% is 576; 1280 at 400% is 320). Found live at 390 by 844 and 320 by 200 | The shelf draws nothing. In the shelf view its panel is blank under its tab ("PS4 36"); in the others its heading and count stand over no games. Its fold button is hidden below 640, so it can't be unfolded there. In the shelf view, Tab from its tab does nothing: 32's handler waits for a box that never comes, and keeps Tab. `shelf.css` means to show a folded shelf on a phone (`[data-shelf-body][hidden] { display: block }`), but Tailwind's preflight hides `[hidden]` with `!important`, which wins. | 1.4.10 Reflow: content and a function lost at 320 CSS pixels. Only someone who folded a shelf wider meets it | `fold-toggle.tsx`, `FoldBody`: no `hidden` attribute below 40rem. Mark the fold `data-folded` and hide it in CSS from 40rem only, as the head script already does. `shelf-view.tsx`, `onTabKey`: drop `:not([hidden])`, and when the frames run out, focus the panel rather than nothing. `leaveShelf` in `use-roving.ts` (`closest('[hidden]')`) follows | S |
| 48 | A20 | High | Wall, list and banners below 640 (390 by 844, 320 by 256, 639 by 800): a shelf taller than the screen whose rows aren't drawn yet (PlayStation 4 at 390; four shelves of the banners at 320 by 256). Found live | Tab from the shelf before lands on the shelf's grid, and the browser scrolls the grid's middle into view. The person sees a ring around the whole shelf, only its sides on screen, and no game focused, and it stays so: arrows and Enter do nothing. The next Tab goes into the shelf, to its first game. Shift+Tab back up to the PlayStation 5 shelf does the same at 320 by 256. The grid hands focus on only once its stop's row is drawn, and the rows drawn are the middle ones. In the list the grid is a `tbody` with no name. | 2.4.3 Focus Order (a stop that does nothing); Nielsen 1. 28's fix, incomplete | `use-row-window.ts`, `revealRow`: with no row drawn to measure, it returns without scrolling, as the wall, the banners and the list set no `grid-auto-rows`. Scroll the grid's top into view then. `use-roving.ts`: while `focusNext` waits and the grid holds focus, call `revealRow` again once a row is drawn, as it can measure then. The list's `tbody` gets `aria-label` (`Library.shelf.games`, as the wall's grid has) | M |
| 49 | A21 | High | Wall, list and banners: Page Down and Page Up between shelves. Found live at 390 and 1440 | Focus goes to the next shelf's grid, 1,500 to 5,100px below the screen, and nothing scrolls, so nothing focused is in sight. The grid doesn't answer keys, so the next Page Down scrolls the page by a screen; once the shelf's rows are drawn, its first game takes focus. In the wall and the list at 390 a far shelf took two or three presses; in the banners at 390 six never left the PlayStation 4 grid. Page Up to the first shelf left focus on its grid 2,200 to 2,600px above. | 2.4.7 Focus Visible (focus off screen); 2.4.3. 30's fix, incomplete: focus no longer drops to the page | `use-roving.ts`, `leaveShelf`: keep focusing the grid first, then let 48's `revealRow` scroll it in (today it does nothing, so nothing moves). While the grid holds focus, it answers Page Up and Page Down itself | S |
| 50 | C20 | Medium | List view: below 640 (`library-list/open/320-light-pt-BR`, `390-*`), and 820, 1440 and 1920. Every row measured live | Titles: at 390 one of 230 is cut after its two lines; at 320 forty are (Horizon Forbidden West, Assassin's Creed Odyssey, Like a Dragon: Infinite Wealth). Platforms: below 640 the column is 64px at every width, so each of the 67 games on two platforms shows one and "…" ("PS5 …"), even at 639, where the title has 435px. From 640 the platforms keep their format words in 176px, and 9 games (Portuguese) to 17 (English) still lose the second. The wall shows "PS5 · PC" where the list shows "PS5 …". The year is gone below 640. | Use: nothing cut off, and the list is where details are read. 35's fix, incomplete | `list-view.tsx`: each platform on its own line (`block`, the cell `whitespace-normal`): the row is two lines tall already. Below sm without the format, from sm with it. The year back from about 30rem, where the title fits a line | S |
| 51 | C21 | Low | The status row wherever it scrolls (`open/320-*`, `390-*`, `640-light-pt-BR`); the toolbar at 640 to 671 in Portuguese with a filter on. Found live | 37's fade isn't drawn. `.status-row::after` is 0px tall: the row centers its items (`items-center` in `segmented.tsx`), and an empty item then has no height. "Lista de desejos" and "Ab…" still end on a clean cut. And at 640 to 671 in Portuguese, "Filtros 1" still wraps the views onto a second row, alone at the right. At 1024, the width 37 named, the row holds. | Alignment; nothing lost at an edge. 37's fix, incomplete | `shelf.css`, `.status-row::after`: `align-self: stretch`. From sm to 44rem, the Filters button as its icon and count (its name stays) | S |
| 52 | A23 | Low | Shelf view on a phone (390 by 844), the shelf tabs with motion on: End. Found live | While the pager glides to the shelf chosen, the strip scrolls with the shelves going past, and the focused tab leaves its view for about a second. Tab still enters the shelf chosen. Under reduced motion it doesn't happen. | 2.4.7, for a moment. 32's third part, not done | `shelf-view.tsx`: while `chosen` is set, the strip keeps the chosen tab in view, not `current` | S |
| 53 | A24 | Low | Phone, the G key (390, found live) | G opens the view menu with focus on "Shelf", the first view. The shortcuts list says G is "Change the grouping", which is four arrows down. | Nielsen 7: a shortcut lands where it says. 34's fix, a detail | `LayoutMenu`: opened by G, focus the grouping that is checked (`onOpenAutoFocus`) | S |
| 54 | C22 | Low | Shelf view below 640 on a screen 30 to 36rem tall, which 36 now draws as a page (320 by 568, found live) | The shelf's heading doesn't wrap: "PlayStation / 5", "20 / GAMES" and "1 / PLAYING" stand as three narrow columns. | Alignment; one reading order | `shelf-view.tsx`, the shelf's `header`: `flex-wrap gap-x-3`, so the count and the playing note go under the name | S |
| 55 | C23 | Low | The shelf's key, from the code: the sample has no Someday or Unsorted game | Two lines no longer describe the shelf. Someday's swatch is now faded and smaller (`opacity: 0.55`, `scale: 0.88`), but a Someday box on the shelf isn't faded (`scale: 0.92`, `brightness(0.78)`), and "faint" is Wishlist's word. Backlog is now "a plain box, standing straight", which is also how an Unsorted game stands: the shelf gives it no mark, and the shelf's key has no Unsorted row (the wall's and the list's do). | Consistency: the key's one job. 38's and 45's fixes | Draw Someday the same in both: the swatch's fade on `.game-box[data-status='someday']` too (a design pass, as it changes the shelf), or the swatch back to the box's look. Unsorted: the wall's inbox icon as a small tag on the shelf's box, as Retired has ∞, and its row in the shelf's key | M |
| 56 | A25 | Low | The key, every view (from the code, `marks-list.tsx`) | Each term (`dt`) holds only the mark, which the wall's and the list's keys hide from assistive technology. A screen reader meets a list of empty terms, with each name and its words in the definition. | 1.3.1 Info and Relationships | `marks-list.tsx`, `row`: the name in the `dt` beside the mark, the words in the `dd` | S |
| 57 | A26 | Low | The shortcuts dialog (from the code, `shortcuts-dialog.tsx`) | The switch's hint isn't tied to the switch, and it is the one place that says `/` and `?` go off too, and where to turn them back on. Its words changed in this round. | Forms: hints tied with `aria-describedby` (1.3.1) | `aria-describedby` on the `Switch`, to the hint's id | S |
| 58 | A27 | Low | The key at 320 by 256, both languages (found live); any dialog with a second stop | 29's region is a second stop, so Tab comes back round to Close, which then shows its tip. Escape closes the tip, and only a second Escape closes the dialog. | Nielsen 3; 1.4.13 met | `dialog.tsx`: the dialog's Close without a tip (its X and its name are the same everywhere) | S |
| 59 | T14 | Low | The shortcuts dialog's switch hint, both languages (`Shortcuts.lettersHint`) | "This list stays at the keyboard button by the totals": the page never calls its counts "the totals", and "stays at" is odd. The first sentence runs two together. | Clear; one idea a sentence | EN "When off, no key on its own does anything, not even / or ?. Open this list again from the keyboard button by the game count." PT "Desligados, nenhuma tecla sozinha faz nada, nem / nem ?. Abra esta lista de novo pelo botão de teclado junto à contagem de jogos." | S |
| 60 | T15 | Low | The key's Private row, now shown only to the owner (`Library.marks.privateWords`) | It tells the owner "only the shelf's owner sees it". Everywhere else the owner is "you", as in a private box's name ("only you see it"). | "You" on the site | EN "a lock: only you see it", PT "um cadeado: só você vê" | S |
| 61 | T16 | Low | Chips, a title left out (`?q=-zelda`, found live) | Since 43, a value left out reads key first ("Theme: not Horror"), but a title left out still reads "Not in the title: zelda" ("Fora do título: zelda"). | One form for one thing | `Filters.chips.notText` EN "Title: not {text}", PT "Título: sem {text}" | S |

### What works

- Checked here and working as the table says:
  - 28: Tab and Shift+Tab reach all 25 shelves in the wall, the list and the banners at 390 by 844, 320 by 256 and 639
    by 800. Focus never fell to the page, and no stop was entirely under a bar.
  - 29: at 320 by 256 the key's body is a region named by its title, a stop after Close with the ring inside its edge,
    and the arrows scroll it to its last row, in three views and both languages. At 320 by 640 in Portuguese it fits
    now, so it isn't a stop.
  - 31: with shortcuts off, `?` does nothing, and the keyboard button by the totals (28 by 28) turns them back on at
    820, 390 and 320 by 256.
  - 32: the arrows, Home and End move the tabs' stop with focus, and Tab then enters the shelf chosen, with motion and
    without.
  - 33: the list has the key, with the wall's icons and Unsorted; Private shows only to the owner.
  - 34: below 640, G opens the view menu at its button, and Escape gives focus back to the button.
  - 36: 320 by 568 gets the page; from 390 by 576, the full-screen shelf.
  - 37: from 672 to 1600 one row of controls, in both languages, filtered or not, as visitor and owner.
  - 38: the wall's sample stays on one line, and Someday's swatch reads apart from Backlog's in the dark key.
  - 39: the view menu's button says "Plataforma" beside its icon, and shows the icon alone at 320.
  - 40: "Point-and-click", "Hack and slash, beat 'em up" and "Visual novel" are `lang="en"` in the Portuguese panel.
  - 41 to 44: "Real-time strategy (RTS)", "Previous or next game", "Theme: not Horror" and "Tema: exceto Terror",
    "Nenhum jogo encontrado com estes filtros."
- Every dialog's title is a string, so 29's region always has a name.
- The desktop focus walks (1440) in all four views are as the second review left them: one stop a shelf, every ring
  drawn, none covered.
- No new axe rule, no console error, no sideways scroll.

### Not checked

- Screen-reader speech: how the grid's name is spoken as it hands focus on, the key's region, the tabs.
- Touch, Safari and Firefox. Firefox has no `animation-timeline`, so 51's fade stays off there by design.
- The stress set (1,280 games), where most shelves are taller than a phone's screen, so 48 and 49 would meet a person
  on nearly every shelf.
- A Someday, an Unsorted or a private game on screen: the sample has none, so 55 is from the code.
- Windows forced colors, text spacing and a phone's system text size; the shortcuts dialog at 400% zoom; the game page's
  genres (row 02's review); Storybook's stories.
- Other products weren't opened.

### Fixed after the third review

All of them, in `d8cd564` and `5026dd8` on `fix-01-library`:

| # | Outcome |
| - | ------- |
| 47 | Fixed. A folded shelf's games carry `data-folded`, hidden by `shelf.css` from 40rem only, not the `hidden` attribute (`FoldBody`). Tab from a phone tab and Page Up and Down skip a shelf only when its games aren't shown (`foldedAway`); when the shelf chosen never draws a game, Tab focuses the shelf's panel, now focusable by script. |
| 48 | Fixed. `revealRow` scrolls a grid's top into view when no row is drawn to measure by, and the shelf asks again once one is (`useRovingShelf`); a grid that takes focus hands it on a frame later, after the browser's own scroll. The list's `tbody` is named as the wall's grid is. |
| 49 | Fixed, by 48's change: Page Down's grid scrolls to its top and hands focus to its game. The grid doesn't answer Page Up and Down itself, as it holds focus only until a row is drawn. |
| 50 | Fixed. One platform a line, its formats together from 640, a third and more as a count ("+1"). Below 640 the cells keep 8px to their sides, the cover column 52px and the platforms 72px. The year is back from 480 (30rem), where a title takes one line; below it, two. |
| 51 | Fixed. The fade stretches to the row's height. Filters shows its icon and count up to 704 (44rem), its name said in full. |
| 52 | Fixed. While the keyboard has chosen a tab, the strip keeps that tab in view. |
| 53 | Fixed. Opened by anything but its button, the phone's menu starts at the grouping chosen. |
| 54 | Fixed. The shelf's heading wraps: the counts go under the name. |
| 55 | Fixed. Someday's swatch is drawn as its box stands (smaller, in shade, not faded), and every swatch is filled in a mid tone, as a cover fills a box, so the shade shows. Unsorted gets the wall's inbox as a tag on the shelf's box (2D, with covers), and its row in the shelf's key; spec 3.2 says so. |
| 56 | Fixed. Each term holds the mark and its name, the definition its words (a subgrid keeps the mark beside both lines). |
| 57 | Fixed. The switch's hint is its `aria-describedby`. |
| 58 | Fixed. A dialog's Close has no tip, in every dialog. |
| 59 | Fixed, with the words proposed. |
| 60 | Fixed, with the words proposed. |
| 61 | Fixed, with the words proposed. |

The phone's far shelf panels are no longer an axe hit (46): a panel is focusable by script now (47).

## Fourth review

Captured on the build of 5026dd8, 19 Nov 2026: d8cd564's fixes, plus 5026dd8, which sets each of the key's terms at the
top of its row. The indexes name d8cd564, but the retaken `marks` pictures show 5026dd8's change. As the procedure's step
4 now says (74bc8c5), only the scenes the fixes touched were taken again, with `pnpm ui:capture` against
`pnpm serve:test`: `library` (`open`, `marks`, `layout-menu`), `library-wall` (`open`, `marks`), and `library-list` and
`library-banners` (`open`). The fixes didn't touch the others (`filtered`, `no-match`, `sort-menu`, `grouped`,
`library-mine`, `library-empty`). No scene failed, there was no console error, and nothing scrolls sideways. axe-core
found only `region` on the phone's view menu (27). The far phone panels' `scrollable-region-focusable` (46) is gone.

Lenses run: critique, accessibility (WCAG 2.2 AA) and words, one after the other, by one Claude Code agent (the
`ui-review` subagent). It checked each of 47 to 61 against its outcome above, and read the diff of `d8cd564` and
`5026dd8` (`src/`, `messages/`, `docs/spec.md`). The Design plugin's skills weren't available in this session, so each
lens followed [the procedure's](../ui-review.md) checklists by hand. Live checks used headless Playwright (Chromium)
scripts against the same server, kept outside the repository, and ran only where a fix changes behavior:

- 47: PS4 folded at 1280 by its button, then every view at 390 by 844 and 320 by 200, and Tab from its phone tab;
- 48: six Tabs from PlayStation 5, then six Shift+Tabs, in the wall, the list and the banners at 390 by 844 and 320 by
  256;
- 49: five Page Downs, then five Page Ups, in the same three views at 390 by 844 and 1440 by 900, and at 1440 with PS4
  folded, in the wall and the shelf;
- 52: End on the phone's tabs with motion, the strip read every 100 ms while the pager glided, then Tab. Also a tab
  tapped (touch events) or clicked, then the pager swiped or scrolled sideways;
- 53: G at 390 in the shelf, in the wall grouped by status and in the Portuguese list grouped by year, then the arrows
  and Escape.

50, 51 and 54 to 61 were judged from the captures and the code.

Of 47 to 61, fourteen work as the table says: 47 to 50 and 52 to 61 (54 from the code). One is only partly fixed:

- 51: the fade is drawn now, but below 640 it stops 16px short of the screen's edge (64).

52's fix brought 62, and 55's new state has no story of its own (63). Two notes on outcomes that hold:

- 58: no dialog that `src/ui/dialog.tsx` draws has a tip on its Close, but the game page's screenshot viewer
  (`screenshot-viewer.tsx`, row 02's screen) still has one;
- 50: at 320 a title gets 8px more room (100px of text, 92 before), so the longest titles may still end at two lines
  with "…". This wasn't measured again.

| # | IDs | Severity | Where | What | Why | Fix | Effort |
| - | --- | -------- | ----- | ---- | --- | --- | ------ |
| 62 | C24 | Medium | Shelf view on a phone (390 by 844), the shelf tabs: a tab tapped (touch) or clicked, then the shelves swiped or scrolled sideways. Found live | The strip stops following the shelf in view. After a tap on PS4 and four swipes, the pager shows PlayStation 2's games, but the strip still shows PS5 to PSP, and PS2's tab, the current one, is cut off at the right edge. On the full-screen shelf the tabs are the shelf's only visible name, so nothing in sight says which shelf this is. It lasts until focus leaves the tabs. Cause: 52's fix keeps the chosen tab in view (`chosen ?? current`), and a tapped or clicked tab keeps focus (Chrome focuses a button on tap, and a swipe doesn't move focus), so `chosen` never ends. Before the fix the strip followed `current`. | Nielsen 1 (visibility of status); spec 3.4, "a row of tabs shows where you are". Brought by 52's fix | `shelf-view.tsx`: `chosen` ends once the pager arrives (`useEffect(() => { if (chosen === current) setChosen(undefined) }, [chosen, current])`), so End's glide still keeps the chosen tab and a swipe afterwards is followed again. Or end it when the pager is taken in hand (`pointerdown` or `wheel` on `.shelf-pager`). A test: click a tab, scroll the pager two shelves on, and the current tab is in the strip's view | S |
| 63 | C25 | Medium | Storybook, `library.stories.tsx`, `BoxStates` (from the code) | The box's new Unsorted state, its inbox tag (55), has no story. `BoxStates` is "one of every state a box can be in (spec 3.2)", and spec 3.2 now lists Unsorted, but its `states` stop at Retired. The only story with the tag is the key's (`MarksOnTheShelf`), where it sits on a swatch. | AGENTS.md, "Give it a story": every new element, with each of its states. By the letter of the scale, a broken AGENTS.md rule is a Blocker. Rated Medium because the tag itself is in Storybook, in the key's story; only the box's list of states falls short | `library.stories.tsx`: `stand(game(9, 'unsorted'))` in `states`, and Unsorted in `BoxStates`' comment | S |
| 64 | C26 | Low | The status row below 640 (`library/open/320-light-pt-BR`, `390-dark-pt-BR`, `390-light-en`) | 51's fade is drawn now, but it stops 16px short of the screen's edge. Below 640 the row runs edge to edge with 16px of padding (`max-sm:-mx-4 … max-sm:px-4` in `status-row.tsx`), and the sticky fade (`right: 0`) stops at the padding's edge, not the screen's. Whatever passes under those 16px is drawn at full strength beyond the fade. At 320, "Zerado" reads "Ze" dimmed, then "rad" bright to the edge; at 390, "Ab" is bright after a dark band. That reads as a glitch more than as more to come. From 640, where the row has no padding, it fades as meant ("Lista de desejos"). | Alignment; nothing lost at an edge. 51's fix, incomplete | `shelf.css`: below 40rem, `.status-row::after { right: -1rem }` (the row's own padding), so the fade ends at the screen's edge | S |

### What works

- Checked live and working as the table says:
  - 47: PS4, folded at 1280, stays hidden there. Below 640 it shows its games in all four views, at 390 by 844 and at
    320 by 200, and Tab from its phone tab focuses its first game, in sight.
  - 48: every Tab and Shift+Tab, 72 in all, landed on a game with its centre in sight, never on a grid.
  - 49: every Page Down and Page Up, 60 in all, landed on a game of the next or previous shelf, in sight. At 1440, a
    folded shelf is passed over in the wall and the shelf.
  - 52: through End's glide, about a second and a half, the focused tab never left the strip's view. Tab then entered
    the last shelf, with a game in sight.
  - 53: G starts at the grouping checked ("Platform", "Status", "Ano"), the arrows go on from it, and Escape gives
    focus back to the menu's button. Opened by its button, the menu still starts at the first view.
- From the captures and the code:
  - 50: one platform a line ("PS5" over "PC") at 320 and 390, and from 640 with the format words ("PS5 FÍSICO" over
    "PC DIGITAL"). The year is back at 640, and from 480 by the code.
  - 51: at 640 in Portuguese, "Lista de desejos" fades into the wall, and Filters as its icon keeps the controls to one
    row.
  - 54: the heading wraps (`flex-wrap`), so the counts go under the name and not into columns (from the code).
  - 55: Someday's swatch stands as its box does (0.92, brightness 0.78), filled in a mid tone, so it reads darker and
    smaller than Backlog in both themes. The shelf's key has Unsorted with its inbox tag, and a box with covers draws
    the same tag, as Retired's does.
  - 56: each term holds the mark and its name, and the definition holds the words. Since 5026dd8 the name stands at the
    top of its row, in both keys, both themes and both languages, and `text-en.txt` reads the name, then the words.
  - 57: the `Switch` passes its props to its input, so the hint describes the switch itself.
  - 58: no dialog that `src/ui/dialog.tsx` draws has a tip on its Close.
  - 59 to 61: the words proposed, in both languages.
- No new axe rule, no console error in the captures or the live checks, and no sideways scroll.

### Not checked

- Screen-reader speech: the key's terms (56), the switch's description (57), the list's named row group (48).
- An Unsorted game on the shelf, and a game on three platforms (the list's "+1"): the sample has neither, so both are
  from the code.
- These weren't checked live, as this round kept them to the captures and the code: how many list titles are still cut
  at 320 (50), the shelf heading at 320 by 568 (54), and the filtered toolbar from 640 to 703 (51). `filtered` wasn't
  captured again.
- Touch, beyond 62's swipes. iOS Safari doesn't focus a button on tap, so 62 may not happen on an iPhone; only Chromium
  was run. Firefox has no `animation-timeline`, so it draws no fade (51, 64), by design.
- Storybook wasn't opened: 63 is from the stories' code.
- Windows forced colors, text spacing, a phone's system text size, the stress set, and the game page's screenshot viewer
  (row 02).
- Other products weren't opened.

### Fixed after the fourth review

No Blocker or High was left, so the review ends here (docs/ui-review.md, "A new feature", step 4). The three found
were fixed all the same:

| # | Outcome |
| - | ------- |
| 62 | Fixed. The keyboard's or a tap's choice ends once the pager arrives, and the strip follows the swipe again. Checked live at 390: after a tap on PS4 and four swipes, the current tab stayed in the strip's view. |
| 63 | Fixed. `BoxStates` has an Unsorted box, and so do the wall's and the list's stories that share its games. |
| 64 | Fixed. Below 640 the fade reaches the screen's edge (`right: -1rem`). |

The fourth review's two notes stay open: the game page's screenshot viewer keeps a tip on its Close (row 02's review),
and a long title at 320 may still end in "…" after two lines (50 gave it 8px more).
