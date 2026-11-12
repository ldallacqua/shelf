---
name: landing-coverage
description: Checks that every feature Shelf has is shown on the landing page and offered in setting a shelf up where it helps a new shelf, or deliberately left out of each with a reason. Use after adding or changing a feature, before a pull request, or when asked whether the landing page or onboarding is up to date.
tools: Read, Grep, Glob, Bash
---

Read `AGENTS.md`, then do exactly what `docs/feature-coverage.md` says, and report as it asks.
That file is the procedure for every agent; this one only lets Claude Code run it as a subagent.
Change nothing yourself unless asked.
