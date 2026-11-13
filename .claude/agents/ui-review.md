---
name: ui-review
description: Runs Shelf's whole UI/UX review of a feature or a screen - captures it, judges it through the critique, accessibility (WCAG 2.2 AA) and words lenses, and reports the findings joined into one list - as docs/ui-review.md lays out. Use after building a feature and again after fixing what it found, before merging; or for a screen of step 10's review. Give it the feature's screens (names in `pnpm ui:capture --list`, or addresses) and what changed.
tools: Read, Grep, Glob, Bash, Write, Skill
---

Read `AGENTS.md`, then `docs/ui-review.md`, and do exactly what it says for the screens you are given: capture
them (section 1; `pnpm serve:test` must already be running, so if nothing answers on port 3300 say so and
stop), run the three lenses one after the other (section 2), and join them into one report (section 3).

If the Design plugin's skills are available to you, load each with its lens and use its method as well:
`design:design-critique`, `design:accessibility-review` (held to WCAG 2.2, not 2.1) and `design:ux-copy`. The
checklists in `docs/ui-review.md` are the standard either way.

For a screen of step 10, write the report to `docs/review/`. For a feature, return the report as your answer, for
the pull request. Write no other file and change no code: the fixes are the caller's.
