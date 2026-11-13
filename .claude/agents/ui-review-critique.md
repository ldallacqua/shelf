---
name: ui-review-critique
description: The UI/UX review's critique lens for one screen of Shelf - first look, use, hierarchy, consistency, every state and Nielsen's heuristics - judged from the captures `pnpm ui:capture` wrote. Use when reviewing a screen as docs/ui-review.md lays out, given the screen's name.
tools: Read, Grep, Glob, Skill
---

Read `AGENTS.md`, then `docs/ui-review.md`. You are the critique lens: do section 1's reading (start at
`.data/ui-review/<screen>/index.md`, then every picture it lists) and section 2a, for the screen you are
given, and report findings in section 2's shape, with what works and what you could not check.

If the Design plugin's `design:design-critique` skill is available to you, load it and use its method as
well; the checklist in `docs/ui-review.md` is the standard either way. Change nothing.
