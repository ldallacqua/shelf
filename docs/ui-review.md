# The UI/UX review

The UI/UX review looks at what a person sees through three lenses: the critique, accessibility and the words.
It runs in two places: on **every new feature**, before it merges (below), and in **step 10**, the final review,
over every page Save State has, one screen at a time. It is written for every agent and person. Claude Code runs
the whole of it, capture and all three lenses, in one subagent (`.claude/agents/ui-review.md`, which only reads
this file), with its Design plugin's skills beside each lens; never one agent per lens (the owner's rule, 14 Nov
2026; the pilot's three were before it). Any other agent or person does the same sections by hand. Either way
the report says which ran.

This is not [the design pass](design-pass.md). The design pass comes before the code and decides what to build;
this review looks at what was built, in a browser, and ends in a list of findings.

## A new feature

The owner's rule (13 Nov 2026): every feature anyone can see passes this review before it merges, and merging is
deploying (Vercel builds `main`).

**Feature → review → fix → review → deploy.**

1. **Feature.** Built after its design pass, from the design specialist's plan, as AGENTS.md says.
2. **Review.** Capture the screens the feature touches, in the states it adds (section 1), and run the three
   lenses over them (section 2), with the design specialist's plan beside them: what was built should do what
   it planned, or the pull request says why not. A screen or state `pnpm ui:capture` doesn't know yet is
   added to its list in the same change, with a scene for each new state (an open dialog, an error, an empty
   list), so the next review finds it.
3. **Fix.** Every Blocker and High is fixed in the same pull request. Medium too, unless the owner says it waits;
   Low may wait. Whatever waits goes into an issue, linked from the pull request.
