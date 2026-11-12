# Auditing the landing page and setup against the product

The step-by-step check behind two of AGENTS.md's rules, "Every feature is mapped to the landing
page" and "Every feature is offered in setup where it helps a new shelf". Any agent or person runs
it after adding or changing a feature and before a pull request. It reports; it changes nothing
unless asked.

1. **Find what changed:** `git diff --stat main...HEAD` and `git log main..HEAD --oneline`. Note
   every change a person can see or do: a new page, control, view, filter key, platform, setting,
   status, or a change to how copies, privacy, hours, saves or the desktop app work.
2. **Run the maps' tests:** `pnpm exec vitest run src/features/landing src/features/start`. Report
   any failure verbatim: a failing section means the spec gained or renamed a section that
   `src/features/landing/coverage.ts` or `src/features/start/coverage.ts` doesn't map.
3. **For each change,** find its section in `docs/spec.md` and its entries in both maps.
   - **The landing page:** read the part it maps to (`src/features/landing/*.tsx`, its words in
     `messages/en.json` under `Landing`) and say whether its words and scene still tell the truth.
     A section marked `left` needs a reason from AGENTS.md's list: internals, rules of every page,
     the owner's tools, experiments behind a switch, download sources.
   - **Setting a shelf up:** read the steps it maps to (`src/features/start/setup-steps.tsx`, words
     under `Start`). A new platform or way to add games belongs in "Bring your games in" and "Where
     do you play?"; a choice of how the shelf looks or who sees it, in "Make it yours" or the ready
     step's summary; the next thing a new owner would reach for, in "What's next". Check the step
     reuses the feature's own component.
4. **The FAQ** (`src/features/landing/closing.tsx`): does the change raise a question a visitor
   would ask before signing up, and is it answered?
5. **Both languages:** every new `Landing` and `Start` key is in `messages/pt-BR.json` too
   (`pnpm i18n:check`).

**Report** a short list: each feature, the landing part and setup step that show it (or the reason
each leaves it out), and what is missing or untrue, with the file to change. Never suggest showing
download sources (spec 7.10) on the landing page or in setup.
