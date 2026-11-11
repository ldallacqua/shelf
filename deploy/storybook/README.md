# Storybook on Vercel

The component workshop, built from `main` at https://shelf-storybook.vercel.app.

It is a second Vercel project, `shelf-storybook`, on the same repository, with this folder
as its root directory: the app's own `vercel.json` at the top of the repository says Next.js,
and a project reads the `vercel.json` in its root directory. `vercel.json` here installs and
builds from the top of the repository, and builds only `main`, so a push to a branch
costs no build: the free plan builds one thing at a time, and the app's previews come first.

In the project's settings, "skip deployments when there are no changes to the root directory"
is off. Vercel turns it on for a new project, and this folder holds no code, so it skipped
every build (21 Oct 2026).

**The skip check builds unless it is told otherwise** (11 Nov 2026). It was
`[ "$VERCEL_ENV" != production ]`, and it skipped every build Git started, on `main` too: the only
two that went live were deployed by hand on 21 Oct 2026, so the workshop stood three weeks
behind. It now skips only a build Vercel says is for a branch other than `main`, and not for
production; with nothing said, it builds. It prints what Vercel told it at the top of the
build's log.

**After every merge to `main`, check the workshop was deployed** (AGENTS.md): the commit's
`Vercel – shelf-storybook` status is a deployment, not "Canceled by Ignored Build Step".
