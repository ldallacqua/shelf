# 00 Sign in and sign up

The pilot of [the UI/UX review](../ui-review.md). Captured on c231fc7, 13 Nov 2026, with `pnpm ui:capture sign-in
sign-up` against `pnpm serve:test`: sign-in `open` and `wrong-password`; sign-up `open`, `handle-kept`, `filled` and
`email-taken`; each at 390 and 1440, light and dark, English and Portuguese. Lenses run: critique, accessibility and
words, each as a Claude Code subagent following its section of the procedure, with the Design plugin's
`design-critique`, `accessibility-review` (held to WCAG 2.2) and `ux-copy` skills. The findings were joined and
the main ones checked against the code; `email-taken` was captured after the lenses ran, to confirm 2.

axe-core found no violations in any capture. Every finding below is something axe can't see.

## Findings

IDs are the lenses' own (C critique, A accessibility, T words); one row where lenses found the same thing.

| # | IDs | Severity | Where | What | Why | Fix | Effort |
| - | --- | -------- | ----- | ---- | --- | --- | ------ |
| 1 | A5 | Blocker | Every page (shell): Skip to content, while focused | Shown, the skip link has no padding: 94 by 20 pixels, over the logo link. Tailwind 4's `not-sr-only` sets `padding: 0` and comes after `px-4 py-2`. Only keyboard users see it, so the harm is small; it is a Blocker by the letter of the scale. | 2.5.8 target size (20px tall, overlapping another target) | `skip-link.tsx`: add `focus-visible:px-4 focus-visible:py-2` after `focus-visible:not-sr-only` (about 126 by 36) | S |
| 2 | C1, A1, T5 | High | Sign-up, after Create my shelf is refused (email taken, handle taken meanwhile, too many, failed); every width. Seen in `email-taken` | The reason appears in one box above Your name. The person is at the button, about 800px below on a phone, so nothing they can see changes but the button's words going back. No field is marked invalid or described by the reason, and focus is lost while the form was busy. "Sign in instead" is not a link. Empty or short fields get the browser's own bubble, in the browser's language. | Nielsen 1 and 9; 3.3.1 and 3.3.3 met only in words (not at the field, not tied to it); 2.4.3 | Each field's trouble under its field, as Handle already does: `emailTaken`/`emailInvalid` under Email (with "Sign in" as a link), `passwordLength` under Password (`PasswordField` gains an `error` prop), `handleTaken`/`handleInvalid` in Handle's status line; `aria-invalid` and `aria-describedby`; focus the first wrong field. Only `tooMany`, `failed`, `notSetUp` stay in a box, above the button, focused (`tabIndex={-1}`). `noValidate`, with empty, short and invalid said the same way, in the page's language | M |
| 3 | C2 | High | Sign-in, `wrong-password`, every width | Someone who forgot their password has nowhere to go: "Try again", then "Too many tries". That passwords can't be reset is said only on sign-up, long before it matters. | Nielsen 9 and 10; spec 11 (no reset but `pnpm account:password`) | Now: say under the form (or in `Account.wrong` from the second miss) that passwords can't be reset by email yet, and what to do. Later, the owner's call: a way back in (a contact route, or a reset once email exists) | S now, L later |
| 4 | C3, A4 | Medium | Sign-up, `open` and `handle-kept`: Create my shelf | Disabled while the handle is empty or wrong, dimmed, with no reason, and out of the Tab order (focus goes from the visibility choice to the footer). On a phone, the reason is 600px above the dead button. | Nielsen 1 and 9; 3.3.1, 3.3.3 | Disable only while busy. Pressed with a blocked handle: focus Handle, marked invalid, whose status line says what is wrong (and says "At least 3 characters" when empty) | S |
| 5 | A2 | Medium | Sign-in, `wrong-password` | The reason is in a box, not tied to the fields; moving focus to the cleared password can cut the alert short; a second wrong try leaves the same text, so nothing new is announced. `tooMany` and `failed` leave focus nowhere. | 4.1.3, 3.3.1 | Alert with an id; while wrong, both fields `aria-invalid` and Password described by it; clear `trouble` on submit so a repeat is announced; focus the alert for other troubles | M |
| 6 | C4 | Medium | Sign-in's error box; sign-up's dashed note and Handle's problem line | Errors look calmer than notes: the error box is an outline in the fields' own border, no icon, and wider than the fields (616 vs 424px). The reassuring note uses a dashed border, which `fieldClass` keeps for "wrong". Handle's success line has a check icon; its problem line has none. The note sits two blocks from the password it is about. | Nielsen 4 and 9; `ui/field.tsx` (wrong is the dashed border) | One notice in `src/ui`: trouble (icon, solid strong border) and note (info), at the form's width; used by sign-in, sign-up and consent, and later the pages that draw the same box by hand (platforms, desktop, saves). `CircleAlert` on Handle's problem line. The note's words join the password hint | M |
| 7 | C5, A7 | Medium | Header and footer, on both pages | The visitor's ways in link to the page already open, unmarked. On sign-up the loudest thing on the first screen is the header's filled "Create your shelf", which reloads the same page. The footer's "Sign in" carries `from=` the current page, so signing in from it on sign-up or sign-in lands back there. | First look; Nielsen 4 and 8; `aria-current` (2.4.8 is AAA) | On `/sign-in` and `/sign-up`, leave out the link to the page itself and draw the other plainly, with the path read inside `<Suspense>`; `aria-current="page"` where a link to the current page stays; `AccountLink` sends no `from` from those two pages | M |
| 8 | A3 | Medium | Sign-up, typing in Your name | Handle follows the name and its status line is a live region, so each key in Your name is followed by speech about the handle ("At least 3 characters", "Checking…", "Free to take"). | 4.1.3 (spoken out of context) | `aria-live="off"` while the handle still follows the name; `aria-busy` while checking, so only the settled answer is spoken | S |
| 9 | T1 | Medium | Sign-up, pt-BR: the note above the button | "Ainda não dá para **trocar** a senha por e-mail" reads as "you can't change your password", which is false (Settings has "Trocar a senha"). The English means reset. | Same meaning, not word for word; same word for the same thing | `SignUp.noReset` PT: "Ainda não dá para redefinir a senha por e-mail, então guarde a sua num lugar seguro." | S |
| 10 | T2 | Medium | Sign-up: Handle's hint; from the code, `Account.handle.shape` and `SignUp.errors.handleInvalid` | "Lowercase letters" lets in ã, ç and é, which the handle refuses; someone typing "joão" isn't told why. `handleInvalid` points at "the hint under it", which the status line has replaced by then. Shared with Settings. | Clear; an error says how to fix it | `Account.handle.hint` EN "Your shelf's address: 3 to 24 letters without accents, digits or hyphens." PT "O endereço da sua estante: de 3 a 24 letras sem acento, dígitos ou hifens." `Account.handle.shape` EN "Only digits and letters without accents, with single hyphens between them." PT "Só dígitos e letras sem acento, com hifens simples entre eles." `SignUp.errors.handleInvalid` EN "That handle cannot be used. Use 3 to 24 letters without accents, digits or single hyphens." PT "Esse identificador não pode ser usado. Use de 3 a 24 letras sem acento, dígitos ou hifens simples." | S |
| 11 | T3 | Medium | Both pages, pt-BR: "Identificador" | Sounds technical; "nome de usuário" is the usual word in Brazil, and the sign-in label is where it hurts (the hint that explains it is only on sign-up). | Natural to a Brazilian; no jargon | A choice of term for the owner. If taken: PT only, `Account.emailOrHandle` "E-mail ou nome de usuário", `Account.wrong`, `Account.handle.label`, `SignUp.errors.handleTaken`, and the other keys that name it (`Account.handle.yours`, `AccountPage.handleMoves`, `AccountPage.errors.handleTaken`, `Settings.pages.profile.description`, `Privacy.sections.account.body`, `Library.noShelf.body`) | S |
| 12 | T4 | Low | Sign-up: Who can see your shelf | Never says the choice can be changed later, which it can (Settings; the FAQ answers it). | Lower the stakes at a decision | New `SignUp.visibilityLater`, drawn by `sign-up.tsx` under the choice (not inside the shared component): EN "You can change this later in Settings." PT "Dá para mudar isso depois, em Configurações." | S |
| 13 | T6 | Low | Sign-up, from the code: three accounts an hour from one address | PT "nesta hora" means "right now", not "in the last hour"; the English "this hour" is off for a rolling hour. | Same meaning, natural | `SignUp.errors.tooMany` EN "Too many shelves were created from here in the last hour. Try again later." PT "Muitas estantes foram criadas daqui na última hora. Tente de novo mais tarde." | S |
| 14 | A6 | Low | Sign-up: the Public and Private radios | Each radio's name is its whole card, title and paragraph, read in full at each arrow. | Best practice (4.1.2 met) | `visibility-choice.tsx`: `aria-labelledby` the title, `aria-describedby` the body; the label still wraps the card | S |
| 15 | C7 | Low | Sign-up `open`: Handle's hint, the Public and Private cards; 1440 pt-BR and 390 en | A last word alone on a line: "hifens.", "privada.", "hyphens.", "yours." | Line breaks; the longer Portuguese | `text-pretty` on Handle's hint and on the card body in `VisibilityChoice` | S |
| 16 | C6 | Low | Both pages at 1440 | The form is a column on the left and two thirds of the first screen is empty wall; the page that asks for an email in exchange for a shelf shows no game and no shelf. | Nothing lost in empty space at 1440; it reads as games (ADR 002) | At 1024px and up, a lit shelf of a few covers beside sign-up, from the landing page's example shelf. A new element: its own design pass and story | L |

