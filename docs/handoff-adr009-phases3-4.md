# ADR 009 handoff: dialogs and simpler Saves

Updated 9 November 2026. Read `AGENTS.md`, `docs/handoff.md`, the spec and architecture,
then [ADR 009](adr/009-game-page-and-dialogs.md). This is an implementation handoff for
its remaining phases, not a new design decision. The owner accepted ADR 009; this note
does not start either phase or authorize a desktop release.

## Starting point

Phases 1 and 2 are complete. Games open as full pages, with the library beside them on
wide screens. PRs [184](https://github.com/ldallacqua/shelf/pull/184) and
[185](https://github.com/ldallacqua/shelf/pull/185) are merged and deployed. The last
implementation commit on main is `1302295` (PR 185).

The sidebar now has Library, search, then an aligned grouping/Ready to play row, with
Ready to play last. Hide list / Show list remains outside the sidebar in the game's top
row. `besidePreference` in `features/library/preferences.ts` remembers the choice through
the existing head script; CSS hides the column without unmounting its list. Preserve its
search, folded groups, scroll, keyboard focus and available reopening control.

PR 185 passed `LIGHTHOUSE_SLOWDOWN=4 pnpm verify --skip-browser`: 2,073 site tests,
301 Rust tests, production build, JavaScript budgets, Lighthouse and Storybook build.
Lighthouse performance was 99/98/98/99, accessibility 100 throughout. The game page is
very close to its 230.5 KB JavaScript limit. The new control and visibility stories were
checked in both languages/themes. The full desktop check passed for phase 2 before its
sidebar follow-up; it was not repeated for PR 185. Browser test suites remain skipped
under the owner's MVP rule. A React script-tag warning appeared during a dev-mode locale
switch; do not claim that navigation was console-clean. The compiled control stories had
no console errors.

The landing page describes browsing beside a game, but must not link to `/u/sample`:
that shelf is a local fixture and does not exist in production.

## Phase 3: one dialog pattern

**Built 10 Nov 2026** on branch `one-dialog` (ADR 009, "Phase 3, one dialog"): `src/ui/dialog.tsx` and
`ConfirmInPlace` replace the sheet, the beside-Play popover and the centered frame. The notes below are
the brief it was built from; phase 4 starts from the dialog as `saves-panel.tsx` now opens it.


**Outcome:** selecting a configuration item in the three-dots menu closes the menu and
opens a proper dialog over the game page. The menu must never grow into a large panel.
Use one responsive dialog primitive: centered on wide screens, bottom/full-screen on
phones as ADR 009 specifies. Remove drawers as a separate implementation pattern, not
the compact-screen presentation of the shared dialog.

Start by inspecting `src/ui/sheet.tsx` and the existing confirmation/modal primitives in
`src/ui`. There is currently no `src/ui/dialog.tsx`. Reuse the accessible primitives and
tokens already present; do not build another focus trap or unrelated modal system.

Current migration inventory (search again before deleting anything):

| Surface | Entry point |
| --- | --- |
| Saves | `src/features/desktop/saves-panel.tsx` |
| Find a download | `src/features/desktop/find-download.tsx` |
| Their shared sheet/popover wrapper | `src/features/desktop/beside-play.tsx` |
| Add a game | `src/features/add-game/add-game.tsx` |
| Save as a shelf | `src/features/filters/save-shelf.tsx` |
| Keyboard shortcuts | `src/features/filters/shortcuts-dialog.tsx` |
| Library filters on narrow screens | `src/features/filters/filter-panel.tsx` |

`BesidePlay` currently switches between Sheet and Popover using `GAME_CENTERED` from
`features/game-detail/hero.ts`. Remove that wrapper and obsolete breakpoint/frame code
after all consumers and tests are migrated. Keep ordinary menus, tooltips and small
popovers where they still fit; this phase is not a blanket replacement of every overlay.

Implementation order:

1. Do the design pass: inspect relevant products in a browser and the ADR's sources;
   use installed design skills, or record their absence and review layout, accessibility
   and copy directly. Define dialog sizing, scrolling, close control and mobile behavior.
2. Build the shared primitive and stories before migrating consumers. Include short and
   long content, a form, narrow widths, overflow and keyboard focus. Keep titles and close
   labels accessible; use existing motion tokens and reduced-motion behavior.
3. Migrate Saves and Find a download first. Coordinate menu dismissal and dialog opening
   so the menu's focus restoration cannot steal focus or immediately dismiss the dialog.
   Closing returns focus to a surviving trigger on the page, not an unmounted menu item.
4. Migrate the remaining sheets. Preserve the wide library filter column; replace its
   narrow-screen overlay. Audit confirmations opened from inside dialogs: use an inline
   confirmation/step where appropriate, rather than accidentally stacking full modals.
5. Remove unused Sheet/BesidePlay/frame code, imports, tests and stories. Update the spec,
   ADR findings, architecture and any affected landing-page behavior.

Completion checks: one configuration surface at a time; Escape closes it and returns to
the page; Tab stays within a modal; background content is inert; long content and mobile
keyboards remain usable; unsaved-work and destructive-action protections survive.
Existing actions must still work at desktop, phone and very wide/TV widths. Keep phase 3
about the container and interactions; phase 4 changes the information inside Saves.

## Phase 4: Saves with the important information first

**Built 10 Nov 2026** on branch `saves-simpler` (ADR 009, "Phase 4"): `saves-standing.ts`, the status
beside Play and the dialog's new order. Not in this phase: a desktop release, so the app's own Windows
notifications still say snapshot; cloud history migration (#170).


**Outcome:** answer whether saves are protected, where they are and what needs action,
without making the user read a technical explanation. Simpler must not mean hiding an
error, losing an action or implying that a local backup has reached the cloud.

Start with `src/features/desktop/saves-panel.tsx`, `saves.ts`, `saves-later.tsx`,
`before-play.ts`, `save-settings.tsx`, and `src/features/game-detail/play.tsx` /
`use-game-state.ts`. Inspect the existing stories and tests before restructuring them.
Keep all desktop-only copy in `messages/app/{en,pt-BR}.json`, except existing shared Play
copy where its current boundary requires it.

Implement ADR 009 decision 5:

- Once saves are enabled, show a compact status button beside Play that opens Saves.
  While off, keep the entry in the menu to enable them. Do not make extra remote reads
  on every render; reuse existing bridge/state behavior and handle older app versions.
- Lead the dialog with one truthful state sentence, destination/time when known and the
  action appropriate to that state. Show progress here while work runs.
- Keep the enable switch on one line. Show the introductory explanation only while off.
- Rename user-facing Snapshots to History/backups. Initially show the newest three and
  an All N expansion. Preserve restore actions, device/time and local/cloud delivery marks
  with accessible words/tooltips. Internal snapshot IDs and storage formats stay unchanged.
- Fold save-location configuration into one summary line. Open it automatically when no
  usable location was found. Keep folder selection/removal, game-folder selection, manifest
  matching, registry limitations and PCGamingWiki/Ludusavi attribution available one step away.
- Leave caps and destination configuration in Settings. Remove their repetitive explanation
  from this dialog; the top status still clearly names the destination and relevant failures.

Required states in stories and meaningful tests: off, first setup/no folders, local-only,
cloud up to date, local backup waiting for upload, newer remote saves, conflict, signed out,
quota full, unreachable destination, loading, failed read, progress, restore confirmation,
and long history. Reuse fixtures and existing views; do not create fake production accounts.

Safety/behavior that must survive the redesign:

- Play checks the cloud first. Conflicts stop launch for the existing explicit choice;
  never silently choose a snapshot or overwrite progress.
- Play stays blocked while synchronizing and says what it is doing. The current timeout
  is **30 seconds without progress**, not a total 30-second transfer limit.
- A restore cannot run while the game runs. Keep confirmations and the interrupted-restore
  protections. No server endpoint may receive saves, tokens or keys.
- Distinguish a backup still waiting on this PC from one delivered to the selected place.
  Keep the header's connection warning and the way to repair it in Settings.
- Preserve the existing before-Play choices, including their semantics, rather than
  changing launch policy as an incidental part of simplifying the screen.

Cloud history migration is a separate follow-up (#170), not part of this redesign. The
Google folder-cache robustness concern and Google's Testing-mode expiry are also not
solved by changing UI copy. Do not claim they are fixed or silently expand this phase.

## Navigation and validation guardrails for both phases

- Game URLs remain plain `/u/{handle}/game/{slug}`. Never carry library filters in their
  query string: that caused repeated 1–4 second navigation delays on Vercel. Arrangement
  is handed over in memory through `features/library-beside/store.ts`.
- Preserve `hand-off.tsx`, `drawn-page.tsx`, `PageDrawn`, the bounded cover transition,
  Back behavior, the persistent game layout, sidebar windowing and its new visibility
  preference. React Activity keeps hidden routes alive; hidden surfaces must not trap
  focus, react to Escape or own global shortcuts.
- Read the relevant local Next.js guides in `node_modules/next/dist/docs/` before changing
  routing/layout code. Do not assume older Next.js conventions apply.
- Keep public/private shelf boundaries and the desktop-only feature gates. Inspect small
  screens, both themes/languages, touch and keyboard behavior, and the browser console.
- Every new visible component/state needs a Storybook story. Update behavior tests and
  relevant e2e source/fixtures, but do not run the prohibited browser suite.
- Before each phase merges, run `LIGHTHOUSE_SLOWDOWN=4 pnpm verify --skip-browser` on its
  final commit and verify the literal `Every step passed`. Do not raise a JavaScript budget
  without measuring and explaining the change.
- Run `pnpm desktop:check` against a **fresh** `pnpm serve:test` for the changed Play/Saves/
  download flows. Search its text selectors whenever changing app words. Use stand-ins,
  never real cloud accounts or the owner's saves. Stop only test processes by exact PID;
  never touch the installed Shelf app.
- Prefer one reviewable PR per phase. Record design sources, checks and any unchecked
  behavior honestly. The owner permits merging; a new native desktop release still needs
  explicit authorization. Web-only changes can reach the hosted app without a binary bump.

Suggested first action in the next session: inventory every Sheet/BesidePlay consumer,
inspect the shared UI primitives, then design and story the responsive dialog for phase 3.
Do not begin phase 4 until that shared container is ready.
