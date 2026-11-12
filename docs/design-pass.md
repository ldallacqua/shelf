# The design pass

Every change anyone can see gets this pass before its code (AGENTS.md, "A change anyone can
see"). It is written for every agent and person: an agent that has design tools of its own may
run them as well, but these checklists are the standard, and the pull request says which parts
ran and what they changed.

## 1. Look at it

- Open how two or three good products do the same thing, in a browser: layout is seen, not read.
  Note what couldn't be opened (a sign-in, a paywall) rather than guess at it.
- Read guidance on the question at hand (Nielsen Norman Group, WCAG's own pages, the platform's
  guidelines), and say in the spec's section what the design was based on.
- Look at Shelf as it is now, as the person the change is for (a new account, a visitor, the
  owner on a phone), before changing it.

## 2. Critique

For the current version and then the new one:

- **First look:** what draws the eye first, and is that the right thing? Is the purpose clear in
  two seconds?
- **Use:** can the person do what they came for? Any step that could go? Is every control
  obviously a control, and every state (chosen, done, waiting, failed) said in words as well as
  shown?
- **Hierarchy:** one clear reading order, one main action per screen, the right things emphasized,
  space used to group.
- **Consistency:** built from `src/ui` and the tokens; the same thing looks and behaves the same
  everywhere; words match the rest of the product (Organize, Settings, Shelf for Windows).
- **Every state:** empty, loading (ghosts, never words), partly done, done, failed, a phone, both
  themes, both languages, reduced motion.

Write the findings down (what, how bad, the fix) and act on them before calling it done.

## 3. Accessibility: WCAG 2.2 AA

- **Perceivable:** every image that says something has alternative text, and decoration is
  hidden; structure is semantic (headings in order, lists as lists, a group of choices in a
  `fieldset` with a `legend`); text contrast 4.5:1 (3:1 large), controls and graphics 3:1; a
  new text-on-background pair is added to the contrast test (`src/ui/tokens/tokens.test.ts`).
- **Operable:** everything a pointer can do, the keyboard can; focus order follows reading order;
  focus is always the 2px accent ring; targets at least 24 by 24 pixels; nothing moves without a
  calm version under reduced motion.
- **Understandable:** labels and instructions on every input; an error says what happened and how
  to fix it, in place; nothing changes on focus alone.
- **Robust:** every control has a name, a role and a state (`aria-pressed`, `aria-current`,
  `aria-checked` through native inputs where possible); a change made out of sight is announced
  (`role="status"`, or focus moved to the new heading).
- **Checked, not assumed:** run axe-core over the pages touched in both themes
  (`@axe-core/playwright` in a headless Chromium script, against `pnpm dev` with `SHELF_MOCKS=1`),
  then go through them with the keyboard alone.

## 4. Copy

- **Clear:** say exactly what happens; no jargon; the same word for the same thing everywhere.
- **Short:** the fewest words that carry the whole meaning; one idea a sentence.
- **Useful:** a button starts with a verb and names its outcome ("Place my games", not "Go");
  an empty state says what goes there, why it's empty and how to start; an error says what
  happened, why, and what to do.
- **Shelf's voice:** plain, concrete and calm; no hype, no exclamation marks; the person is "you"
  on the site and "I" in the spec.
- **Both languages:** English first, then Brazilian Portuguese with the same meaning, not word
  for word; watch the longer Portuguese in buttons and narrow places.