## What works

- One column, labels above the fields, one main action per form; sign-in fits one phone screen in both languages.
  The waiting form has the live one's shape, so nothing moves when it arrives.
- Handle follows the name until typed, shows `/u/` as part of the address, is checked as you type with a ghost
  (never words or a spinner) and says its state in words, with `aria-invalid` and a dashed border, not color alone.
- A wrong password keeps the email or handle and focuses the cleared password; no puzzle, paste works, the show
  toggle is `aria-pressed` with a name that stays; every field has `autocomplete` (1.3.5, 3.3.7, 3.3.8).
- Every input has a visible label and its hint tied with `aria-describedby`; the radios are native, in a fieldset
  with a legend, and the whole card is the target. Focus order is logical and every stop draws the 2px ring.
- Every color pair here is in the contrast test, in both themes and every colorway; inline links are underlined.
- The words are calm and honest ("To sign in with. Nothing is sent to it."); buttons start with a verb; the
  Portuguese is natural nearly everywhere ("De graça", "Ainda não tem estante? Crie uma").

## Not checked

- Screen-reader speech: 5 and 8 are reasoned from the code, not heard.
- States without a scene: sign-in's too many, failed and not set up; sign-up's handle taken meanwhile, too many,
  failed; the busy buttons; the browser's own validation bubbles; both pages signed in; the assistant's sign-in.
- 200% zoom, 320 CSS pixels (1.4.10), text spacing (1.4.12), Windows forced colors (the radio's dot is a
  background color, which forced colors drops).
- Shift+Tab under the sticky header (2.4.11; `globals.css` has no `scroll-padding-top`): to check on screen 01,
  where pages are long. The phone menu on these pages.
- Other products (GitHub, Linear, GOV.UK) were cited from memory, not opened.

## For the review itself

- The scale says a failed AA criterion is a Blocker; 1 shows that can rank a small, rare harm above 2 and 3. The
  owner may want "Blocker" kept for what stops a task, and failed criteria as at least High.
- `email-taken` was added to the capture after the lenses ran; later screens should capture their refusals too.

## Chosen to fix

(The owner's choice, then each finding's outcome.)