4. **Review again.** Capture again only the scenes the fixes touched (`pnpm ui:capture screen:scene,scene`,
   section 1), and run the lenses over what changed, to see the fixes work and broke nothing: each fix the report
   lists, checked against what it says it does, and the fixes' diff, read for what they may have broken. A live
   check (a script that drives the page) only where a fix changes behavior, such as the keyboard, focus or
   scrolling; the rest from the captures and the code. It is not the whole review again: a review run again took
   as long as the first, a third of an hour or more each round (the owner's rule, 19 Nov 2026). Repeat 3 and 4
   until no Blocker or High is left.
5. **Deploy.** The pull request carries the review: the findings, what happened to each, and the issue for what
   waits. Then it merges as AGENTS.md says.

A change that only moves pixels inside one component (a color, a spacing) may run the review on that screen alone.
A change nobody sees (a server job, a test) needs none.

## Step 10: the screens, in order

One report per row, in `docs/review/`, named by its number and screen (`00-sign-in-up.md`). A row is done
when its report is written and the owner has chosen what to fix; the fixes are their own pull requests.
`pnpm ui:capture` knows each screen by the name in the second column.

| #   | Screen                                                | Names for `ui:capture`                         | Status                |
| --- | ----------------------------------------------------- | ---------------------------------------------- | --------------------- |
| 00  | Sign in and sign up (the pilot)                       | `sign-in`, `sign-up`                           | [Report](review/00-sign-in-up.md); fixes wait in [#217](https://github.com/ldallacqua/shelf/issues/217) |
| 01  | The library: toolbar, filters, each view, empty, full | `library`, `library-mine`, `library-wall`, `library-list`, `library-banners`, `library-empty` | [Report](review/01-library.md); every finding fixed in #221, reviewed four times |
| 02  | A game's page, and the list beside it                 | `game`, `game-mine`                            | Not started           |
| 03  | Organize: unsorted, hours, archived                   | `unsorted`, `hours`, `archived`                | Not started           |
| 04  | Setting a shelf up                                    | `start`                                        | Not started           |
| 05  | The landing page                                      | `home`                                         | Not started           |
| 06  | Settings: the hub and its pages                       | `settings`, `settings-*`                       | Not started           |
| 07  | A smart shelf, the trophy wall                        | `shelf`, `trophies`                            | Not started           |
| 08  | Downloads, consent, privacy, terms, not found         | `downloads`, `consent`, `privacy`, `terms`, `missing` | Not started    |
| 09  | The duel (spec 3.14): choosing, a duel, the game left  | `duel`, `duel-empty`, `duel-visitor`           | Reviewed as a feature in its pull request |

Left out: `/admin` and `/foundations` (not for visitors), and the 3D shelf, behind Experimental views, which
gets a pass of its own with `pnpm perf:3d` beside it.

## 1. Capture

The lenses judge pictures and facts taken the same way every time, not a memory of the page.

1. `pnpm build`, then `pnpm serve:test` (the test doubles, the sample shelf of 230 games, a fresh copy of the
   database). Stop any `pnpm dev` first: they share the port.
2. `pnpm ui:capture <name…>` (or `--list` for the names). For each screen and each of its scenes (the page as
   it opens, and states worth seeing: an error, a filled form, an open menu), it writes to
   `.data/ui-review/<screen>/<scene>/`:
   - `<width>-<theme>-<locale>.png`, the first screen at every main breakpoint, each where it turns on or a
     device people use: 320 (the narrowest phone, WCAG's reflow width), 390 (a phone), 640 (`sm`), 820 (`md`,
     a tablet), 1024 (`lg`, a tablet sideways or a small laptop), 1440 (`xl`, a desktop) and 1920 (`2xl`, a wide
     monitor). Layout is what changes with the width, so 390 and 1440 are taken in light and dark, English and
     Portuguese, and the others once, light and Portuguese, whose longer words break a layout first: thirteen
     pictures. `…-full.png` beside each when the page is taller than one screen, in a scene that opens nothing:
     with a menu or a dialog open, the page below it is the one the scene without it shows.
   - `axe.json`: axe-core's violations for WCAG 2.2 A and AA and best practice, for each capture.
   - `focus.json`: Tab pressed from the top of the page, desktop, light, English: each stop's element, name,
     size, and whether a ring was drawn.
   - `text-en.txt`, `text-pt-BR.txt`: every word the page shows, in reading order.
   - `facts.json`: headings in order, sideways scroll at each width, console errors, the smallest targets.
   - and `.data/ui-review/<screen>/index.md`, which lists all of it. A lens starts there.

   To capture again only the scenes a fix touched, name them after the screen: `pnpm ui:capture
   duel:full,no-match` replaces those scenes' folders, keeps the others, and lists what it took in an
   index of its own (`index-full-no-match.md`).

   A scene's thirteen looks are taken four at a time, each in its own browser (`UI_CAPTURE_WORKERS` sets how
   many): about a second and a half a look on the owner's machine, where one at a time took four.
3. Covers come from the real image servers, as a visitor sees them; the script waits for them to paint.
4. A `-full` picture may show a seam where the first screen ends: the wall behind the page is a fixed layer,
   which a full-page picture draws once. It is not a fault in the page.

What the script can't see: anything after a real third-party sign-in (Steam, Nintendo), the desktop app's own
windows, a slow network, a screen reader's speech. Say so in the report rather than guess.

## 2. The three lenses

Each lens reads the captures and the code behind the screen (`src/features/…`, `src/ui/…`, `messages/…`),
changes nothing, and writes findings in this shape:

| Field    | What it holds                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------- |
| ID       | `C1`, `C2`… for the critique, `A1`… for accessibility, `T1`… for the words                          |
| Where    | Scene, width, theme, language, and the element ("sign-up, 390, dark, pt-BR: the Create button")     |
| What     | What is wrong, as the person meets it                                                               |
| Severity | Blocker, High, Medium or Low (below)                                                                |
| Why      | The heuristic, the WCAG criterion by number, or the rule of AGENTS.md / ADR it breaks                |
| Fix      | A concrete change, naming the component, token or message key where it can                          |
| Effort   | S (words or a class), M (one component), L (a flow or a new element)                                |

**Severity.** *Blocker*: a person cannot do what they came for, a WCAG 2.2 A or AA criterion fails, or a rule
of AGENTS.md is broken. *High*: they can, but most will stumble or misread it. *Medium*: friction, or an
inconsistency someone will notice. *Low*: polish.

Every lens also lists **what works** (one or two lines, so a fix doesn't undo it) and **what it could not
check**. Fewer, surer findings beat many guesses: a finding the pictures don't show is marked "from the code".

### 2a. Critique

Read `index.md`, then every picture, phone and desktop, both themes, both languages. Then the screen's
components. Check, for the screen as it is:

- **First look.** In the first screen, what draws the eye first, and is that right? Is the purpose clear in two
  seconds? Is the one main action the most prominent?
- **Use.** Can the person do what they came for, in as few steps as it needs? Is every control obviously one?
  Is every state (chosen, done, waiting, failed) said in words as well as shown?
- **Hierarchy and layout.** One reading order; space groups what belongs together; alignment holds; at every
  width, nothing crowded or cut off, nothing lost in empty space, nothing that scrolls sideways; the layout
  changes where a breakpoint says and holds between them (look hardest at 320, 640 and 1024, where bands meet);
  the longer Portuguese doesn't break a line it shouldn't.
- **Consistency.** Built from `src/ui` and the tokens; the same thing looks and behaves the same as on the pages
  already reviewed; it reads as games, not books (ADR 002: covers face out, no serif); both themes are the same
  room with the lights on or off, and no text sits in the bright band behind the games.
- **Every state.** Empty, loading (ghosts, never words or spinners), partly done, done, failed, phone, both
  themes, both languages, reduced motion. A state not captured is checked in the code and said so.
- **Nielsen's ten heuristics** as a last sweep: visibility of status, match with the real world, control and
  freedom (Back, Undo, Cancel), consistency, error prevention, recognition over recall, flexibility, minimal
  design, recovering from errors, help.

Compare with how two or three good products do the same screen when it helps; say which.

### 2b. Accessibility: WCAG 2.2 AA

Read `axe.json` and `focus.json` first, then the pictures, then the components. Every axe violation is a
finding unless it is a false positive, which the finding explains. Then what axe can't see:

- **Keyboard.** Every stop in `focus.json` is something to act on, in reading order, with a ring (the 2px accent
  ring); nothing a pointer can do is missing from it; no stop is hidden or covered by a sticky bar (2.4.11).
- **Targets.** At least 24 by 24 pixels, or spaced as 2.5.8 allows (`facts.json` lists the smallest).
- **Names, roles, states.** Every control's name says what it does; state through `aria-pressed`,
  `aria-current`, `aria-checked` or native inputs; an icon beside words is hidden; a change made out of sight
  is announced (`role="status"`, `aria-live`).
- **Forms.** A visible label on every input; hints tied with `aria-describedby`; an error in place, in words,
  tied to its field, saying how to fix it (3.3.1, 3.3.3); no puzzle to sign in, paste and password managers
  work (3.3.8); nothing asked twice (3.3.7).
- **Seeing.** Text 4.5:1 (3:1 large), controls and graphics 3:1, in both themes; state never by color alone;
  readable at 200% zoom and at 320 CSS pixels wide with no sideways scroll (1.4.10: the 320 capture);
  headings in order (`facts.json`).
- **Motion.** Anything that moves has a calm version under reduced motion.

The skill in Claude Code's Design plugin (`accessibility-review`) is written for WCAG 2.1: hold it to 2.2.

### 2c. The words

Read `text-en.txt` and `text-pt-BR.txt` side by side, the pictures for where each line sits, and the
screen's keys in `messages/en.json` and `messages/pt-BR.json` (and `messages/app/`). Check against
[the design pass's copy list](design-pass.md#4-copy):

- **Clear:** says exactly what happens; no jargon; the same word for the same thing as everywhere else
  (Organize, Settings, shelf, Save State for Windows).
- **Short:** the fewest words that carry it; one idea a sentence.
- **Useful:** a button starts with a verb and names its outcome; an empty state says what goes there and how to
  start; an error says what happened, why, and what to do.
- **Save State's voice:** plain, concrete, calm; no hype, no exclamation marks; "you" on the site.
- **Portuguese:** the same meaning, not word for word, natural to a Brazilian; consistent with itself; fits
  where the English fits (buttons, narrow places, the phone).

A fix names the key and gives both new lines.

## 3. The report

For a feature, the joined report goes in the pull request, in the shape below, and the second review adds what
happened to each finding. For step 10, the one running the review joins the three lenses into
`docs/review/<nn>-<screen>.md`: duplicates merged (one
finding, both IDs), ordered by severity, each with its fix and effort, then what works and what wasn't
checked. Link the report from the table above. Captures are not committed; the report says the commit they
were taken on.

```markdown
# <nn> <Screen>

Captured on <commit>, <date>. Lenses run: critique, accessibility, words (and how: subagents, skills, by hand).

## Findings

| # | IDs | Severity | Where | What | Why | Fix | Effort |
| - | --- | -------- | ----- | ---- | --- | --- | ------ |

## What works

## Not checked

## Chosen to fix

(The owner's choice, then each finding's outcome: fixed in #PR, left, or no change needed.)
```

## 4. Fixing, in step 10

A feature's fixes follow "A new feature" above. In step 10, the owner chooses which findings to fix. The fixes for one screen go on one branch, as their own pull request:
each visible change with its design pass, its story, both languages, and the reference screenshots if the look
changed on purpose. After the fix, capture again and compare the pictures; the report's last section records
what happened to each finding.
